import type { KnownBlock } from "@slack/web-api";

export interface CommitmentAlertMessage {
  provider: string;
  commitmentType: string;
  kind: "under_utilization" | "overage" | "expiry";
  amountAtRiskMicros: number;
  date: string;
  message: string;
  dashboardUrl: string;
}

function fmtCost(micros: number): string {
  return `$${(micros / 1_000_000).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const KIND = {
  under_utilization: { emoji: "🟡", title: "Commitment under-utilized" },
  overage: { emoji: "🔴", title: "Commitment overage projected" },
  expiry: { emoji: "🟠", title: "Prepaid credit expiring" },
};

export function buildCommitmentAlertBlocks(data: CommitmentAlertMessage): {
  blocks: KnownBlock[];
  text: string;
} {
  const k = KIND[data.kind];
  const text = `${k.emoji} ${k.title}: ${data.provider} — ${fmtCost(data.amountAtRiskMicros)} at risk by ${data.date}`;
  const blocks: KnownBlock[] = [
    { type: "header", text: { type: "plain_text", text: `${k.emoji} ${k.title}`, emoji: true } },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${data.provider}* (${data.commitmentType.replace(/_/g, " ")})\n${data.message}\n*${fmtCost(data.amountAtRiskMicros)}* at risk by *${data.date}*.`,
      },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "View commitments", emoji: true },
          url: data.dashboardUrl,
        },
      ],
    },
  ];
  return { blocks, text };
}
