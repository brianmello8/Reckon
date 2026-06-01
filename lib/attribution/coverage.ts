import { usageEvents, usageAttribution } from "@/lib/db/schema";
import { and, eq, gte, sql } from "drizzle-orm";
import { withOrgContext } from "@/lib/db/rls";

export type AttributionCoverage = {
  totalMicros: string;
  attributedMicros: string;
  unattributedMicros: string;
  coveragePct: number; // 0–100, two-decimal precision
};

/**
 * Agent-attribution coverage for an org over a period (Phase 8.2 ROI honesty).
 *
 * ROI is only trustworthy if the cost denominator is complete, so we never let
 * unattributed spend hide: this reports how much spend carries an agent and how
 * much does not. Spend on a shared key that can't be split at the agent level
 * (see architecture §3a) lands in the unattributed bucket until observability
 * attribution (Prompt 8.3) can split it — it is surfaced, never dropped.
 *
 * `since` is an inclusive yyyy-MM-dd date bound (usage_events.time_bucket).
 */
export async function getAgentAttributionCoverage(
  orgId: string,
  since: string
): Promise<AttributionCoverage> {
  return withOrgContext(orgId, async (tx) => {
    const [row] = await tx
      .select({
        total: sql<string>`coalesce(sum(${usageEvents.costUsdMicros}), 0)`,
        attributed: sql<string>`coalesce(sum(case when ${usageAttribution.agentId} is not null then ${usageEvents.costUsdMicros} else 0 end), 0)`,
      })
      .from(usageEvents)
      .leftJoin(
        usageAttribution,
        and(
          eq(usageAttribution.usageEventId, usageEvents.id),
          eq(usageAttribution.orgId, usageEvents.orgId)
        )
      )
      .where(
        and(eq(usageEvents.orgId, orgId), gte(usageEvents.timeBucket, since))
      );

    const total = BigInt(row?.total ?? "0");
    const attributed = BigInt(row?.attributed ?? "0");
    const unattributed = total - attributed;
    const coveragePct =
      total > 0n ? Number((attributed * 10000n) / total) / 100 : 0;

    return {
      totalMicros: total.toString(),
      attributedMicros: attributed.toString(),
      unattributedMicros: unattributed.toString(),
      coveragePct,
    };
  });
}
