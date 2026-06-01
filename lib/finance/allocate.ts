import { db } from "@/lib/db/client";
import {
  usageEvents,
  usageAttribution,
  providers,
  organizations,
  attributionRules,
  allocationDrivers,
  costAllocations,
  costAllocationOverrides,
} from "@/lib/db/schema";
import { and, eq, asc } from "drizzle-orm";

/**
 * Account determination + shared-cost allocation (Phase 9.2/9.3, §3e/§3f).
 *
 * LIGHT, deterministic, ordered, overridable mapping from usage to finance
 * dimensions. Output lives in cost_allocations (derived, recomputable); usage
 * is never mutated. Manual overrides live in cost_allocation_overrides so a
 * rebuild re-applies them. A shared event (a rule assigns a driver instead of a
 * single cost center) splits into MULTIPLE cost_allocations rows whose
 * allocation_pct (basis points, 10000 = 100%) sum to EXACTLY 10000.
 */

const SUPPORTED_MATCH = ["provider", "model", "agentId", "workflowId"] as const;
const FULL_PCT = 10000; // basis points

const OTHER_DIMS = [
  ["glAccountId", "gl_account_id"],
  ["entityId", "entity_id"],
  ["projectId", "project_id"],
  ["productLineId", "product_line_id"],
] as const;

export type EventCtx = {
  usageEventId: string;
  providerSlug: string;
  model: string;
  agentId: string | null;
  workflowId: string | null;
  costMicros: number;
  tokens: number;
};

export type RuleRow = {
  id: string;
  match: Record<string, unknown>;
  assign: Record<string, unknown>;
};

export type OverrideRow = {
  glAccountId: string | null;
  costCenterId: string | null;
  entityId: string | null;
  projectId: string | null;
  productLineId: string | null;
};

type DriverRow = {
  id: string;
  method: "usage_tokens" | "headcount" | "revenue" | "fixed_pct" | "even";
  config: Record<string, unknown>;
};

// Per-event coding before any split into cost-center rows.
export type BaseAllocation = {
  glAccountId: string | null;
  costCenterId: string | null;
  driverId: string | null;
  entityId: string | null;
  projectId: string | null;
  productLineId: string | null;
  codingStatus: "coded" | "needs_coding" | "suspense";
  ruleId: string | null;
  overridden: boolean;
};

function ctxValue(ctx: EventCtx, key: string): string | null {
  switch (key) {
    case "provider":
      return ctx.providerSlug;
    case "model":
      return ctx.model;
    case "agentId":
      return ctx.agentId;
    case "workflowId":
      return ctx.workflowId;
    default:
      return null;
  }
}

export function ruleMatches(match: Record<string, unknown>, ctx: EventCtx): boolean {
  for (const [key, raw] of Object.entries(match)) {
    if (raw === undefined || raw === null || raw === "") continue;
    if (!SUPPORTED_MATCH.includes(key as (typeof SUPPORTED_MATCH)[number])) return false;
    if (ctxValue(ctx, key) !== String(raw)) return false;
  }
  return true;
}

/**
 * Per-event base coding. Override wins; otherwise rules apply in priority order,
 * first match assigns and later rules fill only still-unset fields. The
 * cost-center slot can be filled by a direct cost center OR a driver (shared),
 * whichever a rule sets first.
 */
export function computeBaseAllocation(
  ctx: EventCtx,
  rules: RuleRow[],
  override: OverrideRow | undefined,
  suspenseGlAccountId: string | null
): BaseAllocation {
  if (override) {
    return {
      glAccountId: override.glAccountId,
      costCenterId: override.costCenterId,
      driverId: null,
      entityId: override.entityId,
      projectId: override.projectId,
      productLineId: override.productLineId,
      codingStatus: override.glAccountId ? "coded" : "needs_coding",
      ruleId: null,
      overridden: true,
    };
  }

  const acc: Record<string, string | null> = {
    glAccountId: null,
    entityId: null,
    projectId: null,
    productLineId: null,
  };
  let costCenterId: string | null = null;
  let driverId: string | null = null;
  let ruleId: string | null = null;

  for (const rule of rules) {
    if (!ruleMatches(rule.match, ctx)) continue;
    // Cost-center slot: direct cost center or a driver, first wins.
    if (!costCenterId && !driverId) {
      const cc = rule.assign["cost_center_id"];
      const drv = rule.assign["allocation_driver_id"];
      if (typeof cc === "string" && cc !== "") {
        costCenterId = cc;
        if (ruleId === null) ruleId = rule.id;
      } else if (typeof drv === "string" && drv !== "") {
        driverId = drv;
        if (ruleId === null) ruleId = rule.id;
      }
    }
    for (const [camel, snake] of OTHER_DIMS) {
      if (acc[camel]) continue;
      const v = rule.assign[snake];
      if (typeof v === "string" && v !== "") {
        acc[camel] = v;
        if (ruleId === null) ruleId = rule.id;
      }
    }
  }

  let codingStatus: BaseAllocation["codingStatus"];
  if (acc.glAccountId) codingStatus = "coded";
  else if (suspenseGlAccountId) {
    acc.glAccountId = suspenseGlAccountId;
    codingStatus = "suspense";
  } else codingStatus = "needs_coding";

  return {
    glAccountId: acc.glAccountId,
    costCenterId,
    driverId,
    entityId: acc.entityId,
    projectId: acc.projectId,
    productLineId: acc.productLineId,
    codingStatus,
    ruleId,
    overridden: false,
  };
}

/**
 * Distribute `total` across weighted targets so the parts sum EXACTLY to total
 * (largest-remainder). Residual goes to roundingKey if it's a target, else to
 * the largest fractional remainders. Falls back to an even split when all
 * weights are zero. Never drops a unit.
 */
export function distribute(
  targets: { key: string; weight: number }[],
  total: number,
  roundingKey: string | null
): Map<string, number> {
  const out = new Map<string, number>();
  if (targets.length === 0) return out;
  const sum = targets.reduce((a, t) => a + Math.max(0, t.weight), 0);

  const exacts =
    sum > 0
      ? targets.map((t) => ({ key: t.key, exact: (Math.max(0, t.weight) / sum) * total }))
      : targets.map((t) => ({ key: t.key, exact: total / targets.length }));

  let assigned = 0;
  for (const e of exacts) {
    const f = Math.floor(e.exact);
    out.set(e.key, f);
    assigned += f;
  }
  const residual = total - assigned;
  if (roundingKey && out.has(roundingKey)) {
    out.set(roundingKey, (out.get(roundingKey) ?? 0) + residual);
  } else {
    const byRem = [...exacts].sort(
      (a, b) => b.exact - Math.floor(b.exact) - (a.exact - Math.floor(a.exact))
    );
    for (let i = 0; i < residual; i++) {
      const k = byRem[i % byRem.length].key;
      out.set(k, (out.get(k) ?? 0) + 1);
    }
  }
  return out;
}

/** Resolve a driver to weighted target cost centers. Throws if external numbers
 * (headcount/revenue) aren't supplied — we never fabricate them. */
function driverTargets(
  driver: DriverRow,
  ccTokens: Map<string, number>
): { key: string; weight: number }[] {
  const cfg = driver.config ?? {};
  switch (driver.method) {
    case "even": {
      const ids = (cfg.cost_center_ids as string[]) ?? [];
      return ids.map((id) => ({ key: id, weight: 1 }));
    }
    case "fixed_pct": {
      const w = (cfg.weights as Record<string, number>) ?? {};
      return Object.entries(w).map(([key, weight]) => ({ key, weight: Number(weight) || 0 }));
    }
    case "usage_tokens": {
      const ids = (cfg.cost_center_ids as string[]) ?? [...ccTokens.keys()];
      return ids.map((id) => ({ key: id, weight: ccTokens.get(id) ?? 0 }));
    }
    case "headcount":
    case "revenue": {
      const v = (cfg.values as Record<string, number>) ?? {};
      const entries = Object.entries(v);
      if (entries.length === 0) {
        throw new Error(
          `${driver.method} driver has no supplied values — refusing to fabricate weights`
        );
      }
      return entries.map(([key, weight]) => ({ key, weight: Number(weight) || 0 }));
    }
  }
}

async function loadInputs(orgId: string) {
  const [org] = await db
    .select({
      suspense: organizations.suspenseGlAccountId,
      rounding: organizations.roundingCostCenterId,
    })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  const ruleRows = await db
    .select({ id: attributionRules.id, match: attributionRules.match, assign: attributionRules.assign })
    .from(attributionRules)
    .where(and(eq(attributionRules.orgId, orgId), eq(attributionRules.active, true)))
    .orderBy(asc(attributionRules.priority));
  const rules: RuleRow[] = ruleRows.map((r) => ({
    id: r.id,
    match: (r.match ?? {}) as Record<string, unknown>,
    assign: (r.assign ?? {}) as Record<string, unknown>,
  }));

  const driverRows = await db
    .select({ id: allocationDrivers.id, method: allocationDrivers.method, config: allocationDrivers.config })
    .from(allocationDrivers)
    .where(eq(allocationDrivers.orgId, orgId));
  const drivers = new Map<string, DriverRow>(
    driverRows.map((d) => [d.id, { id: d.id, method: d.method, config: (d.config ?? {}) as Record<string, unknown> }])
  );

  return {
    suspense: org?.suspense ?? null,
    rounding: org?.rounding ?? null,
    rules,
    drivers,
  };
}

/** Active rules + suspense, for the inline-at-ingest path. */
export async function loadAllocationRules(orgId: string) {
  const { suspense, rules } = await loadInputs(orgId);
  return { suspense, rules };
}

async function loadEventContexts(orgId: string): Promise<EventCtx[]> {
  const rows = await db
    .select({
      usageEventId: usageEvents.id,
      providerSlug: providers.key,
      model: usageEvents.model,
      agentId: usageAttribution.agentId,
      workflowId: usageAttribution.workflowId,
      cost: usageEvents.costUsdMicros,
      input: usageEvents.inputTokens,
      output: usageEvents.outputTokens,
    })
    .from(usageEvents)
    .innerJoin(providers, eq(providers.id, usageEvents.providerId))
    .leftJoin(
      usageAttribution,
      and(
        eq(usageAttribution.usageEventId, usageEvents.id),
        eq(usageAttribution.orgId, usageEvents.orgId)
      )
    )
    .where(eq(usageEvents.orgId, orgId));
  return rows.map((r) => ({
    usageEventId: r.usageEventId,
    providerSlug: r.providerSlug,
    model: r.model,
    agentId: r.agentId,
    workflowId: r.workflowId,
    costMicros: Number(r.cost),
    tokens: Number(r.input) + Number(r.output),
  }));
}

type AllocRow = typeof costAllocations.$inferInsert;

/**
 * Recompute cost_allocations for an org. Two passes: (1) base-code every event
 * and accumulate each cost center's directly-attributed token volume; (2) emit
 * rows — a direct event one row at 10000 bps, a shared event several rows split
 * by its driver and summing to exactly 10000 bps. Idempotent drop-and-rebuild;
 * overrides survive.
 */
export async function recomputeOrgAllocations(orgId: string): Promise<{
  events: number;
  rows: number;
  coded: number;
  needsCoding: number;
  suspense: number;
}> {
  const { suspense, rounding, rules, drivers } = await loadInputs(orgId);
  const overrideRows = await db
    .select()
    .from(costAllocationOverrides)
    .where(eq(costAllocationOverrides.orgId, orgId));
  const overrides = new Map<string, OverrideRow>(overrideRows.map((o) => [o.usageEventId, o]));
  const contexts = await loadEventContexts(orgId);

  // Pass 1: base allocations + per-CC direct token volume.
  const bases = new Map<string, BaseAllocation>();
  const ccTokens = new Map<string, number>();
  for (const ctx of contexts) {
    const base = computeBaseAllocation(ctx, rules, overrides.get(ctx.usageEventId), suspense);
    bases.set(ctx.usageEventId, base);
    if (base.costCenterId && !base.driverId) {
      ccTokens.set(base.costCenterId, (ccTokens.get(base.costCenterId) ?? 0) + ctx.tokens);
    }
  }

  // Pass 2: emit rows.
  const counts = { events: 0, rows: 0, coded: 0, needsCoding: 0, suspense: 0 };
  let batch: AllocRow[] = [];
  const flush = async () => {
    if (batch.length === 0) return;
    await db.insert(costAllocations).values(batch);
    batch = [];
  };

  await db.delete(costAllocations).where(eq(costAllocations.orgId, orgId));

  for (const ctx of contexts) {
    const base = bases.get(ctx.usageEventId)!;
    counts.events += 1;
    if (base.codingStatus === "coded") counts.coded += 1;
    else if (base.codingStatus === "suspense") counts.suspense += 1;
    else counts.needsCoding += 1;

    const common = {
      orgId,
      usageEventId: ctx.usageEventId,
      glAccountId: base.glAccountId,
      entityId: base.entityId,
      projectId: base.projectId,
      productLineId: base.productLineId,
      codingStatus: base.codingStatus,
      ruleId: base.ruleId,
      overridden: base.overridden,
    };

    let split: Map<string, number> | null = null;
    if (base.driverId) {
      const driver = drivers.get(base.driverId);
      if (driver) {
        try {
          let targets = driverTargets(driver, ccTokens);
          // Ensure the rounding CC can absorb residual.
          if (rounding && !targets.some((t) => t.key === rounding)) {
            targets = [...targets, { key: rounding, weight: 0 }];
          }
          if (targets.length > 0) split = distribute(targets, FULL_PCT, rounding);
        } catch {
          split = null; // e.g. headcount/revenue with no supplied values
        }
      }
    }

    if (split) {
      for (const [ccId, pct] of split) {
        if (pct <= 0) continue; // drop zero-share targets; remaining sum to 10000
        batch.push({ ...common, costCenterId: ccId, allocationPct: pct });
        counts.rows += 1;
      }
    } else {
      batch.push({ ...common, costCenterId: base.costCenterId, allocationPct: FULL_PCT });
      counts.rows += 1;
    }
    if (batch.length >= 500) await flush();
  }
  await flush();

  return counts;
}

/**
 * Inline coding at ingest. Purely additive and safe: writes a single direct row
 * only when the event has NO allocation yet AND a rule/suspense codes it.
 * Driver-shared events are deferred to recompute (which has the period token
 * shares). Never touches existing rows (overrides, splits).
 */
export async function allocateEventInline(
  ctx: EventCtx,
  orgId: string,
  rules: RuleRow[],
  suspenseGlAccountId: string | null
): Promise<void> {
  const existing = await db
    .select({ id: costAllocations.id })
    .from(costAllocations)
    .where(
      and(eq(costAllocations.orgId, orgId), eq(costAllocations.usageEventId, ctx.usageEventId))
    )
    .limit(1);
  if (existing.length > 0) return;

  const base = computeBaseAllocation(ctx, rules, undefined, suspenseGlAccountId);
  if (base.driverId) return; // split happens in recompute
  if (base.codingStatus === "needs_coding") return; // additive — nothing to write

  await db.insert(costAllocations).values({
    orgId,
    usageEventId: ctx.usageEventId,
    glAccountId: base.glAccountId,
    costCenterId: base.costCenterId,
    entityId: base.entityId,
    projectId: base.projectId,
    productLineId: base.productLineId,
    codingStatus: base.codingStatus,
    allocationPct: FULL_PCT,
    ruleId: base.ruleId,
    overridden: false,
  });
}

/**
 * COGS guard for the stop-and-ask: a COGS GL account assigned by a BROAD match
 * (empty or provider-only) misclassifies a lot of spend as COGS.
 */
export function isBroadCogsRule(
  assign: Record<string, unknown>,
  match: Record<string, unknown>,
  glAccountType: string | null
): boolean {
  if (glAccountType !== "cogs") return false;
  const constraints = Object.entries(match)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k]) => k);
  return constraints.length === 0 || (constraints.length === 1 && constraints[0] === "provider");
}
