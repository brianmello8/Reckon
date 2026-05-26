import { withOrgContext } from "@/lib/db/rls";
import { usageEvents, developers, providers } from "@/lib/db/schema";
import { eq, and, between, sql, desc, isNull } from "drizzle-orm";

/**
 * Daily totals for the entire org.
 */
export async function getDailyTotalsForOrg(
  orgId: string,
  from: string,
  to: string
) {
  return withOrgContext(orgId, async (tx) => {
    return tx
      .select({
        date: usageEvents.timeBucket,
        totalCostUsdMicros: sql<bigint>`sum(${usageEvents.costUsdMicros})`.as(
          "total_cost"
        ),
        totalInputTokens: sql<bigint>`sum(${usageEvents.inputTokens})`.as(
          "total_input"
        ),
        totalOutputTokens: sql<bigint>`sum(${usageEvents.outputTokens})`.as(
          "total_output"
        ),
      })
      .from(usageEvents)
      .where(
        and(
          eq(usageEvents.orgId, orgId),
          between(usageEvents.timeBucket, from, to)
        )
      )
      .groupBy(usageEvents.timeBucket)
      .orderBy(usageEvents.timeBucket);
  });
}

/**
 * Daily totals grouped by developer.
 */
export async function getDailyTotalsByDeveloper(
  orgId: string,
  from: string,
  to: string
) {
  return withOrgContext(orgId, async (tx) => {
    return tx
      .select({
        developerId: usageEvents.developerId,
        developerName: developers.displayName,
        date: usageEvents.timeBucket,
        cost: sql<bigint>`sum(${usageEvents.costUsdMicros})`.as("cost"),
      })
      .from(usageEvents)
      .innerJoin(developers, eq(usageEvents.developerId, developers.id))
      .where(
        and(
          eq(usageEvents.orgId, orgId),
          between(usageEvents.timeBucket, from, to),
          isNull(developers.deletedAt)
        )
      )
      .groupBy(usageEvents.developerId, developers.displayName, usageEvents.timeBucket)
      .orderBy(usageEvents.timeBucket);
  });
}

/**
 * Daily totals grouped by provider.
 */
export async function getDailyTotalsByProvider(
  orgId: string,
  from: string,
  to: string
) {
  return withOrgContext(orgId, async (tx) => {
    return tx
      .select({
        providerId: usageEvents.providerId,
        providerName: providers.displayName,
        date: usageEvents.timeBucket,
        cost: sql<bigint>`sum(${usageEvents.costUsdMicros})`.as("cost"),
      })
      .from(usageEvents)
      .innerJoin(providers, eq(usageEvents.providerId, providers.id))
      .where(
        and(
          eq(usageEvents.orgId, orgId),
          between(usageEvents.timeBucket, from, to)
        )
      )
      .groupBy(usageEvents.providerId, providers.displayName, usageEvents.timeBucket)
      .orderBy(usageEvents.timeBucket);
  });
}

/**
 * Daily totals grouped by model.
 */
export async function getDailyTotalsByModel(
  orgId: string,
  from: string,
  to: string
) {
  return withOrgContext(orgId, async (tx) => {
    return tx
      .select({
        model: usageEvents.model,
        date: usageEvents.timeBucket,
        cost: sql<bigint>`sum(${usageEvents.costUsdMicros})`.as("cost"),
      })
      .from(usageEvents)
      .where(
        and(
          eq(usageEvents.orgId, orgId),
          between(usageEvents.timeBucket, from, to)
        )
      )
      .groupBy(usageEvents.model, usageEvents.timeBucket)
      .orderBy(usageEvents.timeBucket);
  });
}

/**
 * Developer ranking for a date range: total cost, % of org, vs trailing 7-day avg.
 */
export async function getDeveloperRanking(
  orgId: string,
  from: string,
  to: string
) {
  return withOrgContext(orgId, async (tx) => {
    // Get per-developer totals for the range
    const devTotals = await tx
      .select({
        developerId: usageEvents.developerId,
        developerName: developers.displayName,
        totalCost: sql<bigint>`sum(${usageEvents.costUsdMicros})`.as("total_cost"),
        keyCount: sql<number>`count(distinct ${usageEvents.providerKeyId})`.as(
          "key_count"
        ),
      })
      .from(usageEvents)
      .innerJoin(developers, eq(usageEvents.developerId, developers.id))
      .where(
        and(
          eq(usageEvents.orgId, orgId),
          between(usageEvents.timeBucket, from, to),
          isNull(developers.deletedAt)
        )
      )
      .groupBy(usageEvents.developerId, developers.displayName)
      .orderBy(desc(sql`sum(${usageEvents.costUsdMicros})`));

    // Calculate org total for percentages
    const orgTotal = devTotals.reduce(
      (sum, d) => sum + BigInt(d.totalCost ?? 0),
      0n
    );

    // Get trailing 7-day averages per developer
    const trailing = await tx
      .select({
        developerId: usageEvents.developerId,
        avgCost: sql<bigint>`sum(${usageEvents.costUsdMicros}) / 7`.as("avg_cost"),
      })
      .from(usageEvents)
      .where(
        and(
          eq(usageEvents.orgId, orgId),
          sql`${usageEvents.timeBucket} >= current_date - interval '7 days'`,
          sql`${usageEvents.timeBucket} < current_date`
        )
      )
      .groupBy(usageEvents.developerId);

    const trailingMap = new Map(
      trailing.map((t) => [t.developerId, BigInt(t.avgCost ?? 0)])
    );

    return devTotals.map((d) => {
      const totalCost = BigInt(d.totalCost ?? 0);
      const trailing7dAvg = trailingMap.get(d.developerId) ?? 0n;
      const pctOfOrg =
        orgTotal > 0n ? Number((totalCost * 10000n) / orgTotal) / 100 : 0;
      const vsAvgPct =
        trailing7dAvg > 0n
          ? Number(((totalCost - trailing7dAvg) * 10000n) / trailing7dAvg) / 100
          : 0;

      return {
        developerId: d.developerId,
        name: d.developerName,
        totalCost,
        pctOfOrg,
        vsTrailing7dAvgPct: vsAvgPct,
        keyCount: d.keyCount,
      };
    });
  });
}

/**
 * Rolling stats for a single developer+provider pair.
 * Used by anomaly detection.
 */
export async function getRollingStats(
  developerId: string,
  providerId: string,
  lookbackDays: number = 28
) {
  // This runs in a system context (anomaly detection), no RLS needed.
  // Import db directly.
  const { db } = await import("@/lib/db/client");

  const rows = await db
    .select({
      date: usageEvents.timeBucket,
      dailyCost: sql<bigint>`sum(${usageEvents.costUsdMicros})`.as("daily_cost"),
    })
    .from(usageEvents)
    .where(
      and(
        eq(usageEvents.developerId, developerId),
        eq(usageEvents.providerId, providerId),
        sql`${usageEvents.timeBucket} >= current_date - ${lookbackDays}`
      )
    )
    .groupBy(usageEvents.timeBucket)
    .orderBy(usageEvents.timeBucket);

  const values = rows.map((r) => Number(r.dailyCost ?? 0));

  if (values.length === 0) {
    return { meanDaily: 0, stddevDaily: 0, trailing7dayAvg: 0, dayCount: 0 };
  }

  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;

  // Sample stddev (n-1)
  const variance =
    n > 1
      ? values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (n - 1)
      : 0;
  const stddev = Math.sqrt(variance);

  // Trailing 7-day average
  const last7 = values.slice(-7);
  const trailing7dayAvg =
    last7.length > 0 ? last7.reduce((a, b) => a + b, 0) / last7.length : 0;

  return { meanDaily: mean, stddevDaily: stddev, trailing7dayAvg, dayCount: n };
}
