import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import { db } from "@/lib/db/client";
import {
  slackInstallations,
  usageEvents,
  developers,
  organizations,
} from "@/lib/db/schema";
import { eq, and, between, sql, isNull, desc } from "drizzle-orm";
import { format, subDays } from "date-fns";

const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET!;

function verifySlackSignature(
  body: string,
  timestamp: string,
  signature: string
): boolean {
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp)) > 300) return false;
  const sigBase = `v0:${timestamp}:${body}`;
  const expected =
    "v0=" +
    createHmac("sha256", SLACK_SIGNING_SECRET).update(sigBase).digest("hex");
  return expected === signature;
}

function fmtCost(micros: number | bigint): string {
  const value = Number(micros) / 1_000_000;
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const timestamp = req.headers.get("x-slack-request-timestamp") ?? "";
  const signature = req.headers.get("x-slack-signature") ?? "";

  if (!verifySlackSignature(rawBody, timestamp, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const params = new URLSearchParams(rawBody);
  const teamId = params.get("team_id") ?? "";
  const text = (params.get("text") ?? "").trim();
  const responseUrl = params.get("response_url") ?? "";

  // Resolve org from workspace
  const [install] = await db
    .select({ orgId: slackInstallations.orgId })
    .from(slackInstallations)
    .where(eq(slackInstallations.workspaceId, teamId))
    .limit(1);

  if (!install) {
    return NextResponse.json({
      response_type: "ephemeral",
      text: "Reckon is not connected to this workspace. Ask your admin to set it up.",
    });
  }

  const orgId = install.orgId;

  // Parse subcommand
  const subcommand = text.toLowerCase().split(/\s+/)[0] || "";

  try {
    let result: string;

    if (subcommand === "help" || subcommand === "?") {
      result = helpText();
    } else if (subcommand === "yesterday") {
      result = await getSpendSummary(orgId, 1, 1, "Yesterday");
    } else if (subcommand === "week") {
      result = await getSpendSummary(orgId, 7, 7, "Last 7 days");
    } else if (subcommand.startsWith("<@")) {
      // @-mention: <@U12345|username>
      const slackUserId = subcommand.replace(/<@([^|>]+).*>/, "$1");
      result = await getDevSpend(orgId, slackUserId);
    } else {
      // Default: today so far
      result = await getSpendSummary(orgId, 0, 0, "Today so far");
    }

    // Return ephemeral response with "Make public" action
    return NextResponse.json({
      response_type: "ephemeral",
      blocks: [
        {
          type: "section",
          text: { type: "mrkdwn", text: result },
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: { type: "plain_text", text: "Share in channel", emoji: true },
              action_id: "spend_make_public",
              value: result,
            },
          ],
        },
      ],
      text: result,
    });
  } catch {
    return NextResponse.json({
      response_type: "ephemeral",
      text: "Something went wrong. Try again later.",
    });
  }
}

function helpText(): string {
  return [
    "*`/spend`* — today's totals",
    "*`/spend yesterday`* — yesterday's summary",
    "*`/spend week`* — last 7 days",
    "*`/spend @alice`* — a developer's last 7 days",
    "*`/spend help`* — this message",
  ].join("\n");
}

async function getSpendSummary(
  orgId: string,
  daysAgo: number,
  daysRange: number,
  label: string
): Promise<string> {
  const from = format(subDays(new Date(), daysAgo || 0), "yyyy-MM-dd");
  const to = daysAgo === 0 ? format(new Date(), "yyyy-MM-dd") : from;

  const rows = await db
    .select({
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
    .groupBy(developers.displayName)
    .orderBy(desc(sql`sum(${usageEvents.costUsdMicros})`))
    .limit(5);

  const total = rows.reduce((sum, r) => sum + Number(r.cost ?? 0), 0);

  if (total === 0) {
    return `*${label}:* No spend recorded.`;
  }

  const topDevs = rows
    .slice(0, 3)
    .map((r) => `${r.developerName} ${fmtCost(r.cost ?? 0n)}`)
    .join(", ");

  return `*${label}:* ${fmtCost(total)}. Top: ${topDevs}.`;
}

async function getDevSpend(
  orgId: string,
  slackUserId: string
): Promise<string> {
  // Find developer by slack_user_id
  const [dev] = await db
    .select({ id: developers.id, displayName: developers.displayName })
    .from(developers)
    .where(
      and(
        eq(developers.orgId, orgId),
        eq(developers.slackUserId, slackUserId),
        isNull(developers.deletedAt)
      )
    )
    .limit(1);

  if (!dev) {
    return "Could not find that developer. Make sure their Slack user ID is linked in Reckon.";
  }

  const from = format(subDays(new Date(), 7), "yyyy-MM-dd");
  const to = format(new Date(), "yyyy-MM-dd");

  const rows = await db
    .select({
      date: usageEvents.timeBucket,
      cost: sql<bigint>`sum(${usageEvents.costUsdMicros})`.as("cost"),
    })
    .from(usageEvents)
    .where(
      and(
        eq(usageEvents.orgId, orgId),
        eq(usageEvents.developerId, dev.id),
        between(usageEvents.timeBucket, from, to)
      )
    )
    .groupBy(usageEvents.timeBucket)
    .orderBy(usageEvents.timeBucket);

  const total = rows.reduce((sum, r) => sum + Number(r.cost ?? 0), 0);

  if (total === 0) {
    return `*${dev.displayName}* — no spend in the last 7 days.`;
  }

  const daily = rows
    .map((r) => `${r.date}: ${fmtCost(r.cost ?? 0n)}`)
    .join("\n");

  return `*${dev.displayName}* — last 7 days: ${fmtCost(total)}\n${daily}`;
}
