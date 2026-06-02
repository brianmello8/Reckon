import { inngest } from "./client";
import { db } from "@/lib/db/client";
import { organizations } from "@/lib/db/schema";
import { and, eq, isNull, isNotNull } from "drizzle-orm";
import { getSlackClient } from "@/lib/slack/client";
import { buildMarginAlertBlocks } from "@/lib/slack/messages/margin";
import { detectMarginAlerts } from "@/lib/unit-economics/margin-alerts";
import { PLAN_LIMITS } from "@/lib/plans/limits";
import { CRON_WEEKLY_MARGIN } from "./schedule";
import { format, subDays } from "date-fns";

/**
 * Weekly margin-alert sweep (Phase 12.2, §5h). For each org, evaluates the
 * trailing 30 days of unit economics and posts a Slack alert (and a Linear issue
 * on critical, Pro only) for any customer/workflow/product line whose AI cost is
 * eroding or exceeding its revenue. The weekly cadence is the throttle — no
 * per-item dedup state is persisted (matches the read-only posture).
 */

export const cronMarginAlerts = inngest.createFunction(
  { id: "cron-margin-alerts", triggers: [{ cron: CRON_WEEKLY_MARGIN }] },
  async ({ step }) => {
    const orgs = await step.run("list-active-orgs", async () =>
      db
        .select({ id: organizations.id })
        .from(organizations)
        .where(and(isNotNull(organizations.plan), isNull(organizations.deletedAt)))
    );
    if (orgs.length === 0) return { status: "skipped" };
    await step.run("fan-out", async () => {
      await inngest.send(
        orgs.map((o) => ({ name: "margin/alerts.requested" as const, data: { org_id: o.id } }))
      );
    });
    return { status: "ok", orgs: orgs.length };
  }
);

export const marginAlertsForOrg = inngest.createFunction(
  { id: "margin-alerts-for-org", retries: 3, triggers: [{ event: "margin/alerts.requested" }] },
  async ({ event, step }) => {
    const { org_id } = event.data as { org_id: string };
    const now = new Date();
    const to = format(now, "yyyy-MM-dd");
    const from = format(subDays(now, 30), "yyyy-MM-dd");

    return step.run("evaluate-and-alert", async () => {
      const [org] = await db
        .select({
          channelId: organizations.digestSlackChannelId,
          plan: organizations.plan,
          linearTeamId: organizations.linearTeamId,
        })
        .from(organizations)
        .where(eq(organizations.id, org_id))
        .limit(1);

      const alerts = await detectMarginAlerts(org_id, from, to);
      if (alerts.length === 0) return { status: "ok", alertsSent: 0 };

      const windowLabel = `${from} → ${to}`;
      const dashboardUrl = `${process.env.NEXT_PUBLIC_APP_URL}/finance/unit-economics`;
      let sent = 0;

      const client = org?.channelId ? await getSlackClient(org_id) : null;
      for (const a of alerts) {
        if (client && org?.channelId) {
          const { blocks, text } = buildMarginAlertBlocks({
            grain: a.grain,
            label: a.label,
            kind: a.kind,
            costMicros: Number(a.costMicros),
            revenueMicros: Number(a.revenueMicros),
            marginAtRiskMicros: Number(a.marginAtRiskMicros),
            window: windowLabel,
            dashboardUrl,
          });
          await client.chat.postMessage({ channel: org.channelId, blocks, text });
          sent += 1;
        }

        // Linear on critical (negative margin), Pro only, best-effort.
        if (
          a.severity === "critical" &&
          org &&
          PLAN_LIMITS[org.plan ?? "free"].linearIntegration &&
          org.linearTeamId
        ) {
          try {
            const { getLinearClient } = await import("@/lib/linear/client");
            const linear = await getLinearClient(org_id);
            if (linear) {
              await linear.createIssue({
                teamId: org.linearTeamId,
                title: `Negative AI margin: ${a.label}`,
                description: `${a.grain.replace(/_/g, " ")} *${a.label}* — AI cost $${(Number(a.costMicros) / 1_000_000).toFixed(2)} exceeds revenue $${(Number(a.revenueMicros) / 1_000_000).toFixed(2)} (${windowLabel}).\n\n$${(Number(a.marginAtRiskMicros) / 1_000_000).toFixed(2)} margin at risk.\n\n[View unit economics](${dashboardUrl})`,
                priority: 1,
              });
            }
          } catch {
            // non-fatal
          }
        }
      }
      return { status: "ok", alertsSent: sent, candidates: alerts.length };
    });
  }
);
