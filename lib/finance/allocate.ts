import { db } from "@/lib/db/client";
import {
  usageEvents,
  usageAttribution,
  providers,
  organizations,
  attributionRules,
  costAllocations,
  costAllocationOverrides,
} from "@/lib/db/schema";
import { and, eq, asc } from "drizzle-orm";

/**
 * Account determination (Phase 9.2, architecture §3e).
 *
 * A LIGHT, deterministic, ordered, overridable mapping from usage to finance
 * dimensions — NOT a general rules engine. Output lives in cost_allocations
 * (derived, recomputable); usage_events is never mutated. Manual overrides live
 * in cost_allocation_overrides so a full rebuild re-applies them, so
 * cost_allocations is fully derivable from usage_events + rules + overrides.
 *
 * We never guess a GL account: unmapped spend routes to suspense (if an org
 * suspense account is configured) or needs_coding, never to a silent guess.
 */

// Match keys we can actually evaluate from event data. A rule that constrains
// on anything else (e.g. environment) can't be verified, so it does NOT match
// (never guess that an unverifiable constraint holds).
const SUPPORTED_MATCH = ["provider", "model", "agentId", "workflowId"] as const;

const DIMENSION_KEYS = [
  ["glAccountId", "gl_account_id"],
  ["costCenterId", "cost_center_id"],
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
};

export type RuleRow = {
  id: string;
  priority: number;
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

export type Allocation = {
  glAccountId: string | null;
  costCenterId: string | null;
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

/** A rule matches when every specified (truthy) match constraint holds. */
export function ruleMatches(match: Record<string, unknown>, ctx: EventCtx): boolean {
  for (const [key, raw] of Object.entries(match)) {
    if (raw === undefined || raw === null || raw === "") continue; // unconstrained
    if (!SUPPORTED_MATCH.includes(key as (typeof SUPPORTED_MATCH)[number])) {
      return false; // can't verify this constraint → don't match
    }
    if (ctxValue(ctx, key) !== String(raw)) return false;
  }
  return true;
}

/**
 * Compute the coding for one event. Override wins outright; otherwise rules are
 * applied in priority order (lower first), first match assigns and later rules
 * fill only still-unset fields. No GL account → suspense (if configured) or
 * needs_coding.
 */
export function computeAllocation(
  ctx: EventCtx,
  rules: RuleRow[],
  override: OverrideRow | undefined,
  suspenseGlAccountId: string | null
): Allocation {
  if (override) {
    return {
      glAccountId: override.glAccountId,
      costCenterId: override.costCenterId,
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
    costCenterId: null,
    entityId: null,
    projectId: null,
    productLineId: null,
  };
  let ruleId: string | null = null;

  for (const rule of rules) {
    if (!ruleMatches(rule.match, ctx)) continue;
    for (const [camel, snake] of DIMENSION_KEYS) {
      if (acc[camel]) continue; // fill unset only — never overwrite
      const v = rule.assign[snake];
      if (typeof v === "string" && v !== "") {
        acc[camel] = v;
        if (ruleId === null) ruleId = rule.id; // first rule to contribute
      }
    }
  }

  let codingStatus: Allocation["codingStatus"];
  if (acc.glAccountId) {
    codingStatus = "coded";
  } else if (suspenseGlAccountId) {
    acc.glAccountId = suspenseGlAccountId;
    codingStatus = "suspense";
  } else {
    codingStatus = "needs_coding";
  }

  return {
    glAccountId: acc.glAccountId,
    costCenterId: acc.costCenterId,
    entityId: acc.entityId,
    projectId: acc.projectId,
    productLineId: acc.productLineId,
    codingStatus,
    ruleId,
    overridden: false,
  };
}

async function loadInputs(orgId: string) {
  const [org] = await db
    .select({ suspense: organizations.suspenseGlAccountId })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  const ruleRows = await db
    .select({
      id: attributionRules.id,
      priority: attributionRules.priority,
      match: attributionRules.match,
      assign: attributionRules.assign,
    })
    .from(attributionRules)
    .where(and(eq(attributionRules.orgId, orgId), eq(attributionRules.active, true)))
    .orderBy(asc(attributionRules.priority));

  const rules: RuleRow[] = ruleRows.map((r) => ({
    id: r.id,
    priority: r.priority,
    match: (r.match ?? {}) as Record<string, unknown>,
    assign: (r.assign ?? {}) as Record<string, unknown>,
  }));

  return { suspense: org?.suspense ?? null, rules };
}

/** Active rules + suspense, for the inline-at-ingest path. */
export async function loadAllocationRules(orgId: string) {
  return loadInputs(orgId);
}

async function loadEventContexts(orgId: string): Promise<EventCtx[]> {
  const rows = await db
    .select({
      usageEventId: usageEvents.id,
      providerSlug: providers.key,
      model: usageEvents.model,
      agentId: usageAttribution.agentId,
      workflowId: usageAttribution.workflowId,
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
  }));
}

/**
 * Recompute cost_allocations for an entire org: drop the org's rows and rebuild
 * one per usage_event from rules + overrides + suspense. Idempotent; overrides
 * survive because they live in their own table and are re-applied here.
 */
export async function recomputeOrgAllocations(orgId: string): Promise<{
  total: number;
  coded: number;
  needsCoding: number;
  suspense: number;
}> {
  const { suspense, rules } = await loadInputs(orgId);
  const overrideRows = await db
    .select()
    .from(costAllocationOverrides)
    .where(eq(costAllocationOverrides.orgId, orgId));
  const overrides = new Map<string, OverrideRow>(
    overrideRows.map((o) => [o.usageEventId, o])
  );
  const contexts = await loadEventContexts(orgId);

  await db.delete(costAllocations).where(eq(costAllocations.orgId, orgId));

  const counts = { total: 0, coded: 0, needsCoding: 0, suspense: 0 };
  const batch: (typeof costAllocations.$inferInsert)[] = [];
  const flush = async () => {
    if (batch.length === 0) return;
    await db.insert(costAllocations).values(batch);
    batch.length = 0;
  };

  for (const ctx of contexts) {
    const a = computeAllocation(ctx, rules, overrides.get(ctx.usageEventId), suspense);
    batch.push({
      orgId,
      usageEventId: ctx.usageEventId,
      glAccountId: a.glAccountId,
      costCenterId: a.costCenterId,
      entityId: a.entityId,
      projectId: a.projectId,
      productLineId: a.productLineId,
      codingStatus: a.codingStatus,
      ruleId: a.ruleId,
      overridden: a.overridden,
    });
    counts.total += 1;
    if (a.codingStatus === "coded") counts.coded += 1;
    else if (a.codingStatus === "suspense") counts.suspense += 1;
    else counts.needsCoding += 1;
    if (batch.length >= 500) await flush();
  }
  await flush();

  return counts;
}

/**
 * Inline coding at ingest. Additive: writes a cost_allocations row only when a
 * rule or suspense actually codes the event (no rule → no row, unchanged
 * behavior). Overrides are not consulted here (a freshly ingested event has
 * none yet).
 */
export async function allocateEventInline(
  ctx: EventCtx,
  orgId: string,
  rules: RuleRow[],
  suspenseGlAccountId: string | null
): Promise<void> {
  const a = computeAllocation(ctx, rules, undefined, suspenseGlAccountId);
  if (a.codingStatus === "needs_coding") return; // additive — nothing to write
  await db
    .insert(costAllocations)
    .values({
      orgId,
      usageEventId: ctx.usageEventId,
      glAccountId: a.glAccountId,
      costCenterId: a.costCenterId,
      entityId: a.entityId,
      projectId: a.projectId,
      productLineId: a.productLineId,
      codingStatus: a.codingStatus,
      ruleId: a.ruleId,
      overridden: false,
    })
    .onConflictDoUpdate({
      target: [costAllocations.orgId, costAllocations.usageEventId],
      set: {
        glAccountId: a.glAccountId,
        costCenterId: a.costCenterId,
        entityId: a.entityId,
        projectId: a.projectId,
        productLineId: a.productLineId,
        codingStatus: a.codingStatus,
        ruleId: a.ruleId,
        computedAt: new Date(),
      },
      // Never clobber a manual override with an inline rule result.
      setWhere: eq(costAllocations.overridden, false),
    });
}

/**
 * COGS guard for the stop-and-ask: a rule that assigns a COGS GL account with a
 * BROAD match (empty, or provider-only — nothing narrowing it to a model/agent/
 * workflow) misclassifies a lot of spend as COGS and distorts gross margin.
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
  return (
    constraints.length === 0 ||
    (constraints.length === 1 && constraints[0] === "provider")
  );
}
