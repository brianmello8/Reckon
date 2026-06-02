import type { KnownBlock } from "@slack/web-api";

export interface MarginAlertMessage {
  grain: "customer" | "workflow" | "product_line";
  label: string;
  kind: "negative_margin" | "erosion";
  costMicros: number;
  revenueMicros: number;
  marginAtRiskMicros: number;
  window: string;
  dashboardUrl: string;
}

function fmtCost(micros: number): string {
  return `$${(micros / 1_000_000).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const GRAIN_LABEL = { customer: "Customer", workflow: "Workflow", product_line: "Product line" };
const KIND = {
  negative_margin: { emoji: "🔴", title: "Negative margin — AI cost exceeds revenue" },
  erosion: { emoji: "🟡", title: "Margin erosion — AI cost is a large share of revenue" },
};

export function buildMarginAlertBlocks(data: MarginAlertMessage): { blocks: KnownBlock[]; text: string } {
  const k = KIND[data.kind];
  const g = GRAIN_LABEL[data.grain];
  const text = `${k.emoji} ${k.title}: ${g} ${data.label} — ${fmtCost(data.marginAtRiskMicros)} margin at risk (${data.window})`;
  const blocks: KnownBlock[] = [
    { type: "header", text: { type: "plain_text", text: `${k.emoji} ${k.title}`, emoji: true } },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${g}: ${data.label}* (${data.window})\nAI cost *${fmtCost(data.costMicros)}* vs revenue *${fmtCost(data.revenueMicros)}*.\n*${fmtCost(data.marginAtRiskMicros)}* margin at risk.`,
      },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "View unit economics", emoji: true },
          url: data.dashboardUrl,
        },
      ],
    },
  ];
  return { blocks, text };
}
