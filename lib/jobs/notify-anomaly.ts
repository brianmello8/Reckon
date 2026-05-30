import { inngest } from "./client";
import { db } from "@/lib/db/client";
import { anomalies, developers, organizations, users } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { format } from "date-fns";
import { getSlackClient } from "@/lib/slack/client";
import { buildAnomalyBlocks } from "@/lib/slack/messages/anomaly";
import { PLAN_LIMITS } from "@/lib/plans/limits";

export const notifyAnomaly = inngest.createFunction(
  {
    id: "anomaly-notify",
    triggers: [{ event: "anomaly/notify.requested" }],
  },
  async ({ event, step }) => {
    const { anomaly_id } = event.data as { anomaly_id: string };

    // Load anomaly + developer + org
    const data = await step.run("load-data", async () => {
      const [anomaly] = await db
        .select()
        .from(anomalies)
        .where(eq(anomalies.id, anomaly_id))
        .limit(1);

      if (!anomaly) return null;

      const [developer] = await db
        .select({ displayName: developers.displayName })
        .from(developers)
        .where(eq(developers.id, anomaly.developerId))
        .limit(1);

      const [org] = await db
        .select({
          name: organizations.name,
          digestSlackChannelId: organizations.digestSlackChannelId,
        })
        .from(organizations)
        .where(eq(organizations.id, anomaly.orgId))
        .limit(1);

      return {
        anomaly: {
          ...anomaly,
          detectedAt: anomaly.detectedAt.toISOString(),
        },
        developerName: developer?.displayName ?? "Unknown",
        orgName: org?.name ?? "Unknown",
        channelId: org?.digestSlackChannelId ?? null,
      };
    });

    if (!data || !data.channelId) {
      return { status: "skipped", reason: data ? "no_channel" : "not_found" };
    }

    // Post to Slack
    const result = await step.run("post-to-slack", async () => {
      const client = await getSlackClient(data.anomaly.orgId);
      if (!client) return { posted: false, reason: "no_slack_client" };

      const details = data.anomaly.details as Record<string, unknown> | null;
      const amountMicros = Number(details?.dailyCostMicros ?? 0);
      const multiple = Number(details?.multiple ?? 0);
      const trailingAvg = Number(
        details?.trailing7dayAvgMicros ?? details?.meanDailyMicros ?? 0
      );

      const { blocks, text } = buildAnomalyBlocks({
        anomalyId: data.anomaly.id,
        developerName: data.developerName,
        severity: data.anomaly.severity,
        kind: data.anomaly.kind,
        amountMicros,
        multiple,
        trailing7dayAvgMicros: trailingAvg,
        detectedAt: format(new Date(data.anomaly.detectedAt), "MMM d, h:mm a"),
        dashboardUrl: `${process.env.NEXT_PUBLIC_APP_URL}/anomalies`,
      });

      // For critical severity, @-mention admins
      let mentionText = "";
      if (data.anomaly.severity === "critical") {
        const admins = await db
          .select({ email: users.email })
          .from(users)
          .where(
            and(eq(users.orgId, data.anomaly.orgId), eq(users.role, "admin"))
          );

        // Try to find Slack users by email
        for (const admin of admins) {
          try {
            const lookup = await client.users.lookupByEmail({
              email: admin.email,
            });
            if (lookup.user?.id) {
              mentionText += `<@${lookup.user.id}> `;
            }
          } catch {
            // User not in workspace, skip
          }
        }
      }

      const fullText = mentionText
        ? `${mentionText.trim()}\n${text}`
        : text;

      const postResult = await client.chat.postMessage({
        channel: data.channelId!,
        blocks,
        text: fullText,
      });

      return { posted: true, ts: postResult.ts };
    });

    // Store the Slack message ts on the anomaly
    if (result.posted && (result as { ts?: string }).ts) {
      await step.run("store-ts", async () => {
        await db
          .update(anomalies)
          .set({ slackMessageTs: (result as { ts: string }).ts })
          .where(eq(anomalies.id, anomaly_id));
      });
    }

    // Step: Create Linear issue for critical anomalies
    if (data.anomaly.severity === "critical") {
      await step.run("create-linear-issue", async () => {
        try {
          const [org] = await db
            .select({
              linearTeamId: organizations.linearTeamId,
              plan: organizations.plan,
            })
            .from(organizations)
            .where(eq(organizations.id, data.anomaly.orgId))
            .limit(1);

          // Linear is Pro-only — never file issues for Free orgs, even if a
          // stale connection + team exist from before the plan changed.
          if (!PLAN_LIMITS[org?.plan ?? "free"].linearIntegration) {
            return { created: false, reason: "free_plan" };
          }
          if (!org?.linearTeamId) return { created: false, reason: "no_team" };

          const { getLinearClient } = await import("@/lib/linear/client");
          const linearClient = await getLinearClient(data.anomaly.orgId);
          if (!linearClient) return { created: false, reason: "no_linear" };

          const details = data.anomaly.details as Record<string, unknown> | null;
          const amountDollars = (Number(details?.dailyCostMicros ?? 0) / 1_000_000).toFixed(2);

          const issue = await linearClient.createIssue({
            teamId: org.linearTeamId,
            title: `AI spend anomaly: ${data.developerName} — $${amountDollars}`,
            description: [
              `**${data.developerName}** spent $${amountDollars} yesterday — ${details?.multiple ?? "?"}x their trailing average.`,
              "",
              `Severity: ${data.anomaly.severity}`,
              `Kind: ${data.anomaly.kind}`,
              "",
              `[View in Reckon](${process.env.NEXT_PUBLIC_APP_URL}/anomalies)`,
            ].join("\n"),
            priority: 1, // Urgent
          });

          const created = await issue.issue;
          if (created) {
            await db
              .update(anomalies)
              .set({ linearIssueId: created.id })
              .where(eq(anomalies.id, anomaly_id));
          }

          return { created: true, issueId: created?.id };
        } catch {
          // Linear failures don't block Slack notification
          return { created: false, reason: "error" };
        }
      });
    }

    return { status: "ok", ...result };
  }
);
