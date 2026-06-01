"use server";

import { requireSurface } from "@/lib/auth";
import { withOrgContext } from "@/lib/db/rls";
import { accountingPeriods, entities, organizations } from "@/lib/db/schema";
import { and, eq, desc } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getPeriodUsage, getReportingTimezone } from "@/lib/close/cutoff";

function isValidTz(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export async function getPeriodsView() {
  const user = await requireSurface("finance");
  const data = await withOrgContext(user.orgId, async (tx) => {
    const [org] = await tx
      .select({ reporting: organizations.reportingTimezone, digest: organizations.digestTimezone })
      .from(organizations)
      .where(eq(organizations.id, user.orgId))
      .limit(1);
    const ents = await tx
      .select({ id: entities.id, code: entities.code, name: entities.name, tz: entities.reportingTimezone })
      .from(entities)
      .where(eq(entities.orgId, user.orgId));
    const periods = await tx
      .select({
        id: accountingPeriods.id,
        entityId: accountingPeriods.entityId,
        periodStart: accountingPeriods.periodStart,
        periodEnd: accountingPeriods.periodEnd,
        status: accountingPeriods.status,
        closedAt: accountingPeriods.closedAt,
      })
      .from(accountingPeriods)
      .where(eq(accountingPeriods.orgId, user.orgId))
      .orderBy(desc(accountingPeriods.periodStart));
    return { org, ents, periods };
  });

  // Observed usage + resolved tz per period (deterministic period→usage helper).
  const entName = new Map(data.ents.map((e) => [e.id, `${e.code} · ${e.name}`]));
  const periods = [];
  for (const p of data.periods) {
    const usage = await getPeriodUsage(user.orgId, p);
    const observed = usage.reduce((a, u) => a + BigInt(u.costUsdMicros), 0n);
    const tz = await getReportingTimezone(user.orgId, p.entityId);
    periods.push({
      id: p.id,
      entityId: p.entityId,
      entityName: p.entityId ? entName.get(p.entityId) ?? "Entity" : "Org-wide",
      periodStart: p.periodStart,
      periodEnd: p.periodEnd,
      status: p.status,
      closedAt: p.closedAt ? p.closedAt.toISOString() : null,
      tz,
      observedMicros: observed.toString(),
      eventCount: usage.length,
    });
  }

  return {
    orgReportingTz: data.org?.reporting ?? null,
    digestTz: data.org?.digest ?? "UTC",
    entities: data.ents.map((e) => ({ id: e.id, label: `${e.code} · ${e.name}`, tz: e.tz })),
    periods,
  };
}

const periodSchema = z.object({
  entityId: z.string().uuid().optional().or(z.literal("")),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function savePeriod(input: z.input<typeof periodSchema>) {
  const user = await requireSurface("finance");
  const p = periodSchema.parse(input);
  if (p.periodEnd < p.periodStart) throw new Error("End date must be on/after start date.");
  await withOrgContext(user.orgId, async (tx) =>
    tx.insert(accountingPeriods).values({
      orgId: user.orgId,
      entityId: p.entityId && p.entityId !== "" ? p.entityId : null,
      periodStart: p.periodStart,
      periodEnd: p.periodEnd,
    })
  );
  revalidatePath("/finance/periods");
  return { success: true };
}

export async function setPeriodStatus(id: string, status: "open" | "closed" | "locked") {
  const user = await requireSurface("finance");
  const closing = status === "closed" || status === "locked";
  await withOrgContext(user.orgId, async (tx) =>
    tx
      .update(accountingPeriods)
      .set({
        status,
        closedAt: closing ? new Date() : null,
        closedByUserId: closing ? user.userId : null,
        updatedAt: new Date(),
      })
      .where(and(eq(accountingPeriods.id, id), eq(accountingPeriods.orgId, user.orgId)))
  );
  revalidatePath("/finance/periods");
  return { success: true };
}

export async function deletePeriod(id: string) {
  const user = await requireSurface("finance");
  await withOrgContext(user.orgId, async (tx) =>
    tx.delete(accountingPeriods).where(and(eq(accountingPeriods.id, id), eq(accountingPeriods.orgId, user.orgId)))
  );
  revalidatePath("/finance/periods");
  return { success: true };
}

/** Set the org's reporting timezone, or an entity's (scope = "org" or entityId). */
export async function setReportingTimezone(scope: string, tz: string) {
  const user = await requireSurface("finance");
  if (tz !== "" && !isValidTz(tz)) throw new Error("Not a valid IANA timezone (e.g. America/New_York).");
  await withOrgContext(user.orgId, async (tx) => {
    if (scope === "org") {
      await tx
        .update(organizations)
        .set({ reportingTimezone: tz || null, updatedAt: new Date() })
        .where(eq(organizations.id, user.orgId));
    } else {
      await tx
        .update(entities)
        .set({ reportingTimezone: tz || null, updatedAt: new Date() })
        .where(and(eq(entities.id, scope), eq(entities.orgId, user.orgId)));
    }
  });
  revalidatePath("/finance/periods");
  return { success: true };
}
