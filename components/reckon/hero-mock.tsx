"use client";

import * as React from "react";
import { AreaChart, type ChartSeries } from "@/components/reckon/charts";
import { StatTile } from "@/components/reckon/primitives";
import { MOCK } from "@/lib/reckon/mock";
import { fmtMoney, microsToDollars } from "@/lib/reckon/format";

function colorByProviderName(name: string): string {
  const l = name.toLowerCase();
  if (l.includes("anthropic")) return "var(--p-anthropic)";
  if (l.includes("openai")) return "var(--p-openai)";
  return "var(--p-copilot)";
}

export function HeroMock() {
  const { dates, series, total } = React.useMemo(() => {
    const rows = MOCK.dashboard.dailyByProvider;
    const dts = Array.from(new Set(rows.map((r) => r.date))).sort();
    const idx = new Map(dts.map((d, i) => [d, i]));
    const byName = new Map<string, number[]>();
    let tot = 0;
    for (const r of rows) {
      if (!byName.has(r.name)) byName.set(r.name, new Array(dts.length).fill(0));
      const dollars = microsToDollars(r.cost);
      byName.get(r.name)![idx.get(r.date)!] += dollars;
      tot += dollars;
    }
    const s: ChartSeries[] = [...byName.entries()].map(([name, values]) => ({
      key: name,
      label: name,
      color: colorByProviderName(name),
      values,
    }));
    return { dates: dts.map((d) => d.slice(5).replace("-", "/")), series: s, total: tot };
  }, []);

  return (
    <div className="overflow-hidden rounded-xl border border-line-2 bg-paper shadow-lg">
      {/* browser chrome */}
      <div className="flex items-center gap-2 border-b border-line bg-bg-2 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-[#e6685a]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#e9b44c]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#5bb87a]" />
        <span className="mono ml-3 text-[11.5px] text-ink-3">getreckon.dev/dashboard</span>
      </div>
      <div className="p-5">
        <div className="grid grid-cols-3 gap-3">
          <StatTile label="Total spend · 30d" value={fmtMoney(total, 0)} delta={0.16} />
          <StatTile label="Developers" value={MOCK.dashboard.stats.activeDevelopers} />
          <StatTile label="Open anomalies" value={MOCK.recentAnomalies.length} sub="needs review" />
        </div>
        <div className="mt-4 rounded-lg border border-line p-3">
          <AreaChart series={series} dates={dates} height={220} />
        </div>
      </div>
    </div>
  );
}
