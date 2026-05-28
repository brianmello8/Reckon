import type { KnownBlock } from "@slack/web-api";

export interface WeeklyDigestData {
  orgName: string;
  weekLabel: string; // "May 19 – May 25"
  totalCostMicros: bigint;
  priorWeekCostMicros: bigint;
  vsWeekPct: number;
  topDevelopers: Array<{
    name: string;
    costMicros: bigint;
    pctOfTotal: number;
  }>;
  spendByProvider: Array<{
    name: string;
    costMicros: bigint;
  }>;
  anomalyCount: number;
  anomalySeverityBreakdown: { info: number; warn: number; critical: number };
  notableChanges: Array<{
    name: string;
    changePct: number; // +50 or -30
  }>;
  dashboardUrl: string;
}

function fmtCost(micros: bigint | number): string {
  const value = Number(micros) / 1_000_000;
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function deltaArrow(pct: number): string {
  if (pct > 0) return `+${pct.toFixed(0)}%`;
  if (pct < 0) return `${pct.toFixed(0)}%`;
  return "0%";
}

export function buildWeeklyDigestBlocks(data: WeeklyDigestData): KnownBlock[] {
  const blocks: KnownBlock[] = [];

  // Header
  blocks.push({
    type: "header",
    text: {
      type: "plain_text",
      text: `Weekly AI spend recap: ${data.orgName}`,
      emoji: true,
    },
  });

  // Week summary
  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: `*${data.weekLabel}*\nTotal: *${fmtCost(data.totalCostMicros)}* (${deltaArrow(data.vsWeekPct)} vs prior week)`,
    },
  });

  // Top developers
  if (data.topDevelopers.length > 0) {
    const devLines = data.topDevelopers
      .map(
        (d, i) =>
          `${i + 1}. *${d.name}* — ${fmtCost(d.costMicros)} (${d.pctOfTotal.toFixed(0)}%)`
      )
      .join("\n");

    blocks.push({ type: "divider" });
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Top developers*\n${devLines}`,
      },
    });
  }

  // Spend by provider
  if (data.spendByProvider.length > 0) {
    const providerLines = data.spendByProvider
      .map((p) => `${p.name}: ${fmtCost(p.costMicros)}`)
      .join(" · ");

    blocks.push({ type: "divider" });
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Spend by provider*\n${providerLines}`,
      },
    });
  }

  // Anomalies
  if (data.anomalyCount > 0) {
    const breakdown = [
      data.anomalySeverityBreakdown.critical > 0
        ? `${data.anomalySeverityBreakdown.critical} critical`
        : null,
      data.anomalySeverityBreakdown.warn > 0
        ? `${data.anomalySeverityBreakdown.warn} warning`
        : null,
      data.anomalySeverityBreakdown.info > 0
        ? `${data.anomalySeverityBreakdown.info} info`
        : null,
    ]
      .filter(Boolean)
      .join(", ");

    blocks.push({ type: "divider" });
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Anomalies this week:* ${data.anomalyCount} (${breakdown})`,
      },
    });
  }

  // Notable changes
  if (data.notableChanges.length > 0) {
    const changeLines = data.notableChanges
      .map((c) => `${c.name}: ${deltaArrow(c.changePct)}`)
      .join("\n");

    blocks.push({ type: "divider" });
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Notable changes* (>50% week-over-week)\n${changeLines}`,
      },
    });
  }

  // Footer
  blocks.push({ type: "divider" });
  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `<${data.dashboardUrl}|View full dashboard>`,
      },
    ],
  });

  return blocks;
}
