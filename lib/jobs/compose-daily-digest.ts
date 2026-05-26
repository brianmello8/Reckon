import { inngest } from "./client";
import { db } from "@/lib/db/client";
import { organizations, anomalies, developers, digestLogs } from "@/lib/db/schema";
import { eq, and, isNull, sql } from "drizzle-orm";
import { format, subDays } from "date-fns";
import { getDailyTotalsForOrg, getDeveloperRanking } from "@/lib/queries/usage";
import { buildDailyDigestBlocks } from "@/lib/slack/messages/daily-digest";
import { getSlackClient } from "@/lib/slack/client";

export const composeDailyDigest = inngest.createFunction(
  {
    id: "digest-daily",
    triggers: [{ event: "digest/daily.requested" }],
  },
  async ({ event, step }) => {
    const { org_id } = event.data as { org_id: string };

    // Step 1: Load org details
    const org = await step.run("load-org", async () => {
      const [row] = await db
        .select({
          id: organizations.id,
          name: organizations.name,
          digestSlackChannelId: organizations.digestSlackChannelId,
        })
        .from(organizations)
        .where(eq(organizations.id, org_id))
        .limit(1);
      return row;
    });

    if (!org) return { status: "skipped", reason: "org_not_found" };
    if (!org.digestSlackChannelId) return { status: "skipped", reason: "no_channel" };

    // Step 2: Aggregate yesterday's usage
    const yesterday = format(subDays(new Date(), 1), "yyyy-MM-dd");
    const weekAgo = format(subDays(new Date(), 8), "yyyy-MM-dd");

    const digestData = await step.run("aggregate-data", async () => {
      // Yesterday's totals
      const dailyTotals = await getDailyTotalsForOrg(org_id, yesterday, yesterday);
      const totalCostMicros = dailyTotals.reduce(
        (sum, d) => sum + BigInt(d.totalCostUsdMicros ?? 0),
        0n
      );

      // Trailing 7-day average
      const trailingTotals = await getDailyTotalsForOrg(org_id, weekAgo, format(subDays(new Date(), 2), "yyyy-MM-dd"));
      const trailingSum = trailingTotals.reduce(
        (sum, d) => sum + BigInt(d.totalCostUsdMicros ?? 0),
        0n
      );
      const trailingDays = trailingTotals.length || 1;
      const trailingAvg = trailingSum / BigInt(trailingDays);

      const vsTrailingAvgPct =
        trailingAvg > 0n
          ? Number(((totalCostMicros - trailingAvg) * 10000n) / trailingAvg) / 100
          : 0;

      // Top 5 developers
      const devRanking = await getDeveloperRanking(org_id, yesterday, yesterday);
      const topDevelopers = devRanking.slice(0, 5).map((d) => ({
        name: d.name,
        costMicros: d.totalCost.toString(),
        vsAvgPct: d.vsTrailing7dAvgPct,
      }));

      // Unacknowledged anomalies
      const unackedAnomalies = await db
        .select({
          developerName: developers.displayName,
          kind: anomalies.kind,
          severity: anomalies.severity,
          details: anomalies.details,
        })
        .from(anomalies)
        .innerJoin(developers, eq(anomalies.developerId, developers.id))
        .where(
          and(eq(anomalies.orgId, org_id), isNull(anomalies.acknowledgedAt))
        )
        .limit(5);

      return {
        totalCostMicros: totalCostMicros.toString(),
        vsTrailingAvgPct,
        topDevelopers,
        anomalies: unackedAnomalies.map((a) => ({
          developerName: a.developerName,
          kind: a.kind,
          severity: a.severity,
          summary: `${a.kind} detected`,
        })),
      };
    });

    // Step 3: Build and post message
    const result = await step.run("post-to-slack", async () => {
      const client = await getSlackClient(org_id);
      if (!client) return { posted: false, reason: "no_slack_client" };

      const blocks = buildDailyDigestBlocks({
        orgName: org.name,
        date: `Yesterday, ${format(subDays(new Date(), 1), "MMM d")}`,
        totalCostMicros: BigInt(digestData.totalCostMicros),
        vsTrailingAvgPct: digestData.vsTrailingAvgPct,
        topDevelopers: digestData.topDevelopers.map((d) => ({
          ...d,
          costMicros: BigInt(d.costMicros),
        })),
        unacknowledgedAnomalies: digestData.anomalies,
        dashboardUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?range=7d`,
      });

      const postResult = await client.chat.postMessage({
        channel: org.digestSlackChannelId!,
        blocks,
        text: `AI spend yesterday: $${(Number(digestData.totalCostMicros) / 1_000_000).toFixed(2)}`,
      });

      return { posted: true, ts: postResult.ts };
    });

    // Step 4: Log the digest
    await step.run("log-digest", async () => {
      await db.insert(digestLogs).values({
        orgId: org_id,
        kind: "daily",
        slackTs: result.posted ? (result as { ts?: string }).ts ?? null : null,
        error: result.posted ? null : (result as { reason?: string }).reason ?? null,
      });
    });

    return { status: "ok", ...result };
  }
);
