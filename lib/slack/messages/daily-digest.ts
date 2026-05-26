import type { KnownBlock } from "@slack/web-api";

export interface DigestData {
  orgName: string;
  date: string; // "Yesterday, Nov 14"
  totalCostMicros: bigint;
  vsTrailingAvgPct: number; // -10 means down 10%
  topDevelopers: Array<{
    name: string;
    costMicros: bigint;
    vsAvgPct: number;
  }>; // top 5
  unacknowledgedAnomalies: Array<{
    developerName: string;
    kind: string;
    severity: string;
    summary: string;
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
  if (pct > 0) return `▲ ${pct.toFixed(0)}%`;
  if (pct < 0) return `▼ ${Math.abs(pct).toFixed(0)}%`;
  return "— 0%";
}

function devDelta(pct: number): string {
  if (pct > 0) return `+${pct.toFixed(0)}%`;
  if (pct < 0) return `${pct.toFixed(0)}%`;
  return "0%";
}

export function buildDailyDigestBlocks(data: DigestData): KnownBlock[] {
  const blocks: KnownBlock[] = [];

  // Header
  blocks.push({
    type: "header",
    text: {
      type: "plain_text",
      text: `AI spend yesterday: ${fmtCost(data.totalCostMicros)} (${deltaArrow(data.vsTrailingAvgPct)} vs avg)`,
      emoji: true,
    },
  });

  // Date context
  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `*${data.orgName}* · ${data.date}`,
      },
    ],
  });

  // Top developers
  if (data.topDevelopers.length > 0) {
    const devLines = data.topDevelopers
      .map(
        (d, i) =>
          `${i + 1}. *${d.name}* — ${fmtCost(d.costMicros)} (${devDelta(d.vsAvgPct)} vs avg)`
      )
      .join("\n");

    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Top developers*\n${devLines}`,
      },
    });
  }

  // Anomalies
  if (data.unacknowledgedAnomalies.length > 0) {
    blocks.push({ type: "divider" });

    const anomalyLines = data.unacknowledgedAnomalies
      .map((a) => {
        const icon =
          a.severity === "critical"
            ? "🔴"
            : a.severity === "warn"
              ? "🟠"
              : "🔵";
        return `${icon} *${a.developerName}* — ${a.summary}`;
      })
      .join("\n");

    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Anomalies*\n${anomalyLines}`,
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
