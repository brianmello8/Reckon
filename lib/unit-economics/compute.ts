import { withOrgContext } from "@/lib/db/rls";
import {
  usageEvents,
  usageAttribution,
  costAllocations,
  glAccounts,
  productLines,
  workflows,
  workflowRuns,
  outcomeMetrics,
  outcomeValues,
} from "@/lib/db/schema";
import { and, eq, between, sql, isNotNull, gte, lte } from "drizzle-orm";

/**
 * Unit economics (Phase 12.2, architecture §5h / playbook §7a). Pairs AI cost
 * (the denominator Reckon already has) with customer-supplied outcomes (the
 * numerator from §5g) to compute cost-per-unit, AI-COGS-%-of-revenue, and
 * gross-margin impact. Read/compute only.
 *
 * UNITS. Cost is bigint micros ($1 = 1e6). Outcome `value` is stored scaled ×1e6
 * for ALL units (§5g), so a money outcome's stored value IS micros. Therefore:
 *   cost-per-unit ($/unit) ×1e6 = costMicros × 1e6 / valueScaled  → micros
 *   AI-COGS % of revenue (bps) = cogsMicros × 10000 / revenueScaled
 *   margin micros               = revenueScaled − cogsMicros
 * The ×1e6 scaling cancels in the ratio, so dollars-per-unit and percentages
 * come out right with pure integer math (no float for money).
 *
 * RECONCILIATION. All cost is read from usage_events: per-workflow/customer via
 * usage_attribution, per-product-line/COGS via cost_allocations weighted by
 * allocation_pct (÷10000). The allocated grand total equals raw usage exactly
 * (LEFT JOIN keeps uncoded events), and we return a reconciliation block proving it.
 */

const TEN_K = 10000n;
const SCALE = 1_000_000n;
// cost × allocation_pct, summed; ÷10000 once at the end (mirrors finance showback).
const WEIGHTED = sql<string>`coalesce(sum(${usageEvents.costUsdMicros} * coalesce(${costAllocations.allocationPct}, 10000)), 0)`;
const WEIGHTED_COGS = sql<string>`coalesce(sum(case when ${glAccounts.accountType} = 'cogs' then ${usageEvents.costUsdMicros} * coalesce(${costAllocations.allocationPct}, 10000) else 0 end), 0)`;

// ── Pure helpers (unit-tested) ──────────────────────────────────────────────────

/** Cost per unit in micros (dollars × 1e6). Null when there's no outcome to
 * divide by — we never fabricate a ratio. */
export function costPerUnitMicros(costMicros: bigint, valueScaled: bigint): bigint | null {
  if (valueScaled <= 0n) return null;
  return (costMicros * SCALE) / valueScaled;
}

/** A micros-over-scaled ratio in basis points (10000 = 100%). Null if no denom. */
export function ratioBps(numeratorMicros: bigint, denomScaled: bigint): number | null {
  if (denomScaled <= 0n) return null;
  return Number((numeratorMicros * 10000n) / denomScaled);
}

/** Is this metric's unit a revenue (money) unit, eligible as the COGS-% / margin
 * denominator? */
export function isRevenueUnit(unit: string): boolean {
  const u = unit.toLowerCase();
  return u.startsWith("usd") || u.includes("revenue") || ["mrr", "arr", "gmv", "bookings"].includes(u);
}

// ── Query ────────────────────────────────────────────────────────────────────────

type MetricDef = { id: string; key: string; name: string; unit: string; grain: string; direction: string };

export async function getUnitEconomics(orgId: string, from: string, to: string) {
  return withOrgContext(orgId, async (tx) => {
    // Metric definitions + their summed values for the window, by grain ref.
    const metrics = (await tx
      .select({
        id: outcomeMetrics.id,
        key: outcomeMetrics.key,
        name: outcomeMetrics.name,
        unit: outcomeMetrics.unit,
        grain: outcomeMetrics.grain,
        direction: outcomeMetrics.direction,
      })
      .from(outcomeMetrics)
      .where(eq(outcomeMetrics.orgId, orgId))) as MetricDef[];
    const metricById = new Map(metrics.map((m) => [m.id, m]));

    // Outcome values whose period falls inside the cost window (no fabrication).
    const valueRows = await tx
      .select({
        metricId: outcomeValues.metricId,
        grainRef: outcomeValues.grainRef,
        value: sql<string>`coalesce(sum(${outcomeValues.value}), 0)`,
      })
      .from(outcomeValues)
      .where(
        and(
          eq(outcomeValues.orgId, orgId),
          gte(outcomeValues.periodStart, from),
          lte(outcomeValues.periodEnd, to)
        )
      )
      .groupBy(outcomeValues.metricId, outcomeValues.grainRef);
    // (grain, grainRef) → list of {metric, valueScaled}
    const valuesByGrainRef = new Map<string, { metric: MetricDef; valueScaled: bigint }[]>();
    let orgRevenueScaled = 0n;
    const revenueByGrainRef = new Map<string, bigint>(); // key `${grain}:${ref}`
    for (const v of valueRows) {
      const m = metricById.get(v.metricId);
      if (!m) continue;
      const valueScaled = BigInt(v.value);
      const key = `${m.grain}:${v.grainRef}`;
      (valuesByGrainRef.get(key) ?? valuesByGrainRef.set(key, []).get(key)!).push({ metric: m, valueScaled });
      if (isRevenueUnit(m.unit)) {
        if (m.grain === "org") orgRevenueScaled += valueScaled;
        else revenueByGrainRef.set(key, (revenueByGrainRef.get(key) ?? 0n) + valueScaled);
      }
    }
    const metricsFor = (grain: string, ref: string) =>
      (valuesByGrainRef.get(`${grain}:${ref}`) ?? []).map((x) => ({
        key: x.metric.key,
        name: x.metric.name,
        unit: x.metric.unit,
        valueScaled: x.valueScaled.toString(),
        costPerUnitMicros: null as string | null, // filled by caller with the grain cost
      }));

    // ── Reconciliation anchor: raw usage total + allocated grand total ──────────
    const [rawRow] = await tx
      .select({ raw: sql<string>`coalesce(sum(${usageEvents.costUsdMicros}), 0)` })
      .from(usageEvents)
      .where(and(eq(usageEvents.orgId, orgId), between(usageEvents.timeBucket, from, to)));
    const usageTotalMicros = BigInt(rawRow?.raw ?? "0");

    const [allocRow] = await tx
      .select({ weighted: WEIGHTED, weightedCogs: WEIGHTED_COGS })
      .from(usageEvents)
      .leftJoin(
        costAllocations,
        and(eq(costAllocations.usageEventId, usageEvents.id), eq(costAllocations.orgId, usageEvents.orgId))
      )
      .leftJoin(glAccounts, eq(glAccounts.id, costAllocations.glAccountId))
      .where(and(eq(usageEvents.orgId, orgId), between(usageEvents.timeBucket, from, to)));
    const allocatedTotalMicros = BigInt(allocRow?.weighted ?? "0") / TEN_K;
    const orgCogsMicros = BigInt(allocRow?.weightedCogs ?? "0") / TEN_K;

    // ── Per product line: total cost + COGS-coded cost, with revenue/margin ─────
    const plRows = await tx
      .select({
        productLineId: costAllocations.productLineId,
        weighted: WEIGHTED,
        weightedCogs: WEIGHTED_COGS,
      })
      .from(usageEvents)
      .leftJoin(
        costAllocations,
        and(eq(costAllocations.usageEventId, usageEvents.id), eq(costAllocations.orgId, usageEvents.orgId))
      )
      .leftJoin(glAccounts, eq(glAccounts.id, costAllocations.glAccountId))
      .where(and(eq(usageEvents.orgId, orgId), between(usageEvents.timeBucket, from, to)))
      .groupBy(costAllocations.productLineId);
    const plDefs = await tx
      .select({ id: productLines.id, code: productLines.code, name: productLines.name })
      .from(productLines)
      .where(eq(productLines.orgId, orgId));
    const plDefMap = new Map(plDefs.map((p) => [p.id, p]));
    const byProductLine = plRows
      .filter((r) => r.productLineId) // uncoded has no product-line economics
      .map((r) => {
        const def = plDefMap.get(r.productLineId!);
        const costMicros = BigInt(r.weighted) / TEN_K;
        const cogsMicros = BigInt(r.weightedCogs) / TEN_K;
        const revenueScaled = revenueByGrainRef.get(`product_line:${r.productLineId}`) ?? 0n;
        const hasRevenue = revenueScaled > 0n;
        const ms = metricsFor("product_line", r.productLineId!).map((m) => ({
          ...m,
          costPerUnitMicros: costPerUnitMicros(costMicros, BigInt(m.valueScaled))?.toString() ?? null,
        }));
        return {
          id: r.productLineId!,
          code: def?.code ?? "—",
          name: def?.name ?? "Unknown",
          costMicros: costMicros.toString(),
          cogsMicros: cogsMicros.toString(),
          revenueMicros: hasRevenue ? revenueScaled.toString() : null,
          cogsPctBps: ratioBps(cogsMicros, revenueScaled),
          marginMicros: hasRevenue ? (revenueScaled - cogsMicros).toString() : null,
          marginPctBps: ratioBps(revenueScaled - cogsMicros, revenueScaled),
          hasRevenue,
          metrics: ms,
        };
      })
      .sort((a, b) => Number(BigInt(b.costMicros) - BigInt(a.costMicros)));

    // ── Per customer cost (usage_attribution) + cost per unit ───────────────────
    const custRows = await tx
      .select({
        customerRef: usageAttribution.customerRef,
        cost: sql<string>`coalesce(sum(${usageEvents.costUsdMicros}), 0)`,
      })
      .from(usageAttribution)
      .innerJoin(usageEvents, eq(usageEvents.id, usageAttribution.usageEventId))
      .where(
        and(
          eq(usageAttribution.orgId, orgId),
          isNotNull(usageAttribution.customerRef),
          between(usageEvents.timeBucket, from, to)
        )
      )
      .groupBy(usageAttribution.customerRef);
    let attributedCustomerMicros = 0n;
    const customers = custRows
      .map((r) => {
        const costMicros = BigInt(r.cost);
        attributedCustomerMicros += costMicros;
        const ms = metricsFor("customer", r.customerRef!).map((m) => ({
          ...m,
          costPerUnitMicros: costPerUnitMicros(costMicros, BigInt(m.valueScaled))?.toString() ?? null,
        }));
        return { ref: r.customerRef!, costMicros: costMicros.toString(), metrics: ms };
      })
      .sort((a, b) => Number(BigInt(b.costMicros) - BigInt(a.costMicros)));

    // ── Per workflow cost + run count + cost per run + cost per unit ────────────
    const wfCostRows = await tx
      .select({
        workflowId: usageAttribution.workflowId,
        cost: sql<string>`coalesce(sum(${usageEvents.costUsdMicros}), 0)`,
      })
      .from(usageAttribution)
      .innerJoin(usageEvents, eq(usageEvents.id, usageAttribution.usageEventId))
      .where(
        and(
          eq(usageAttribution.orgId, orgId),
          isNotNull(usageAttribution.workflowId),
          between(usageEvents.timeBucket, from, to)
        )
      )
      .groupBy(usageAttribution.workflowId);
    const wfCost = new Map(wfCostRows.map((r) => [r.workflowId!, BigInt(r.cost)]));
    const runCountRows = await tx
      .select({ workflowId: workflowRuns.workflowId, n: sql<number>`count(*)`.as("n") })
      .from(workflowRuns)
      .where(
        and(
          eq(workflowRuns.orgId, orgId),
          gte(workflowRuns.startedAt, new Date(`${from}T00:00:00.000Z`)),
          lte(workflowRuns.startedAt, new Date(`${to}T23:59:59.999Z`))
        )
      )
      .groupBy(workflowRuns.workflowId);
    const runCount = new Map(runCountRows.map((r) => [r.workflowId, Number(r.n)]));
    const wfDefs = await tx
      .select({ id: workflows.id, name: workflows.name })
      .from(workflows)
      .where(eq(workflows.orgId, orgId));
    let attributedWorkflowMicros = 0n;
    const wfList = wfDefs
      .map((w) => {
        const costMicros = wfCost.get(w.id) ?? 0n;
        attributedWorkflowMicros += costMicros;
        const runs = runCount.get(w.id) ?? 0;
        const ms = metricsFor("workflow", w.id).map((m) => ({
          ...m,
          costPerUnitMicros: costPerUnitMicros(costMicros, BigInt(m.valueScaled))?.toString() ?? null,
        }));
        return {
          id: w.id,
          name: w.name,
          costMicros: costMicros.toString(),
          runCount: runs,
          costPerRunMicros: runs > 0 ? (costMicros / BigInt(runs)).toString() : null,
          metrics: ms,
        };
      })
      .filter((w) => BigInt(w.costMicros) > 0n || w.metrics.length > 0)
      .sort((a, b) => Number(BigInt(b.costMicros) - BigInt(a.costMicros)));

    // ── Board number: org-wide AI COGS % of revenue + margin ────────────────────
    const board = {
      revenueMicros: orgRevenueScaled > 0n ? orgRevenueScaled.toString() : null,
      cogsMicros: orgCogsMicros.toString(),
      cogsPctBps: ratioBps(orgCogsMicros, orgRevenueScaled),
      marginMicros: orgRevenueScaled > 0n ? (orgRevenueScaled - orgCogsMicros).toString() : null,
      marginPctBps: ratioBps(orgRevenueScaled - orgCogsMicros, orgRevenueScaled),
      hasRevenue: orgRevenueScaled > 0n,
    };

    return {
      window: { from, to },
      board,
      byProductLine,
      customers,
      workflows: wfList,
      reconciliation: {
        usageTotalMicros: usageTotalMicros.toString(),
        allocatedTotalMicros: allocatedTotalMicros.toString(),
        matches: usageTotalMicros === allocatedTotalMicros,
        attributedCustomerMicros: attributedCustomerMicros.toString(),
        attributedWorkflowMicros: attributedWorkflowMicros.toString(),
      },
    };
  });
}
