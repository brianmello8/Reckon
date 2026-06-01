"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { fmtMoney, microsToDollars } from "@/lib/reckon/format";

type WorkflowRow = {
  id: string;
  name: string;
  status: "active" | "archived";
  agentId: string | null;
  agentName: string | null;
  totalCostMicros: number;
  runCount: number;
  meanCostPerRun: number;
  p95CostPerRun: number;
  runsWithCost: number;
};
type AgentRow = {
  agentId: string;
  agentName: string;
  costMicros: number;
  workflowCount: number;
};
type CustomerRow = { customerRef: string; costMicros: number };

const RANGES: { key: string; label: string }[] = [
  { key: "7d", label: "7d" },
  { key: "30d", label: "30d" },
  { key: "90d", label: "90d" },
  { key: "mtd", label: "MTD" },
];

export function WorkflowsClient({
  range,
  workflows,
  agents,
  customers,
}: {
  range: string;
  workflows: WorkflowRow[];
  agents: AgentRow[];
  customers: CustomerRow[];
}) {
  const [tab, setTab] = React.useState<"workflows" | "agents" | "customers">(
    "workflows"
  );
  const router = useRouter();
  const pathname = usePathname();

  function setRange(r: string) {
    router.push(`${pathname}?range=${r}`);
  }

  const money = (m: number) => fmtMoney(microsToDollars(m));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {(["workflows", "agents", "customers"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
                tab === t
                  ? "bg-ink text-paper"
                  : "text-ink-3 hover:bg-bg-2 hover:text-ink"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={`rounded-md px-2.5 py-1 text-[13px] font-medium transition-colors ${
                range === r.key
                  ? "bg-bg-2 text-ink"
                  : "text-ink-3 hover:bg-bg-2 hover:text-ink"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "workflows" && (
        <Table
          head={["Workflow", "Agent", "Total", "Runs", "Mean / run", "p95 / run"]}
          empty="No workflows yet. Connect observability (Langfuse/Helicone) or map agent keys to see workflow spend."
          rows={workflows.map((w) => [
            <Link
              key="n"
              href={`/workflows/${w.id}`}
              className="font-medium text-ink hover:underline"
            >
              {w.name}
              {w.status === "archived" && (
                <span className="ml-1 text-ink-3">(archived)</span>
              )}
            </Link>,
            w.agentName ?? "—",
            money(w.totalCostMicros),
            String(w.runCount),
            money(w.meanCostPerRun),
            w.runsWithCost > 0 ? money(w.p95CostPerRun) : "—",
          ])}
        />
      )}

      {tab === "agents" && (
        <Table
          head={["Agent", "Total", "Workflows"]}
          empty="No agent-attributed spend in this period."
          rows={agents.map((a) => [
            a.agentName,
            money(a.costMicros),
            String(a.workflowCount),
          ])}
        />
      )}

      {tab === "customers" && (
        <Table
          head={["Customer", "Total"]}
          empty="No per-customer attribution yet. Runs carry a customer ref when your observability data includes one."
          rows={customers.map((c) => [c.customerRef, money(c.costMicros)])}
        />
      )}
    </div>
  );
}

function Table({
  head,
  rows,
  empty,
}: {
  head: string[];
  rows: React.ReactNode[][];
  empty: string;
}) {
  if (rows.length === 0) {
    return <p className="py-6 text-sm text-zinc-500">{empty}</p>;
  }
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-paper">
      <table className="w-full text-sm">
        <thead className="border-b border-line bg-bg-2 text-left text-[12px] text-ink-3">
          <tr>
            {head.map((h, i) => (
              <th key={i} className="px-4 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, ri) => (
            <tr key={ri} className="border-b border-line last:border-0">
              {cells.map((c, ci) => (
                <td
                  key={ci}
                  className={`px-4 py-2.5 ${ci === 0 ? "text-ink" : "font-mono text-ink-2"}`}
                >
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
