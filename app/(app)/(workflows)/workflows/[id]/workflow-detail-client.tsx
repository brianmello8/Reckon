"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { fmtMoney, fmtCompact, microsToDollars } from "@/lib/reckon/format";
import { getRunEventsAction } from "../../actions";

type Detail = {
  workflow: {
    id: string;
    name: string;
    status: "active" | "archived";
    agentName: string | null;
  };
  totalCostMicros: number;
  runCount: number;
  meanCostPerRun: number;
  p50: number;
  p95: number;
  max: number;
  runsWithCost: number;
  costByDay: { date: string; cost: number }[];
  byModel: { model: string; cost: number }[];
  perRunCosts: number[];
  runs: {
    id: string;
    externalRunId: string | null;
    startedAt: string | null;
    status: string;
    customerRef: string | null;
    costMicros: number;
  }[];
};

const money = (m: number) => fmtMoney(microsToDollars(m));

export function WorkflowDetailClient({
  range,
  detail,
}: {
  range: string;
  detail: Detail;
}) {
  return (
    <div className="space-y-6">
      <Link
        href={`/workflows?range=${range}`}
        className="inline-flex items-center gap-1 text-sm text-zinc-600 hover:text-zinc-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to workflows
      </Link>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {detail.workflow.name}
        </h1>
        <p className="mt-1 text-sm text-zinc-600">
          {detail.workflow.agentName
            ? `Agent: ${detail.workflow.agentName}`
            : "No agent"}
          {detail.workflow.status === "archived" && " · archived"}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Total cost" value={money(detail.totalCostMicros)} />
        <Stat label="Runs" value={String(detail.runCount)} />
        <Stat label="Mean / run" value={money(detail.meanCostPerRun)} />
        <Stat label="p50 / run" value={money(detail.p50)} />
        <Stat label="p95 / run" value={money(detail.p95)} />
        <Stat label="Max / run" value={money(detail.max)} />
      </div>

      {detail.runsWithCost < detail.runCount && (
        <p className="text-xs text-zinc-500">
          Per-run cost distribution covers {detail.runsWithCost} of{" "}
          {detail.runCount} runs — only runs that uniquely owned a model-day
          have a separable per-run cost (billed usage is reported daily).
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Cost over time">
          {detail.costByDay.length === 0 ? (
            <Empty />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart
                data={detail.costByDay.map((d) => ({
                  date: d.date.slice(5),
                  cost: microsToDollars(d.cost),
                }))}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="date" fontSize={11} />
                <YAxis tickFormatter={fmtCompact} fontSize={11} width={48} />
                <Tooltip formatter={(v) => fmtMoney(Number(v))} />
                <Area dataKey="cost" stroke="#6366f1" fill="#6366f133" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Panel>

        <Panel title="Cost-per-run distribution">
          {detail.perRunCosts.length === 0 ? (
            <Empty />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={histogram(detail.perRunCosts)}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="bucket" fontSize={11} />
                <YAxis allowDecimals={false} fontSize={11} width={32} />
                <Tooltip />
                <Bar dataKey="count" fill="#6366f1" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>
      </div>

      <Panel title="Model breakdown">
        {detail.byModel.length === 0 ? (
          <Empty />
        ) : (
          <div className="space-y-1.5">
            {detail.byModel.map((m) => (
              <div key={m.model} className="flex justify-between text-sm">
                <span className="text-ink-2">{m.model}</span>
                <span className="font-mono text-ink">{money(m.cost)}</span>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <RunExplorer runs={detail.runs} />
    </div>
  );
}

function RunExplorer({ runs }: { runs: Detail["runs"] }) {
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [events, setEvents] = React.useState<
    Record<string, Awaited<ReturnType<typeof getRunEventsAction>>>
  >({});
  const [loading, setLoading] = React.useState<string | null>(null);

  async function toggle(runId: string) {
    if (openId === runId) {
      setOpenId(null);
      return;
    }
    setOpenId(runId);
    if (!events[runId]) {
      setLoading(runId);
      try {
        const ev = await getRunEventsAction(runId);
        setEvents((m) => ({ ...m, [runId]: ev }));
      } finally {
        setLoading(null);
      }
    }
  }

  return (
    <div>
      <h2 className="mb-2 text-[15px] font-semibold text-ink">Run explorer</h2>
      {runs.length === 0 ? (
        <Empty />
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-paper">
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-bg-2 text-left text-[12px] text-ink-3">
              <tr>
                <th className="px-4 py-2 font-medium">Run</th>
                <th className="px-4 py-2 font-medium">Started</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Customer</th>
                <th className="px-4 py-2 font-medium">Cost</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <React.Fragment key={r.id}>
                  <tr
                    className="cursor-pointer border-b border-line last:border-0 hover:bg-bg-2"
                    onClick={() => toggle(r.id)}
                  >
                    <td className="px-4 py-2.5 font-mono text-[12px] text-ink">
                      {r.externalRunId ?? r.id.slice(0, 8)}
                    </td>
                    <td className="px-4 py-2.5 text-ink-2">
                      {r.startedAt
                        ? new Date(r.startedAt).toLocaleString()
                        : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-ink-2">{r.status}</td>
                    <td className="px-4 py-2.5 text-ink-2">
                      {r.customerRef ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-ink-2">
                      {r.costMicros > 0 ? money(r.costMicros) : "—"}
                    </td>
                  </tr>
                  {openId === r.id && (
                    <tr className="bg-bg-2/50">
                      <td colSpan={5} className="px-4 py-2">
                        {loading === r.id ? (
                          <p className="text-xs text-zinc-500">Loading…</p>
                        ) : (events[r.id]?.length ?? 0) === 0 ? (
                          <p className="text-xs text-zinc-500">
                            No billed usage links to this run (its model-day was
                            shared with other runs).
                          </p>
                        ) : (
                          <table className="w-full text-[12.5px]">
                            <thead className="text-left text-ink-3">
                              <tr>
                                <th className="py-1 font-medium">Day</th>
                                <th className="py-1 font-medium">Provider</th>
                                <th className="py-1 font-medium">Model</th>
                                <th className="py-1 font-medium">In/Out tok</th>
                                <th className="py-1 font-medium">Cost</th>
                              </tr>
                            </thead>
                            <tbody>
                              {events[r.id].map((e) => (
                                <tr key={e.id}>
                                  <td className="py-1 text-ink-2">{e.day}</td>
                                  <td className="py-1 text-ink-2">
                                    {e.providerName}
                                  </td>
                                  <td className="py-1 text-ink-2">{e.model}</td>
                                  <td className="py-1 font-mono text-ink-2">
                                    {e.inputTokens}/{e.outputTokens}
                                  </td>
                                  <td className="py-1 font-mono text-ink-2">
                                    {money(e.costMicros)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function histogram(costsMicros: number[]) {
  const dollars = costsMicros.map(microsToDollars);
  const max = Math.max(...dollars, 0);
  const buckets = 8;
  const width = max > 0 ? max / buckets : 1;
  const out = Array.from({ length: buckets }, (_, i) => ({
    bucket: fmtCompact(i * width),
    count: 0,
  }));
  for (const d of dollars) {
    const idx = Math.min(buckets - 1, Math.floor(d / width));
    out[idx].count += 1;
  }
  return out;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-paper p-3">
      <div className="text-[11.5px] text-ink-3">{label}</div>
      <div className="mt-0.5 font-mono text-[15px] font-semibold text-ink">
        {value}
      </div>
    </div>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-line bg-paper p-4">
      <h3 className="mb-3 text-[13.5px] font-semibold text-ink">{title}</h3>
      {children}
    </div>
  );
}

function Empty() {
  return <p className="py-6 text-center text-sm text-zinc-400">No data</p>;
}
