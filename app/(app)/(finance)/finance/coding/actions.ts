"use server";

import { requireSurface } from "@/lib/auth";
import { withOrgContext } from "@/lib/db/rls";
import {
  attributionRules,
  costAllocations,
  costAllocationOverrides,
  allocationDrivers,
  organizations,
  glAccounts,
  usageEvents,
  providers,
  usageAttribution,
  agents,
} from "@/lib/db/schema";
import { and, eq, isNull, or, ne } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { inngest } from "@/lib/jobs/client";
import { isBroadCogsRule } from "@/lib/finance/allocate";
import { COGS_CONFIRM_REQUIRED } from "@/lib/finance/constants";

/** Provider slugs + agents, for the rule-match dropdowns. */
export async function getRuleOptions() {
  const user = await requireSurface("finance");
  const providerRows = await withOrgContext(user.orgId, async (tx) =>
    tx.select({ key: providers.key, name: providers.displayName }).from(providers)
  );
  const agentRows = await withOrgContext(user.orgId, async (tx) =>
    tx
      .select({ id: agents.id, name: agents.name })
      .from(agents)
      .where(eq(agents.orgId, user.orgId))
      .orderBy(agents.name)
  );
  const driverRows = await withOrgContext(user.orgId, async (tx) =>
    tx
      .select({ id: allocationDrivers.id, name: allocationDrivers.name, method: allocationDrivers.method })
      .from(allocationDrivers)
      .where(and(eq(allocationDrivers.orgId, user.orgId), eq(allocationDrivers.status, "active")))
      .orderBy(allocationDrivers.name)
  );
  return { providers: providerRows, agents: agentRows, drivers: driverRows };
}

export async function getRules() {
  const user = await requireSurface("finance");
  return withOrgContext(user.orgId, async (tx) =>
    tx
      .select()
      .from(attributionRules)
      .where(eq(attributionRules.orgId, user.orgId))
      .orderBy(attributionRules.priority)
  );
}

const ruleSchema = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  name: z.string().min(1).max(200),
  priority: z.coerce.number().int().min(0).max(100000),
  active: z.coerce.boolean(),
  // match
  provider: z.string().optional().or(z.literal("")),
  model: z.string().optional().or(z.literal("")),
  agentId: z.string().optional().or(z.literal("")),
  workflowId: z.string().optional().or(z.literal("")),
  // assign
  gl_account_id: z.string().optional().or(z.literal("")),
  cost_center_id: z.string().optional().or(z.literal("")),
  allocation_driver_id: z.string().optional().or(z.literal("")),
  entity_id: z.string().optional().or(z.literal("")),
  project_id: z.string().optional().or(z.literal("")),
  product_line_id: z.string().optional().or(z.literal("")),
});

function clean(obj: Record<string, string | undefined>) {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) if (v && v !== "") out[k] = v;
  return out;
}

/**
 * Create/update a rule. Throws COGS_CONFIRM_REQUIRED when an active rule would
 * assign a COGS account with a broad match, unless confirmCogs is passed — the
 * stop-and-ask gate (misclassifying opex as COGS distorts gross margin).
 */
export async function saveRule(
  raw: Record<string, string>,
  confirmCogs = false
) {
  const user = await requireSurface("finance");
  const p = ruleSchema.parse(raw);
  const id = p.id && p.id !== "" ? p.id : null;

  const match = clean({
    provider: p.provider,
    model: p.model,
    agentId: p.agentId,
    workflowId: p.workflowId,
  });
  const assign = clean({
    gl_account_id: p.gl_account_id,
    // A direct cost center and a shared-cost driver both fill the cost-center
    // slot; a driver wins if both are set (and we don't store the redundant CC).
    cost_center_id: p.allocation_driver_id ? "" : p.cost_center_id,
    allocation_driver_id: p.allocation_driver_id,
    entity_id: p.entity_id,
    project_id: p.project_id,
    product_line_id: p.product_line_id,
  });

  if (Object.keys(assign).length === 0) {
    throw new Error("A rule must assign at least one dimension.");
  }

  // COGS stop-and-ask gate.
  if (p.active && assign.gl_account_id) {
    const [gl] = await withOrgContext(user.orgId, async (tx) =>
      tx
        .select({ type: glAccounts.accountType })
        .from(glAccounts)
        .where(
          and(
            eq(glAccounts.id, assign.gl_account_id),
            eq(glAccounts.orgId, user.orgId)
          )
        )
        .limit(1)
    );
    if (isBroadCogsRule(assign, match, gl?.type ?? null) && !confirmCogs) {
      throw new Error(COGS_CONFIRM_REQUIRED);
    }
  }

  await withOrgContext(user.orgId, async (tx) => {
    if (id) {
      const upd = await tx
        .update(attributionRules)
        .set({ name: p.name, priority: p.priority, active: p.active, match, assign, updatedAt: new Date() })
        .where(and(eq(attributionRules.id, id), eq(attributionRules.orgId, user.orgId)))
        .returning({ id: attributionRules.id });
      if (upd.length === 0) throw new Error("Rule not found.");
    } else {
      await tx.insert(attributionRules).values({
        orgId: user.orgId,
        name: p.name,
        priority: p.priority,
        active: p.active,
        match,
        assign,
      });
    }
  });

  await inngest.send({ name: "allocation/recompute.requested", data: { org_id: user.orgId } });
  revalidatePath("/finance/coding");
  return { success: true };
}

export async function setRuleActive(id: string, active: boolean) {
  const user = await requireSurface("finance");
  await withOrgContext(user.orgId, async (tx) =>
    tx
      .update(attributionRules)
      .set({ active, updatedAt: new Date() })
      .where(and(eq(attributionRules.id, id), eq(attributionRules.orgId, user.orgId)))
  );
  await inngest.send({ name: "allocation/recompute.requested", data: { org_id: user.orgId } });
  revalidatePath("/finance/coding");
  return { success: true };
}

export async function deleteRule(id: string) {
  const user = await requireSurface("finance");
  await withOrgContext(user.orgId, async (tx) => {
    // cost_allocations.rule_id references this rule; clear references first.
    await tx
      .update(costAllocations)
      .set({ ruleId: null })
      .where(and(eq(costAllocations.ruleId, id), eq(costAllocations.orgId, user.orgId)));
    await tx
      .delete(attributionRules)
      .where(and(eq(attributionRules.id, id), eq(attributionRules.orgId, user.orgId)));
  });
  await inngest.send({ name: "allocation/recompute.requested", data: { org_id: user.orgId } });
  revalidatePath("/finance/coding");
  return { success: true };
}

/** Uncoded spend (no allocation, or status != coded) grouped by provider/model/agent. */
export async function getNeedsCoding() {
  const user = await requireSurface("finance");
  return withOrgContext(user.orgId, async (tx) => {
    const rows = await tx
      .select({
        eventId: usageEvents.id,
        model: usageEvents.model,
        cost: usageEvents.costUsdMicros,
        providerName: providers.displayName,
        agentName: agents.name,
        status: costAllocations.codingStatus,
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
      .leftJoin(
        usageAttribution,
        and(
          eq(usageAttribution.usageEventId, usageEvents.id),
          eq(usageAttribution.orgId, usageEvents.orgId)
        )
      )
      .leftJoin(agents, eq(agents.id, usageAttribution.agentId))
      .where(
        and(
          eq(usageEvents.orgId, user.orgId),
          or(isNull(costAllocations.id), ne(costAllocations.codingStatus, "coded"))
        )
      );

    const groups = new Map<
      string,
      {
        providerName: string;
        model: string;
        agentName: string | null;
        eventCount: number;
        costMicros: number;
        eventIds: string[];
      }
    >();
    for (const r of rows) {
      const key = `${r.providerName}|${r.model}|${r.agentName ?? ""}`;
      const g =
        groups.get(key) ??
        groups
          .set(key, {
            providerName: r.providerName,
            model: r.model,
            agentName: r.agentName,
            eventCount: 0,
            costMicros: 0,
            eventIds: [],
          })
          .get(key)!;
      g.eventCount += 1;
      g.costMicros += Number(r.cost);
      g.eventIds.push(r.eventId);
    }
    return [...groups.values()].sort((a, b) => b.costMicros - a.costMicros);
  });
}

const codeSchema = z.object({
  eventIds: z.array(z.string().uuid()).min(1),
  gl_account_id: z.string().uuid(),
  cost_center_id: z.string().uuid().optional().or(z.literal("")),
  entity_id: z.string().uuid().optional().or(z.literal("")),
  project_id: z.string().uuid().optional().or(z.literal("")),
  product_line_id: z.string().uuid().optional().or(z.literal("")),
});

/**
 * Manually code a group of uncoded events. Writes durable overrides (so they
 * survive recompute) and the coded cost_allocations rows. A GL account is
 * required — we never code without one.
 */
export async function codeGroup(input: {
  eventIds: string[];
  gl_account_id: string;
  cost_center_id?: string;
  entity_id?: string;
  project_id?: string;
  product_line_id?: string;
}) {
  const user = await requireSurface("finance");
  const p = codeSchema.parse(input);
  const dims = {
    glAccountId: p.gl_account_id,
    costCenterId: p.cost_center_id || null,
    entityId: p.entity_id || null,
    projectId: p.project_id || null,
    productLineId: p.product_line_id || null,
  };

  await withOrgContext(user.orgId, async (tx) => {
    for (const eventId of p.eventIds) {
      await tx
        .insert(costAllocationOverrides)
        .values({ orgId: user.orgId, usageEventId: eventId, ...dims, createdByUserId: user.userId })
        .onConflictDoUpdate({
          target: [costAllocationOverrides.orgId, costAllocationOverrides.usageEventId],
          set: { ...dims, createdByUserId: user.userId, updatedAt: new Date() },
        });
      // cost_allocations allows multiple rows per event (splits), so we
      // delete-then-insert this event's rows rather than upsert (clears any
      // prior split/rule coding; the single override row replaces it).
      await tx
        .delete(costAllocations)
        .where(
          and(
            eq(costAllocations.orgId, user.orgId),
            eq(costAllocations.usageEventId, eventId)
          )
        );
      await tx.insert(costAllocations).values({
        orgId: user.orgId,
        usageEventId: eventId,
        ...dims,
        codingStatus: "coded",
        allocationPct: 10000,
        ruleId: null,
        overridden: true,
      });
    }
  });

  revalidatePath("/finance/coding");
  return { success: true, coded: p.eventIds.length };
}

export async function recomputeAllocationsAction() {
  const user = await requireSurface("finance");
  await inngest.send({ name: "allocation/recompute.requested", data: { org_id: user.orgId } });
  return { success: true };
}

// --- Shared-cost drivers (Phase 9.3) ---

export async function getDrivers() {
  const user = await requireSurface("finance");
  const [org] = await withOrgContext(user.orgId, async (tx) =>
    tx
      .select({ rounding: organizations.roundingCostCenterId })
      .from(organizations)
      .where(eq(organizations.id, user.orgId))
      .limit(1)
  );
  const drivers = await withOrgContext(user.orgId, async (tx) =>
    tx
      .select()
      .from(allocationDrivers)
      .where(eq(allocationDrivers.orgId, user.orgId))
      .orderBy(allocationDrivers.name)
  );
  return { drivers, roundingCostCenterId: org?.rounding ?? null };
}

const driverSchema = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  name: z.string().min(1).max(200),
  method: z.enum(["usage_tokens", "headcount", "revenue", "fixed_pct", "even"]),
  config: z.string(),
});

export async function saveDriver(raw: Record<string, string>) {
  const user = await requireSurface("finance");
  const p = driverSchema.parse(raw);
  let config: unknown;
  try {
    config = p.config.trim() === "" ? {} : JSON.parse(p.config);
  } catch {
    throw new Error("Config must be valid JSON.");
  }
  if (typeof config !== "object" || config === null || Array.isArray(config)) {
    throw new Error("Config must be a JSON object.");
  }
  const id = p.id && p.id !== "" ? p.id : null;

  await withOrgContext(user.orgId, async (tx) => {
    if (id) {
      const upd = await tx
        .update(allocationDrivers)
        .set({ name: p.name, method: p.method, config, updatedAt: new Date() })
        .where(and(eq(allocationDrivers.id, id), eq(allocationDrivers.orgId, user.orgId)))
        .returning({ id: allocationDrivers.id });
      if (upd.length === 0) throw new Error("Driver not found.");
    } else {
      await tx
        .insert(allocationDrivers)
        .values({ orgId: user.orgId, name: p.name, method: p.method, config });
    }
  });
  await inngest.send({ name: "allocation/recompute.requested", data: { org_id: user.orgId } });
  revalidatePath("/finance/coding");
  return { success: true };
}

export async function setDriverStatus(id: string, status: "active" | "archived") {
  const user = await requireSurface("finance");
  await withOrgContext(user.orgId, async (tx) =>
    tx
      .update(allocationDrivers)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(allocationDrivers.id, id), eq(allocationDrivers.orgId, user.orgId)))
  );
  await inngest.send({ name: "allocation/recompute.requested", data: { org_id: user.orgId } });
  revalidatePath("/finance/coding");
  return { success: true };
}

export async function setRoundingCostCenter(costCenterId: string) {
  const user = await requireSurface("finance");
  await withOrgContext(user.orgId, async (tx) =>
    tx
      .update(organizations)
      .set({ roundingCostCenterId: costCenterId || null, updatedAt: new Date() })
      .where(eq(organizations.id, user.orgId))
  );
  await inngest.send({ name: "allocation/recompute.requested", data: { org_id: user.orgId } });
  revalidatePath("/finance/coding");
  return { success: true };
}
