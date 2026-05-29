"use client";

import * as React from "react";
import {
  Avatar,
  Sparkline,
  ShareBar,
  SeverityBadge,
} from "@/components/reckon/primitives";
import { MOCK } from "@/lib/reckon/mock";
import { fmtMoney, microsToDollars } from "@/lib/reckon/format";

/* Authentic 4-color Slack mark */
function SlackMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path fill="#E01E5A" d="M6 15a2 2 0 1 1-2-2h2v2zm1 0a2 2 0 1 1 4 0v5a2 2 0 1 1-4 0v-5z" />
      <path fill="#36C5F0" d="M9 6a2 2 0 1 1 2 2H9V6zm0 1a2 2 0 1 1 0 4H4a2 2 0 1 1 0-4h5z" />
      <path fill="#2EB67D" d="M18 9a2 2 0 1 1 2 2h-2V9zm-1 0a2 2 0 1 1-4 0V4a2 2 0 1 1 4 0v5z" />
      <path fill="#ECB22E" d="M15 18a2 2 0 1 1-2-2h2v2zm0-1a2 2 0 1 1 0-4h5a2 2 0 1 1 0 4h-5z" />
    </svg>
  );
}

export function MarketingShowcase() {
  const top = MOCK.developers.slice(0, 4);
  const totalAll = MOCK.developers.reduce((a, d) => a + d.totalCost, 0);
  const yesterday = microsToDollars(MOCK.dashboard.stats.totalCostMicros) / 30; // rough daily
  const crit = MOCK.anomalies.find((a) => a.severity === "critical") ?? MOCK.anomalies[0];

  // per-dev sparkline from mock daily-by-dev
  const devSpark = React.useMemo(() => {
    const dates = Array.from(new Set(MOCK.dashboard.dailyByDev.map((r) => r.date))).sort();
    const idx = new Map(dates.map((d, i) => [d, i]));
    const m = new Map<string, number[]>();
    for (const r of MOCK.dashboard.dailyByDev) {
      if (!m.has(r.name)) m.set(r.name, new Array(dates.length).fill(0));
      m.get(r.name)![idx.get(r.date)!] += microsToDollars(r.cost);
    }
    return m;
  }, []);

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {/* Slack digest mock */}
      <div className="rounded-xl border border-line bg-paper p-4 shadow-sm lg:row-span-1">
        <div className="flex items-center gap-2 border-b border-line pb-2.5">
          <SlackMark />
          <span className="text-[13px] font-semibold text-ink">#eng-spend</span>
        </div>
        <div className="mt-3 flex gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-ink text-[13px] font-bold text-paper">
            R
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[13px] font-semibold text-ink">Reckon</span>
              <span className="rounded bg-bg-2 px-1 text-[9px] font-bold uppercase tracking-wide text-ink-3">
                App
              </span>
              <span className="text-[11px] text-ink-4">9:00 AM</span>
            </div>
            <p className="mt-1 text-[13px] text-ink">
              📊 AI spend yesterday:{" "}
              <span className="mono font-semibold">{fmtMoney(yesterday)}</span>{" "}
              <span className="text-neg">▲ 12%</span>
            </p>
            <div className="mt-2 space-y-1 text-[12.5px] text-ink-2">
              {top.slice(0, 3).map((d, i) => (
                <div key={d.id} className="flex justify-between gap-2">
                  <span className="truncate">
                    {i + 1}. {d.displayName}
                  </span>
                  <span className="mono text-ink">
                    {fmtMoney(microsToDollars(d.totalCost) / 30)}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-2 rounded-md border-l-2 border-crit bg-crit-bg/40 px-2 py-1 text-[12px] text-ink-2">
              ⚠️ {crit.developerName} — {crit.multiple}× their 7-day average
            </div>
          </div>
        </div>
      </div>

      {/* Developer leaderboard */}
      <div className="rounded-xl border border-line bg-paper p-5 shadow-sm">
        <span className="eyebrow">Developers by spend</span>
        <div className="mt-3 flex flex-col gap-2.5">
          {top.map((d, i) => {
            const spark = devSpark.get(d.displayName) ?? [];
            return (
              <div key={d.id} className="flex items-center gap-2.5">
                <Avatar name={d.displayName} size={26} hue={(i * 47) % 360} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium text-ink">
                    {d.displayName}
                  </div>
                  <div className="mt-1 max-w-[120px]">
                    <ShareBar
                      parts={[{ k: "x", value: (d.totalCost / totalAll) * 100 }]}
                      total={100}
                      h={4}
                    />
                  </div>
                </div>
                {spark.length > 0 && (
                  <Sparkline values={spark} w={56} h={22} color="var(--ink-4)" />
                )}
                <span className="mono w-16 text-right text-[12.5px] text-ink">
                  {fmtMoney(microsToDollars(d.totalCost))}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Anomaly alert card */}
      <div className="overflow-hidden rounded-xl border border-line bg-paper shadow-sm">
        <div className="flex gap-3 p-5">
          <span
            className="-my-5 -ml-5 w-1 shrink-0"
            style={{ background: "var(--sev-crit)" }}
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <SeverityBadge severity="critical" />
              <span className="text-[12px] text-ink-3">2 hours ago</span>
            </div>
            <div className="mono mt-2 text-[26px] font-semibold text-ink">
              {crit.multiple}×
              <span className="ml-2 text-[13px] font-normal text-ink-3">
                above baseline
              </span>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Avatar name={crit.developerName} size={22} hue={120} />
              <span className="text-[13px] font-medium text-ink">
                {crit.developerName}
              </span>
            </div>
            <p className="mt-3 text-[12.5px] leading-relaxed text-ink-2">
              Spent {fmtMoney(412.4)} yesterday on claude-opus-4 — well above the
              mean + 3σ threshold for this developer.
            </p>
            <div className="mt-3 flex gap-2">
              <span className="inline-flex h-7 items-center rounded-lg bg-ink px-3 text-[12px] font-medium text-paper">
                Acknowledge
              </span>
              <span className="inline-flex h-7 items-center rounded-lg border border-line-2 px-3 text-[12px] font-medium text-ink-2">
                Investigate
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export { SlackMark };
