import { withOrgContext } from "@/lib/db/rls";
import { usageEvents, developers, providers } from "@/lib/db/schema";
import { eq, and, between, sql, isNull, count, desc } from "drizzle-orm";
import { format, subDays, startOfMonth } from "date-fns";

export async function getDashboardData(orgId: string, from: string, to: string) {
  return withOrgContext(orgId, async (tx) => {
    // Stat cards
    const [totals] = await tx
      .select({
        totalCost: sql<bigint>`coalesce(sum(${usageEvents.costUsdMicros}), 0)`.as("total_cost"),
        totalInput: sql<bigint>`coalesce(sum(${usageEvents.inputTokens}), 0)`.as("total_input"),
        totalOutput: sql<bigint>`coalesce(sum(${usageEvents.outputTokens}), 0)`.as("total_output"),
      })
      .from(usageEvents)
      .where(
        and(eq(usageEvents.orgId, orgId), between(usageEvents.timeBucket, from, to))
      );

    // Prior period for comparison (same length before `from`)
    const fromDate = new Date(from);
    const toDate = new Date(to);
    const dayCount = Math.ceil((toDate.getTime() - fromDate.getTime()) / 86400000);
    const priorFrom = format(subDays(fromDate, dayCount), "yyyy-MM-dd");
    const priorTo = format(subDays(fromDate, 1), "yyyy-MM-dd");

    const [priorTotals] = await tx
      .select({
        totalCost: sql<bigint>`coalesce(sum(${usageEvents.costUsdMicros}), 0)`.as("total_cost"),
      })
      .from(usageEvents)
      .where(
        and(eq(usageEvents.orgId, orgId), between(usageEvents.timeBucket, priorFrom, priorTo))
      );

    // Active developers count
    const [devCount] = await tx
      .select({ count: sql<number>`count(distinct ${usageEvents.developerId})`.as("count") })
      .from(usageEvents)
      .where(
        and(eq(usageEvents.orgId, orgId), between(usageEvents.timeBucket, from, to))
      );

    // Most used model
    const [topModel] = await tx
      .select({
        model: usageEvents.model,
        cost: sql<bigint>`sum(${usageEvents.costUsdMicros})`.as("cost"),
      })
      .from(usageEvents)
      .where(
        and(eq(usageEvents.orgId, orgId), between(usageEvents.timeBucket, from, to))
      )
      .groupBy(usageEvents.model)
      .orderBy(desc(sql`sum(${usageEvents.costUsdMicros})`))
      .limit(1);

    // Daily chart data by developer
    const dailyByDev = await tx
      .select({
        date: usageEvents.timeBucket,
        developerName: developers.displayName,
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
      .groupBy(usageEvents.timeBucket, developers.displayName)
      .orderBy(usageEvents.timeBucket);

    // Daily chart data by provider
    const dailyByProvider = await tx
      .select({
        date: usageEvents.timeBucket,
        providerName: providers.displayName,
        cost: sql<bigint>`sum(${usageEvents.costUsdMicros})`.as("cost"),
      })
      .from(usageEvents)
      .innerJoin(providers, eq(usageEvents.providerId, providers.id))
      .where(
        and(eq(usageEvents.orgId, orgId), between(usageEvents.timeBucket, from, to))
      )
      .groupBy(usageEvents.timeBucket, providers.displayName)
      .orderBy(usageEvents.timeBucket);

    // Daily chart data by model
    const dailyByModel = await tx
      .select({
        date: usageEvents.timeBucket,
        model: usageEvents.model,
        cost: sql<bigint>`sum(${usageEvents.costUsdMicros})`.as("cost"),
      })
      .from(usageEvents)
      .where(
        and(eq(usageEvents.orgId, orgId), between(usageEvents.timeBucket, from, to))
      )
      .groupBy(usageEvents.timeBucket, usageEvents.model)
      .orderBy(usageEvents.timeBucket);

    // Developer ranking table
    const devRanking = await tx
      .select({
        developerId: usageEvents.developerId,
        name: developers.displayName,
        totalCost: sql<bigint>`sum(${usageEvents.costUsdMicros})`.as("total_cost"),
        keyCount: sql<number>`count(distinct ${usageEvents.providerKeyId})`.as("key_count"),
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

    const totalCost = BigInt(totals?.totalCost ?? 0);
    const priorCost = BigInt(priorTotals?.totalCost ?? 0);
    const deltaPct = priorCost > 0n
      ? Number(((totalCost - priorCost) * 10000n) / priorCost) / 100
      : 0;

    return {
      stats: {
        totalCostMicros: totalCost.toString(),
        priorCostMicros: priorCost.toString(),
        deltaPct,
        activeDevelopers: Number(devCount?.count ?? 0),
        topModel: topModel?.model ?? "—",
      },
      dailyByDev: dailyByDev.map((r) => ({
        date: r.date,
        name: r.developerName,
        cost: Number(r.cost ?? 0),
      })),
      dailyByProvider: dailyByProvider.map((r) => ({
        date: r.date,
        name: r.providerName,
        cost: Number(r.cost ?? 0),
      })),
      dailyByModel: dailyByModel.map((r) => ({
        date: r.date,
        name: r.model,
        cost: Number(r.cost ?? 0),
      })),
      devRanking: devRanking.map((r) => ({
        developerId: r.developerId,
        name: r.name,
        totalCost: BigInt(r.totalCost ?? 0).toString(),
        pctOfOrg: totalCost > 0n
          ? Number((BigInt(r.totalCost ?? 0) * 10000n) / totalCost) / 100
          : 0,
        keyCount: Number(r.keyCount ?? 0),
      })),
    };
  });
}
