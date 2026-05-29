"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Download, Users, Cpu, AlertTriangle } from "lucide-react";
import { AreaChart, Donut, type ChartSeries } from "@/components/reckon/charts";
import {
  StatTile,
  Sparkline,
  ShareBar,
  Segmented,
  Avatar,
  Delta,
  SeverityBadge,
} from "@/components/reckon/primitives";
import { PageHead } from "@/components/reckon/page-head";
import { fmtMoney, microsToDollars, modelLabel } from "@/lib/reckon/format";

type Daily = { date: string; name: string; cost: number };

type DashboardData = {
  stats: {
    totalCostMicros: string;
    priorCostMicros: string;
    deltaPct: number;
    activeDevelopers: number;
    topModel: string;
  };
  dailyByDev: Daily[];
  dailyByProvider: Daily[];
  dailyByModel: Daily[];
  devRanking: {
    developerId: string;
    name: string;
    totalCost: string;
    pctOfOrg: number;
    keyCount: number;
  }[];
};

type Anomaly = {
  id: string;
  developerId: string;
  developerName: string;
  kind: string;
  severity: "info" | "warn" | "critical";
  multiple: number | null;
  detectedAt: string;
};

const RANGES = [
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "mtd", label: "MTD" },
] as const;

const SERIES_PALETTE = [
  "var(--p-anthropic)",
  "var(--p-openai)",
  "var(--p-copilot)",
  "var(--brand)",
  "#8b6f47",
  "#5b8a72",
  "#9a6f9a",
  "#c99a3b",
];

const mmdd = (iso: string) => iso.slice(5).replace("-", "/");

/** Pivot flat [{date,name,cost(micros)}] into aligned chart series (dollars). */
function pivot(
  rows: Daily[],
  colorFor: (name: string, i: number) => string,
  labelFor: (name: string) => string,
  topN = 6
): { dates: string[]; series: ChartSeries[] } {
  const dates = Array.from(new Set(rows.map((r) => r.date))).sort();
  const dateIdx = new Map(dates.map((d, i) => [d, i]));
  const byName = new Map<string, number[]>();
  for (const r of rows) {
    if (!byName.has(r.name)) byName.set(r.name, new Array(dates.length).fill(0));
    byName.get(r.name)![dateIdx.get(r.date)!] += microsToDollars(r.cost);
  }
  // rank names by total, keep top N, fold rest into "Others"
  const ranked = [...byName.entries()].sort(
    (a, b) => b[1].reduce((x, y) => x + y, 0) - a[1].reduce((x, y) => x + y, 0)
  );
  const top = ranked.slice(0, topN);
  const rest = ranked.slice(topN);
  const series: ChartSeries[] = top.map(([name, values], i) => ({
    key: name,
    label: labelFor(name),
    color: colorFor(name, i),
    values,
  }));
  if (rest.length) {
    const others = new Array(dates.length).fill(0);
    for (const [, v] of rest) v.forEach((x, i) => (others[i] += x));
    series.push({
      key: "__others",
      label: `${rest.length} others`,
      color: "var(--ink-4)",
      values: others,
    });
  }
  return { dates: dates.map(mmdd), series };
}

export function DashboardClient({
  data,
  range,
  orgName,
  recentAnomalies,
}: {
  data: DashboardData;
  range: string;
  orgName: string;
  recentAnomalies: Anomaly[];
}) {
  const router = useRouter();
  const [mode, setMode] = React.useState<"provider" | "developer" | "model">(
    "provider"
  );

  const totalDollars = microsToDollars(data.stats.totalCostMicros);
  const priorDollars = microsToDollars(data.stats.priorCostMicros);
  const isEmpty = totalDollars === 0;

  // daily totals (from provider rows) → hero sparkline
  const dailyTotals = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const r of data.dailyByProvider) {
      m.set(r.date, (m.get(r.date) ?? 0) + microsToDollars(r.cost));
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map((e) => e[1]);
  }, [data.dailyByProvider]);

  // provider mix → donut
  const providerMix = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const r of data.dailyByProvider) {
      m.set(r.name, (m.get(r.name) ?? 0) + microsToDollars(r.cost));
    }
    return [...m.entries()]
      .map(([name, value]) => ({ k: name, value, color: colorByProviderName(name) }))
      .sort((a, b) => b.value - a.value);
  }, [data.dailyByProvider]);

  // per-developer daily series → leaderboard sparklines
  const devSeries = React.useMemo(() => {
    const dates = Array.from(
      new Set(data.dailyByDev.map((r) => r.date))
    ).sort();
    const dateIdx = new Map(dates.map((d, i) => [d, i]));
    const m = new Map<string, number[]>();
    for (const r of data.dailyByDev) {
      if (!m.has(r.name)) m.set(r.name, new Array(dates.length).fill(0));
      m.get(r.name)![dateIdx.get(r.date)!] += microsToDollars(r.cost);
    }
    return m;
  }, [data.dailyByDev]);

  const chart = React.useMemo(() => {
    if (mode === "provider")
      return pivot(data.dailyByProvider, (n) => colorByProviderName(n), (n) => n);
    if (mode === "developer")
      return pivot(
        data.dailyByDev,
        (_n, i) => SERIES_PALETTE[i % SERIES_PALETTE.length],
        (n) => n
      );
    return pivot(
      data.dailyByModel,
      (_n, i) => SERIES_PALETTE[i % SERIES_PALETTE.length],
      (n) => modelLabel(n)
    );
  }, [mode, data]);

  const days = range === "7d" ? 7 : range === "mtd" ? 30 : 30;

  return (
    <div>
      <PageHead
        title="Spend overview"
        sub={`${orgName} · ${data.stats.activeDevelopers} developers · 3 providers`}
      >
        <Segmented
          options={RANGES.map((r) => ({ value: r.value, label: r.label }))}
          value={range as string}
          onChange={(v) => router.push(`/dashboard?range=${v}`)}
        />
        <button className="inline-flex h-[30px] items-center gap-1.5 rounded-md border border-line-2 bg-paper px-3 text-[12.5px] font-medium text-ink hover:bg-bg-2">
          <Download size={14} /> Export
        </button>
      </PageHead>

      {/* Hero band */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.55fr_1fr]">
        <div className="rounded-xl border border-line bg-paper p-5 shadow-sm">
          <span className="eyebrow">Total spend · last {days} days</span>
          <div className="mt-2 flex items-baseline gap-3">
            <span
              className="mono font-semibold leading-none"
              style={{ fontSize: 46, letterSpacing: "-.03em" }}
            >
              {fmtMoney(totalDollars)}
            </span>
            <Delta value={data.stats.deltaPct / 100} size={15} />
          </div>
          <p className="mt-2 text-[13px] text-ink-3">
            vs {fmtMoney(priorDollars)} prior period · projected{" "}
            {fmtMoney((totalDollars / days) * 30)}/mo run-rate
          </p>
          <div className="mt-4">
            {dailyTotals.length > 0 && (
              <Sparkline
                values={dailyTotals}
                color="var(--brand)"
                w={620}
                h={64}
                fill
                dot={false}
              />
            )}
          </div>
        </div>

        <div className="rounded-xl border border-line bg-paper p-5 shadow-sm">
          <span className="eyebrow">Provider mix</span>
          <div className="mt-3 flex items-center gap-5">
            <Donut
              parts={providerMix}
              size={132}
              centerValue={fmtMoney(totalDollars, 0)}
              centerLabel="total"
            />
            <div className="flex flex-1 flex-col gap-2">
              {providerMix.map((p) => (
                <div key={p.k} className="flex items-center gap-2 text-[13px]">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: p.color }}
                  />
                  <span className="text-ink-2">{p.k}</span>
                  <span className="mono ml-auto text-ink">{fmtMoney(p.value)}</span>
                </div>
              ))}
              {providerMix.length === 0 && (
                <span className="text-[13px] text-ink-3">No spend yet.</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Stat row */}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile
          label="Active developers"
          value={data.stats.activeDevelopers}
          icon={<Users size={15} />}
        />
        <StatTile
          label="Most-used model"
          value={
            <span className="text-[18px]">{modelLabel(data.stats.topModel)}</span>
          }
          icon={<Cpu size={15} />}
        />
        <StatTile
          label="Open anomalies"
          value={recentAnomalies.length}
          sub={recentAnomalies.length ? "needs review" : "all clear"}
          icon={<AlertTriangle size={15} />}
        />
      </div>

      {/* Daily spend chart */}
      <div className="mt-4 rounded-xl border border-line bg-paper p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-semibold text-ink">Daily spend</h2>
            <p className="text-[12.5px] text-ink-3">Hover to inspect a day</p>
          </div>
          <Segmented
            options={[
              { value: "provider", label: "By provider" },
              { value: "developer", label: "By developer" },
              { value: "model", label: "By model" },
            ]}
            value={mode}
            onChange={setMode}
          />
        </div>
        <div className="mt-4">
          {isEmpty ? (
            <div className="flex h-64 items-center justify-center text-[13.5px] text-ink-3">
              No usage data yet. Add provider keys and run ingestion.
            </div>
          ) : (
            <AreaChart
              series={chart.series}
              dates={chart.dates}
              height={300}
              animateKey={mode}
            />
          )}
        </div>
        {!isEmpty && (
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-line pt-3">
            {chart.series.map((s) => (
              <span key={s.key} className="flex items-center gap-1.5 text-[12px] text-ink-2">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: s.color }}
                />
                {s.label}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Bottom grid */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1.5fr_1fr]">
        {/* Leaderboard */}
        <div className="rounded-xl border border-line bg-paper p-5 shadow-sm">
          <h2 className="text-[15px] font-semibold text-ink">Developers by spend</h2>
          <div className="mt-3 flex flex-col">
            {data.devRanking.length === 0 && (
              <p className="py-8 text-center text-[13px] text-ink-3">
                No developer spend in this period.
              </p>
            )}
            {data.devRanking.slice(0, 8).map((d, i) => {
              const spark = devSeries.get(d.name) ?? [];
              const rising =
                spark.length > 1 && spark[spark.length - 1] > spark[0];
              return (
                <Link
                  key={d.developerId}
                  href={`/developers/${d.developerId}`}
                  className="flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-bg-2"
                >
                  <span className="mono w-4 text-[12px] text-ink-4">{i + 1}</span>
                  <Avatar name={d.name} size={28} hue={(i * 47) % 360} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-medium text-ink">
                      {d.name}
                    </div>
                    <div className="mt-1 max-w-[160px]">
                      <ShareBar parts={[{ k: "x", value: d.pctOfOrg }]} total={100} h={4} />
                    </div>
                  </div>
                  {spark.length > 0 && (
                    <Sparkline
                      values={spark}
                      w={70}
                      h={26}
                      color={rising ? "var(--brand)" : "var(--ink-4)"}
                      highlightSpike={rising}
                    />
                  )}
                  <span className="mono w-20 text-right text-[13px] text-ink">
                    {fmtMoney(microsToDollars(d.totalCost))}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Recent anomalies */}
        <div className="rounded-xl border border-line bg-paper p-5 shadow-sm">
          <h2 className="text-[15px] font-semibold text-ink">Recent anomalies</h2>
          <div className="mt-3 flex flex-col gap-2.5">
            {recentAnomalies.length === 0 ? (
              <p className="py-8 text-center text-[13px] text-ink-3">No anomalies.</p>
            ) : (
              recentAnomalies.map((a) => (
                <Link
                  key={a.id}
                  href="/anomalies"
                  className="block rounded-lg border-l-[3px] bg-bg-2 px-3 py-2.5 transition-opacity hover:opacity-80"
                  style={{ borderColor: severityColor(a.severity) }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <SeverityBadge severity={a.severity} />
                    {a.multiple != null && (
                      <span className="mono text-[13px] font-semibold text-ink">
                        {a.multiple}×
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 truncate text-[13px] text-ink-2">
                    {a.developerName} · {a.kind.replace("_", " ")}
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function colorByProviderName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("anthropic")) return "var(--p-anthropic)";
  if (lower.includes("openai")) return "var(--p-openai)";
  if (lower.includes("copilot") || lower.includes("github")) return "var(--p-copilot)";
  return "var(--ink-4)";
}

function severityColor(s: string): string {
  if (s === "critical") return "var(--sev-crit)";
  if (s === "warn") return "var(--sev-warn)";
  return "var(--sev-info)";
}
