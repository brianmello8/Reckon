import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import { db } from "@/lib/db/client";
import { anomalies, slackInstallations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getSlackClient } from "@/lib/slack/client";
import { buildAcknowledgedBlocks } from "@/lib/slack/messages/anomaly";
import { format } from "date-fns";

const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET!;

function verifySlackSignature(
  body: string,
  timestamp: string,
  signature: string
): boolean {
  // Check timestamp is within 5 minutes
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp)) > 300) return false;

  const sigBase = `v0:${timestamp}:${body}`;
  const mySignature =
    "v0=" +
    createHmac("sha256", SLACK_SIGNING_SECRET).update(sigBase).digest("hex");

  return mySignature === signature;
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const timestamp = req.headers.get("x-slack-request-timestamp") ?? "";
  const signature = req.headers.get("x-slack-signature") ?? "";

  if (!verifySlackSignature(rawBody, timestamp, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const params = new URLSearchParams(rawBody);
  const payloadStr = params.get("payload");
  if (!payloadStr) {
    return NextResponse.json({ error: "Missing payload" }, { status: 400 });
  }

  const payload = JSON.parse(payloadStr);

  if (payload.type !== "block_actions") {
    return NextResponse.json({ ok: true });
  }

  for (const action of payload.actions ?? []) {
    const actionId: string = action.action_id ?? "";

    if (actionId.startsWith("ack_anomaly:")) {
      const anomalyId = actionId.replace("ack_anomaly:", "");
      const slackUserId = payload.user?.id ?? "unknown";
      const slackUserName = payload.user?.name ?? payload.user?.username ?? "someone";

      // Look up which org this workspace belongs to
      const workspaceId = payload.team?.id;
      if (!workspaceId) continue;

      const [install] = await db
        .select({ orgId: slackInstallations.orgId })
        .from(slackInstallations)
        .where(eq(slackInstallations.workspaceId, workspaceId))
        .limit(1);

      if (!install) continue;

      // Acknowledge the anomaly
      await db
        .update(anomalies)
        .set({ acknowledgedAt: new Date() })
        .where(eq(anomalies.id, anomalyId));

      // Update the original Slack message
      const client = await getSlackClient(install.orgId);
      if (client && payload.channel?.id && payload.message?.ts) {
        try {
          const blocks = buildAcknowledgedBlocks(
            slackUserName,
            format(new Date(), "MMM d, h:mm a")
          );
          await client.chat.update({
            channel: payload.channel.id,
            ts: payload.message.ts,
            blocks,
            text: `Acknowledged by ${slackUserName}`,
          });
        } catch {
          // Non-fatal — the DB update succeeded
        }
      }
    }
  }

  return NextResponse.json({ ok: true });
}
