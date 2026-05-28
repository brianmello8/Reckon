import { inngest } from "./client";
import { db } from "@/lib/db/client";
import { organizations, anomalies, digestLogs } from "@/lib/db/schema";
import { eq, and, between, sql } from "drizzle-orm";
import { format, subDays } from "date-fns";
import {
  getDailyTotalsForOrg,
  getDailyTotalsByProvider,
  getDeveloperRanking,
} from "@/lib/queries/usage";
import { buildWeeklyDigestBlocks } from "@/lib/slack/messages/weekly-digest";
import { getSlackClient } from "@/lib/slack/client";

export const composeWeeklyDigest = inngest.createFunction(
  {
    id: "digest-weekly",
    triggers: [{ event: "digest/weekly.requested" }],
  },
  async ({ event, step }) => {
    const { org_id } = event.data as { org_id: string };

    const org = await step.run("load-org", async () => {
      const [row] = await db
        .select({
          id: organizations.id,
          name: organizations.name,
          plan: organizations.plan,
          digestSlackChannelId: organizations.digestSlackChannelId,
        })
        .from(organizations)
        .where(eq(organizations.id, org_id))
        .limit(1);
      return row;
    });

    if (!org) return { status: "skipped", reason: "org_not_found" };
    if (!org.digestSlackChannelId) return { status: "skipped", reason: "no_channel" };
    if (org.plan !== "pro") return { status: "skipped", reason: "free_plan" };

    const now = new Date();
    const weekEnd = format(subDays(now, 1), "yyyy-MM-dd"); // yesterday
    const weekStart = format(subDays(now, 7), "yyyy-MM-dd");
    const priorWeekEnd = format(subDays(now, 8), "yyyy-MM-dd");
    const priorWeekStart = format(subDays(now, 14), "yyyy-MM-dd");

    const digestData = await step.run("aggregate-data", async () => {
      // This week totals
      const weekTotals = await getDailyTotalsForOrg(org_id, weekStart, weekEnd);
      const totalCost = weekTotals.reduce(
        (sum, d) => sum + BigInt(d.totalCostUsdMicros ?? 0), 0n
      );

      // Prior week totals
      const priorTotals = await getDailyTotalsForOrg(org_id, priorWeekStart, priorWeekEnd);
      const priorCost = priorTotals.reduce(
        (sum, d) => sum + BigInt(d.totalCostUsdMicros ?? 0), 0n
      );

      const vsWeekPct = priorCost > 0n
        ? Number(((totalCost - priorCost) * 10000n) / priorCost) / 100
        : 0;

      // Top developers
      const devRanking = await getDeveloperRanking(org_id, weekStart, weekEnd);
      const topDevelopers = devRanking.slice(0, 5).map((d) => ({
        name: d.name,
        costMicros: d.totalCost.toString(),
        pctOfTotal: d.pctOfOrg,
      }));

      // Spend by provider
      const providerDaily = await getDailyTotalsByProvider(org_id, weekStart, weekEnd);
      const providerTotals = new Map<string, bigint>();
      for (const row of providerDaily) {
        const existing = providerTotals.get(row.providerName) ?? 0n;
        providerTotals.set(row.providerName, existing + BigInt(row.cost ?? 0));
      }
      const spendByProvider = Array.from(providerTotals.entries())
        .map(([name, costMicros]) => ({ name, costMicros: costMicros.toString() }))
        .sort((a, b) => Number(BigInt(b.costMicros) - BigInt(a.costMicros)));

      // Anomalies this week
      const weekAnomalies = await db
        .select({
          severity: anomalies.severity,
          count: sql<number>`count(*)`.as("count"),
        })
        .from(anomalies)
        .where(
          and(
            eq(anomalies.orgId, org_id),
            between(
              sql`date(${anomalies.detectedAt})`,
              weekStart,
              weekEnd
            )
          )
        )
        .groupBy(anomalies.severity);

      const severityBreakdown = { info: 0, warn: 0, critical: 0 };
      let anomalyCount = 0;
      for (const row of weekAnomalies) {
        const count = Number(row.count);
        anomalyCount += count;
        if (row.severity in severityBreakdown) {
          severityBreakdown[row.severity as keyof typeof severityBreakdown] = count;
        }
      }

      // Notable changes (>50% week-over-week)
      const priorDevRanking = await getDeveloperRanking(org_id, priorWeekStart, priorWeekEnd);
      const priorCostMap = new Map(
        priorDevRanking.map((d) => [d.developerId, d.totalCost])
      );

      const notableChanges: Array<{ name: string; changePct: number }> = [];
      for (const dev of devRanking) {
        const prior = priorCostMap.get(dev.developerId) ?? 0n;
        if (prior > 0n) {
          const changePct = Number(((dev.totalCost - prior) * 10000n) / prior) / 100;
          if (Math.abs(changePct) > 50) {
            notableChanges.push({ name: dev.name, changePct });
          }
        }
      }

      return {
        totalCostMicros: totalCost.toString(),
        priorWeekCostMicros: priorCost.toString(),
        vsWeekPct,
        topDevelopers,
        spendByProvider,
        anomalyCount,
        anomalySeverityBreakdown: severityBreakdown,
        notableChanges,
      };
    });

    const result = await step.run("post-to-slack", async () => {
      const client = await getSlackClient(org_id);
      if (!client) return { posted: false, reason: "no_slack_client" };

      const weekLabel = `${format(subDays(now, 7), "MMM d")} \u2013 ${format(subDays(now, 1), "MMM d")}`;

      const blocks = buildWeeklyDigestBlocks({
        orgName: org.name,
        weekLabel,
        totalCostMicros: BigInt(digestData.totalCostMicros),
        priorWeekCostMicros: BigInt(digestData.priorWeekCostMicros),
        vsWeekPct: digestData.vsWeekPct,
        topDevelopers: digestData.topDevelopers.map((d) => ({
          ...d,
          costMicros: BigInt(d.costMicros),
        })),
        spendByProvider: digestData.spendByProvider.map((p) => ({
          ...p,
          costMicros: BigInt(p.costMicros),
        })),
        anomalyCount: digestData.anomalyCount,
        anomalySeverityBreakdown: digestData.anomalySeverityBreakdown,
        notableChanges: digestData.notableChanges,
        dashboardUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?range=7d`,
      });

      const postResult = await client.chat.postMessage({
        channel: org.digestSlackChannelId!,
        blocks,
        text: `Weekly AI spend: ${fmtCost(digestData.totalCostMicros)}`,
      });

      return { posted: true, ts: postResult.ts };
    });

    await step.run("log-digest", async () => {
      await db.insert(digestLogs).values({
        orgId: org_id,
        kind: "weekly",
        slackTs: result.posted ? (result as { ts?: string }).ts ?? null : null,
        error: result.posted ? null : (result as { reason?: string }).reason ?? null,
      });
    });

    return { status: "ok", ...result };
  }
);

function fmtCost(micros: string | bigint): string {
  const value = Number(micros) / 1_000_000;
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
