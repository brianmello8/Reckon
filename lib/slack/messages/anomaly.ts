import type { KnownBlock } from "@slack/web-api";

export interface AnomalyMessageData {
  anomalyId: string;
  developerName: string;
  severity: "info" | "warn" | "critical";
  kind: string;
  amountMicros: number;
  multiple: number;
  trailing7dayAvgMicros: number;
  detectedAt: string;
  dashboardUrl: string;
}

function fmtCost(micros: number): string {
  const value = micros / 1_000_000;
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

const severityEmoji: Record<string, string> = {
  info: "🔵",
  warn: "🟠",
  critical: "🔴",
};

const severityColor: Record<string, string> = {
  info: "#3b82f6",
  warn: "#f97316",
  critical: "#ef4444",
};

const kindLabel: Record<string, string> = {
  spike: "Spike detected",
  sudden_increase: "Sudden increase",
  sustained_increase: "Sustained increase",
};

export function buildAnomalyBlocks(data: AnomalyMessageData): {
  blocks: KnownBlock[];
  color: string;
  text: string;
} {
  const emoji = severityEmoji[data.severity] ?? "⚠️";
  const color = severityColor[data.severity] ?? "#f97316";
  const label = kindLabel[data.kind] ?? data.kind;
  const text = `${emoji} AI spend anomaly: ${data.developerName} spent ${fmtCost(data.amountMicros)} yesterday — ${data.multiple}x their trailing 7-day average`;

  const blocks: KnownBlock[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `${emoji} AI spend anomaly detected`,
        emoji: true,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${data.developerName}* spent *${fmtCost(data.amountMicros)}* yesterday — *${data.multiple}x* their trailing 7-day average (${fmtCost(data.trailing7dayAvgMicros)})`,
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `${label} · ${data.severity.toUpperCase()} · Detected ${data.detectedAt}`,
        },
      ],
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "Acknowledge",
            emoji: true,
          },
          action_id: `ack_anomaly:${data.anomalyId}`,
          style: "primary",
        },
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "View dashboard",
            emoji: true,
          },
          url: data.dashboardUrl,
        },
      ],
    },
  ];

  return { blocks, color, text };
}

export function buildAcknowledgedBlocks(
  acknowledgedBy: string,
  acknowledgedAt: string
): KnownBlock[] {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `✅ Acknowledged by *${acknowledgedBy}* at ${acknowledgedAt}`,
      },
    },
  ];
}
