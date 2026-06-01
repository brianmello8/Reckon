import { db } from "@/lib/db/client";
import { organizations, entities, usageEvents, costAllocations } from "@/lib/db/schema";
import { and, eq, between } from "drizzle-orm";
import { fromZonedTime } from "date-fns-tz";
import { addDays, parseISO, format } from "date-fns";

/**
 * Accounting-period cutoff (Phase 11.1, architecture §6).
 *
 * A period's [period_start, period_end] are LOCAL calendar dates in the org's
 * (or entity's) reporting timezone. The period covers the half-open instant
 * range [local period_start 00:00, local (period_end + 1 day) 00:00) — INCLUSIVE
 * start, EXCLUSIVE end, tz-aware. We never use naive UTC display as the
 * boundary (the classic close bug). Timezone resolution: entity → org → digest.
 */

export function resolveReportingTz(
  entityTz: string | null | undefined,
  orgTz: string | null | undefined,
  digestTz: string
): string {
  return entityTz || orgTz || digestTz;
}

/** The period's exact UTC instant bounds (inclusive start, exclusive end). */
export function periodBoundsUtc(
  periodStart: string,
  periodEnd: string,
  tz: string
): { startUtc: Date; endUtcExclusive: Date } {
  const nextDay = format(addDays(parseISO(periodEnd), 1), "yyyy-MM-dd");
  return {
    startUtc: fromZonedTime(`${periodStart}T00:00:00`, tz),
    endUtcExclusive: fromZonedTime(`${nextDay}T00:00:00`, tz),
  };
}

/** Whether a precise timestamp falls in the period (tz-aware, [start, end)). */
export function timestampInPeriod(
  ts: Date,
  periodStart: string,
  periodEnd: string,
  tz: string
): boolean {
  const { startUtc, endUtcExclusive } = periodBoundsUtc(periodStart, periodEnd, tz);
  return ts.getTime() >= startUtc.getTime() && ts.getTime() < endUtcExclusive.getTime();
}

/**
 * The UTC date range of usage_events buckets for the period. Because buckets
 * are UTC daily aggregates (no sub-day time), each is assigned to exactly ONE
 * period by the local date of its NOON-UTC instant — a deterministic,
 * non-overlapping partition. Boundary buckets carry ≤1-day tz approximation
 * (documented in §6); they are never double-counted across periods.
 */
export function usageBucketRange(
  periodStart: string,
  periodEnd: string,
  tz: string
): { fromDate: string; toDate: string } {
  return {
    fromDate: fromZonedTime(`${periodStart}T12:00:00`, tz).toISOString().slice(0, 10),
    toDate: fromZonedTime(`${periodEnd}T12:00:00`, tz).toISOString().slice(0, 10),
  };
}

/** Resolve the reporting timezone for a period (entity → org → digest). */
export async function getReportingTimezone(
  orgId: string,
  entityId: string | null
): Promise<string> {
  const [org] = await db
    .select({ reporting: organizations.reportingTimezone, digest: organizations.digestTimezone })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  let entityTz: string | null = null;
  if (entityId) {
    const [e] = await db
      .select({ tz: entities.reportingTimezone })
      .from(entities)
      .where(and(eq(entities.id, entityId), eq(entities.orgId, orgId)))
      .limit(1);
    entityTz = e?.tz ?? null;
  }
  return resolveReportingTz(entityTz, org?.reporting ?? null, org?.digest ?? "UTC");
}

/**
 * Deterministic period → usage set. Selects usage_events whose UTC bucket maps
 * into the period (noon-UTC rule). Entity-scoped periods filter to events coded
 * to that entity (via cost_allocations); org-wide periods include all.
 */
export async function getPeriodUsage(
  orgId: string,
  period: { entityId: string | null; periodStart: string; periodEnd: string }
) {
  const tz = await getReportingTimezone(orgId, period.entityId);
  const { fromDate, toDate } = usageBucketRange(period.periodStart, period.periodEnd, tz);

  if (period.entityId) {
    return db
      .selectDistinct({
        id: usageEvents.id,
        timeBucket: usageEvents.timeBucket,
        costUsdMicros: usageEvents.costUsdMicros,
      })
      .from(usageEvents)
      .innerJoin(
        costAllocations,
        and(
          eq(costAllocations.usageEventId, usageEvents.id),
          eq(costAllocations.orgId, usageEvents.orgId),
          eq(costAllocations.entityId, period.entityId)
        )
      )
      .where(and(eq(usageEvents.orgId, orgId), between(usageEvents.timeBucket, fromDate, toDate)));
  }
  return db
    .select({
      id: usageEvents.id,
      timeBucket: usageEvents.timeBucket,
      costUsdMicros: usageEvents.costUsdMicros,
    })
    .from(usageEvents)
    .where(and(eq(usageEvents.orgId, orgId), between(usageEvents.timeBucket, fromDate, toDate)));
}
