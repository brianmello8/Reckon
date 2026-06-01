import { withOrgContext } from "@/lib/db/rls";
import {
  usageEvents,
  costAllocations,
  costCenters,
  glAccounts,
  entities,
  projects,
  productLines,
  providers,
  developers,
  budgets,
} from "@/lib/db/schema";
import { and, eq, between, sql, isNull, desc, inArray } from "drizzle-orm";

/**
 * Finance showback (Phase 9.4, §3g). Read-only. Rollups read cost_allocations
 * via a LEFT JOIN from usage_events, so EVERY event is represented (uncoded
 * events fall into an "uncoded" bucket) and totals reconcile to raw usage.
 *
 * Allocated cost = usage_event.cost × allocation_pct ÷ 10000. We sum the
 * WEIGHTED value (cost × pct) per group and divide by 10000 once at the end, so
 * a shared event's split rows recombine to its exact cost and the grand total
 * equals raw usage exactly.
 */

const WEIGHTED = sql<string>`coalesce(sum(${usageEvents.costUsdMicros} * coalesce(${costAllocations.allocationPct}, 10000)), 0)`;
const TEN_K = 10000n;

function div(weighted: string): bigint {
  return BigInt(weighted) / TEN_K;
}

type DimDim = "cost_center" | "gl_account" | "entity" | "project" | "product_line";
const DIM_COL = {
  cost_center: costAllocations.costCenterId,
  gl_account: costAllocations.glAccountId,
  entity: costAllocations.entityId,
  project: costAllocations.projectId,
  product_line: costAllocations.productLineId,
} as const;

export type CcNode = {
  id: string;
  code: string;
  name: string;
  parentId: string | null;
  directMicros: string;
  rolledMicros: string;
  children: CcNode[];
};

export async function getShowback(orgId: string, from: string, to: string) {
  return withOrgContext(orgId, async (tx) => {
    // Grand total via the join = raw usage exactly.
    const [grand] = await tx
      .select({ weighted: WEIGHTED })
      .from(usageEvents)
      .leftJoin(
        costAllocations,
        and(
          eq(costAllocations.usageEventId, usageEvents.id),
          eq(costAllocations.orgId, usageEvents.orgId)
        )
      )
      .where(and(eq(usageEvents.orgId, orgId), between(usageEvents.timeBucket, from, to)));
    const grandMicros = div(grand?.weighted ?? "0");

    const weightedByDim = async (dim: DimDim) => {
      const rows = await tx
        .select({ key: DIM_COL[dim], weighted: WEIGHTED })
        .from(usageEvents)
        .leftJoin(
          costAllocations,
          and(
            eq(costAllocations.usageEventId, usageEvents.id),
            eq(costAllocations.orgId, usageEvents.orgId)
          )
        )
        .where(and(eq(usageEvents.orgId, orgId), between(usageEvents.timeBucket, from, to)))
        .groupBy(DIM_COL[dim]);
      return rows;
    };

    // Cost centers → tree rollup.
    const ccRows = await weightedByDim("cost_center");
    const ccWeighted = new Map<string | null, bigint>();
    for (const r of ccRows) ccWeighted.set(r.key, BigInt(r.weighted));
    const ccDefs = await tx
      .select({ id: costCenters.id, code: costCenters.code, name: costCenters.name, parentId: costCenters.parentId })
      .from(costCenters)
      .where(eq(costCenters.orgId, orgId));
    const tree = buildCcTree(ccDefs, ccWeighted);
    const uncodedCcMicros = (ccWeighted.get(null) ?? 0n) / TEN_K;

    // GL accounts (+ account_type rollup).
    const glRows = await weightedByDim("gl_account");
    const glDefs = await tx
      .select({ id: glAccounts.id, code: glAccounts.code, name: glAccounts.name, accountType: glAccounts.accountType })
      .from(glAccounts)
      .where(eq(glAccounts.orgId, orgId));
    const glDefMap = new Map(glDefs.map((g) => [g.id, g]));
    const byGl: { id: string | null; code: string; name: string; accountType: string; micros: string }[] = [];
    const byType = new Map<string, bigint>();
    for (const r of glRows) {
      const def = r.key ? glDefMap.get(r.key) : undefined;
      const type = def?.accountType ?? "uncoded";
      byType.set(type, (byType.get(type) ?? 0n) + BigInt(r.weighted));
      byGl.push({
        id: r.key,
        code: def?.code ?? "—",
        name: def?.name ?? "Uncoded",
        accountType: type,
        micros: (BigInt(r.weighted) / TEN_K).toString(),
      });
    }
    byGl.sort((a, b) => Number(BigInt(b.micros) - BigInt(a.micros)));

    const simple = async (dim: DimDim, defs: { id: string; code: string; name: string }[]) => {
      const rows = await weightedByDim(dim);
      const map = new Map(defs.map((d) => [d.id, d]));
      return rows
        .map((r) => ({
          id: r.key,
          code: r.key ? map.get(r.key)?.code ?? "—" : "—",
          name: r.key ? map.get(r.key)?.name ?? "Unknown" : "Uncoded",
          micros: (BigInt(r.weighted) / TEN_K).toString(),
        }))
        .sort((a, b) => Number(BigInt(b.micros) - BigInt(a.micros)));
    };

    const entityDefs = await tx
      .select({ id: entities.id, code: entities.code, name: entities.name })
      .from(entities)
      .where(eq(entities.orgId, orgId));
    const plDefs = await tx
      .select({ id: productLines.id, code: productLines.code, name: productLines.name })
      .from(productLines)
      .where(eq(productLines.orgId, orgId));

    return {
      grandMicros: grandMicros.toString(),
      costCenterTree: tree,
      uncodedCostCenterMicros: uncodedCcMicros.toString(),
      byGlAccount: byGl,
      byAccountType: [...byType.entries()]
        .map(([accountType, w]) => ({ accountType, micros: (w / TEN_K).toString() }))
        .sort((a, b) => Number(BigInt(b.micros) - BigInt(a.micros))),
      byEntity: await simple("entity", entityDefs),
      byProductLine: await simple("product_line", plDefs),
    };
  });
}

function buildCcTree(
  defs: { id: string; code: string; name: string; parentId: string | null }[],
  weighted: Map<string | null, bigint>
): CcNode[] {
  const nodes = new Map<string, CcNode>();
  for (const d of defs)
    nodes.set(d.id, {
      id: d.id,
      code: d.code,
      name: d.name,
      parentId: d.parentId,
      directMicros: ((weighted.get(d.id) ?? 0n) / TEN_K).toString(),
      rolledMicros: "0",
      children: [],
    });
  const roots: CcNode[] = [];
  for (const n of nodes.values()) {
    if (n.parentId && nodes.has(n.parentId)) nodes.get(n.parentId)!.children.push(n);
    else roots.push(n);
  }
  // Rolled = direct + sum of children rolled (post-order).
  const rollWeighted = (n: CcNode): bigint => {
    let total = weighted.get(n.id) ?? 0n;
    for (const c of n.children) total += rollWeighted(c);
    n.rolledMicros = (total / TEN_K).toString();
    return total;
  };
  for (const r of roots) rollWeighted(r);
  const sortRec = (ns: CcNode[]) => {
    ns.sort((a, b) => a.code.localeCompare(b.code));
    ns.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
}

/** Contributing usage for one dimension value (drill-through). Developer names
 * only when the viewer also holds operations access. */
export async function getDrill(
  orgId: string,
  dim: DimDim,
  scopeId: string | null,
  from: string,
  to: string,
  canSeeDevelopers: boolean
) {
  return withOrgContext(orgId, async (tx) => {
    const col = DIM_COL[dim];
    const rows = await tx
      .select({
        day: usageEvents.timeBucket,
        model: usageEvents.model,
        providerName: providers.displayName,
        developerName: canSeeDevelopers ? developers.displayName : sql<string | null>`null`,
        allocated: sql<string>`coalesce(${usageEvents.costUsdMicros} * coalesce(${costAllocations.allocationPct}, 10000) / 10000, 0)`,
      })
      .from(usageEvents)
      .innerJoin(providers, eq(providers.id, usageEvents.providerId))
      .leftJoin(
        costAllocations,
        and(
          eq(costAllocations.usageEventId, usageEvents.id),
          eq(costAllocations.orgId, usageEvents.orgId)
        )
      )
      .leftJoin(developers, eq(developers.id, usageEvents.developerId))
      .where(
        and(
          eq(usageEvents.orgId, orgId),
          between(usageEvents.timeBucket, from, to),
          scopeId ? eq(col, scopeId) : isNull(col)
        )
      )
      .orderBy(desc(usageEvents.timeBucket))
      .limit(200);
    return rows.map((r) => ({
      day: r.day,
      model: r.model,
      providerName: r.providerName,
      developerName: r.developerName ?? null,
      allocatedMicros: r.allocated,
    }));
  });
}

export function periodRange(period: string): { from: string; to: string } {
  if (/^\d{4}$/.test(period)) return { from: `${period}-01-01`, to: `${period}-12-31` };
  const [y, m] = period.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${period}-01`, to: `${period}-${String(last).padStart(2, "0")}` };
}

/** Budget-vs-actual for a period. Cost-center actuals roll up the subtree. */
export async function getBudgetVsActual(orgId: string, period: string) {
  const { from, to } = periodRange(period);
  return withOrgContext(orgId, async (tx) => {
    const budgetRows = await tx
      .select()
      .from(budgets)
      .where(and(eq(budgets.orgId, orgId), eq(budgets.period, period)));
    if (budgetRows.length === 0) return { period, rows: [], from, to };

    // Cost-center subtree map (for rolled-up cost-center actuals).
    const ccDefs = await tx
      .select({ id: costCenters.id, code: costCenters.code, name: costCenters.name, parentId: costCenters.parentId })
      .from(costCenters)
      .where(eq(costCenters.orgId, orgId));
    const childrenOf = new Map<string, string[]>();
    for (const c of ccDefs) {
      if (!c.parentId) continue;
      (childrenOf.get(c.parentId) ?? childrenOf.set(c.parentId, []).get(c.parentId)!).push(c.id);
    }
    const subtree = (id: string): string[] => {
      const out = [id];
      for (const ch of childrenOf.get(id) ?? []) out.push(...subtree(ch));
      return out;
    };
    const nameOf = new Map(ccDefs.map((c) => [c.id, `${c.code} · ${c.name}`]));
    const glDefs = await tx
      .select({ id: glAccounts.id, code: glAccounts.code, name: glAccounts.name })
      .from(glAccounts)
      .where(eq(glAccounts.orgId, orgId));
    const glName = new Map(glDefs.map((g) => [g.id, `${g.code} · ${g.name}`]));
    const prDefs = await tx
      .select({ id: projects.id, code: projects.code, name: projects.name })
      .from(projects)
      .where(eq(projects.orgId, orgId));
    const prName = new Map(prDefs.map((p) => [p.id, `${p.code} · ${p.name}`]));

    const weightedForScope = async (dim: DimDim, ids: string[]): Promise<bigint> => {
      if (ids.length === 0) return 0n;
      const [row] = await tx
        .select({ weighted: WEIGHTED })
        .from(usageEvents)
        .leftJoin(
          costAllocations,
          and(
            eq(costAllocations.usageEventId, usageEvents.id),
            eq(costAllocations.orgId, usageEvents.orgId)
          )
        )
        .where(
          and(
            eq(usageEvents.orgId, orgId),
            between(usageEvents.timeBucket, from, to),
            inArray(DIM_COL[dim], ids)
          )
        );
      return BigInt(row?.weighted ?? "0");
    };

    const now = new Date();
    const isCurrentMonth = period === `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
    const dayOfMonth = now.getUTCDate();

    const rows = [];
    for (const b of budgetRows) {
      let label: string;
      let weighted: bigint;
      if (b.scopeType === "cost_center") {
        label = nameOf.get(b.scopeId) ?? "Cost center";
        weighted = await weightedForScope("cost_center", subtree(b.scopeId));
      } else if (b.scopeType === "gl_account") {
        label = glName.get(b.scopeId) ?? "GL account";
        weighted = await weightedForScope("gl_account", [b.scopeId]);
      } else {
        label = prName.get(b.scopeId) ?? "Project";
        weighted = await weightedForScope("project", [b.scopeId]);
      }
      const actual = weighted / TEN_K;
      const budget = b.amountMicros;
      const variance = actual - budget;
      const variancePct = budget > 0n ? Number((variance * 10000n) / budget) / 100 : null;
      const paceMicros =
        isCurrentMonth && daysInMonth > 0
          ? (budget * BigInt(dayOfMonth)) / BigInt(daysInMonth)
          : null;
      rows.push({
        id: b.id,
        scopeType: b.scopeType,
        scopeId: b.scopeId,
        label,
        budgetMicros: budget.toString(),
        actualMicros: actual.toString(),
        varianceMicros: variance.toString(),
        variancePct,
        paceMicros: paceMicros !== null ? paceMicros.toString() : null,
        overPace: paceMicros !== null ? actual > paceMicros : null,
      });
    }
    return { period, from, to, rows };
  });
}
