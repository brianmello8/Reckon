import { inngest } from "./client";
import { db } from "@/lib/db/client";
import { organizations, commitments } from "@/lib/db/schema";
import { and, eq, isNull, isNotNull } from "drizzle-orm";
import { getSlackClient } from "@/lib/slack/client";
import { buildCommitmentAlertBlocks } from "@/lib/slack/messages/commitment";
import { getCommitmentStatus, type CommitmentAlert } from "@/lib/commitments/drawdown";
import { PLAN_LIMITS } from "@/lib/plans/limits";
import { CRON_WEEKLY_COMMITMENTS } from "./schedule";

const PRIORITY: Record<CommitmentAlert["kind"], number> = {
  overage: 3,
  expiry: 2,
  under_utilization: 1,
};
const DEDUP_DAYS = 14;

export const cronCommitmentAlerts = inngest.createFunction(
  { id: "cron-commitment-alerts", triggers: [{ cron: CRON_WEEKLY_COMMITMENTS }] },
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
        orgs.map((o) => ({ name: "commitment/alerts.requested" as const, data: { org_id: o.id } }))
      );
    });
    return { status: "ok", orgs: orgs.length };
  }
);

export const commitmentAlertsForOrg = inngest.createFunction(
  { id: "commitment-alerts-for-org", retries: 3, triggers: [{ event: "commitment/alerts.requested" }] },
  async ({ event, step }) => {
    const { org_id } = event.data as { org_id: string };
    const today = new Date().toISOString().slice(0, 10);
    const now = new Date();

    return step.run("evaluate-and-alert", async () => {
      const [org] = await db
        .select({
          name: organizations.name,
          channelId: organizations.digestSlackChannelId,
          plan: organizations.plan,
          linearTeamId: organizations.linearTeamId,
        })
        .from(organizations)
        .where(eq(organizations.id, org_id))
        .limit(1);

      const rows = await db
        .select()
        .from(commitments)
        .where(eq(commitments.orgId, org_id));

      let sent = 0;
      for (const c of rows) {
        const status = await getCommitmentStatus(
          org_id,
          {
            id: c.id,
            provider: c.provider,
            type: c.type,
            amount: c.amount,
            startDate: c.startDate,
            endDate: c.endDate,
          },
          today
        );
        if (status.alerts.length === 0) continue;
        const top = [...status.alerts].sort((a, b) => PRIORITY[b.kind] - PRIORITY[a.kind])[0];

        // Dedup: skip if we already sent this kind within the window.
        const daysSince = c.lastAlertedAt
          ? (now.getTime() - new Date(c.lastAlertedAt).getTime()) / 86400000
          : Infinity;
        if (c.lastAlertKind === top.kind && daysSince < DEDUP_DAYS) continue;

        const client = org?.channelId ? await getSlackClient(org_id) : null;
        if (client && org?.channelId) {
          const { blocks, text } = buildCommitmentAlertBlocks({
            provider: c.provider,
            commitmentType: c.type,
            kind: top.kind,
            amountAtRiskMicros: Number(top.amountAtRiskMicros),
            date: top.date,
            message: top.message,
            dashboardUrl: `${process.env.NEXT_PUBLIC_APP_URL}/finance/commitments`,
          });
          await client.chat.postMessage({ channel: org.channelId, blocks, text });
        }

        // Linear (Pro only), best-effort.
        if (
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
                title: `Commitment alert: ${c.provider} — ${top.kind.replace(/_/g, " ")}`,
                description: `${top.message}\n\n$${(Number(top.amountAtRiskMicros) / 1_000_000).toFixed(2)} at risk by ${top.date}.\n\n[View commitments](${process.env.NEXT_PUBLIC_APP_URL}/finance/commitments)`,
                priority: top.kind === "overage" ? 1 : 2,
              });
            }
          } catch {
            // non-fatal
          }
        }

        await db
          .update(commitments)
          .set({ lastAlertKind: top.kind, lastAlertedAt: now, updatedAt: now })
          .where(eq(commitments.id, c.id));
        sent += 1;
      }
      return { status: "ok", alertsSent: sent };
    });
  }
);
