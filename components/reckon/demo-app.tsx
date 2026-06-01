"use client";

import * as React from "react";
import Link from "next/link";
import {
  LayoutDashboard,
  Users,
  AlertTriangle,
  Key,
  Plug,
  ArrowLeft,
} from "lucide-react";
import { DashboardClient } from "@/app/(app)/(operations)/dashboard/dashboard-client";
import { MOCK } from "@/lib/reckon/mock";
import { Logo, Avatar, SeverityBadge, ShareBar } from "@/components/reckon/primitives";
import { ThemeToggle } from "@/components/reckon/theme-toggle";
import { PageHead } from "@/components/reckon/page-head";
import { fmtMoney, microsToDollars } from "@/lib/reckon/format";
import { formatDistanceToNow } from "date-fns";

type Screen = "dashboard" | "developers" | "anomalies" | "providers" | "integrations";

const NAV: { id: Screen; label: string; icon: typeof Users; badge?: boolean }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "developers", label: "Developers", icon: Users },
  { id: "anomalies", label: "Anomalies", icon: AlertTriangle, badge: true },
  { id: "providers", label: "Providers", icon: Key },
  { id: "integrations", label: "Integrations", icon: Plug },
];

export function DemoApp() {
  const [screen, setScreen] = React.useState<Screen>("dashboard");
  const unack = MOCK.anomalies.length;

  return (
    <div className="flex h-screen overflow-hidden bg-bg-warm">
      {/* Sidebar */}
      <aside className="hidden w-[232px] shrink-0 flex-col border-r border-line bg-paper lg:flex">
        <div className="flex h-[60px] items-center border-b border-line px-[18px]">
          <Logo />
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 p-3">
          {NAV.map((item) => {
            const on = screen === item.id;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => setScreen(item.id)}
                className={`relative flex items-center gap-[11px] rounded-[9px] px-[11px] py-2 text-left text-[13.5px] font-medium transition-colors ${
                  on ? "bg-bg-2 text-ink" : "text-ink-3 hover:bg-bg-2 hover:text-ink"
                }`}
              >
                {on && (
                  <span className="absolute -left-3 bottom-2 top-2 w-[3px] rounded-[3px] bg-brand" />
                )}
                <Icon size={17} strokeWidth={on ? 2.2 : 1.9} />
                {item.label}
                {item.badge && unack > 0 && (
                  <span className="mono ml-auto inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-semibold text-white">
                    {unack}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
        <div className="border-t border-line p-3">
          <div className="rounded-xl border border-line bg-bg-2 p-3">
            <div className="flex items-center gap-2">
              <span className="pulse-dot" />
              <span className="text-[12.5px] font-semibold text-ink">Ingestion live</span>
            </div>
            <p className="mt-1.5 text-[11.5px] leading-snug text-ink-3">
              Last poll 6m ago · next in 54m
            </p>
          </div>
        </div>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Demo banner */}
        <div className="flex items-center justify-center gap-2 bg-brand-soft px-4 py-1.5 text-[12.5px] text-brand-ink">
          <span className="font-medium">Interactive demo</span>
          <span className="text-ink-3">· sample data, nothing is saved</span>
        </div>

        {/* Topbar */}
        <header
          className="sticky top-0 z-10 flex h-[56px] shrink-0 items-center justify-between border-b border-line px-4 backdrop-blur lg:px-[26px]"
          style={{ background: "color-mix(in oklab, var(--paper) 82%, transparent)" }}
        >
          <div className="flex items-center gap-2">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-[7px] bg-ink text-[12px] font-bold text-paper">
              N
            </span>
            <span className="text-[13.5px] font-semibold text-ink">Northwind</span>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link
              href="/sign-up"
              className="inline-flex h-8 items-center rounded-lg bg-brand px-4 text-[12.5px] font-medium text-white hover:opacity-90"
            >
              Start free
            </Link>
            <Link
              href="/"
              className="inline-flex items-center gap-1 text-[12.5px] text-ink-2 hover:text-ink"
            >
              <ArrowLeft size={14} /> Exit
            </Link>
          </div>
        </header>

        {/* Mobile screen nav (sidebar is hidden below lg) */}
        <nav className="flex gap-1 overflow-x-auto border-b border-line bg-paper px-3 py-2 lg:hidden">
          {NAV.map((item) => {
            const on = screen === item.id;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => setScreen(item.id)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors ${
                  on ? "bg-bg-2 text-ink" : "text-ink-3"
                }`}
              >
                <Icon size={15} strokeWidth={on ? 2.2 : 1.9} />
                {item.label}
                {item.badge && unack > 0 && (
                  <span className="mono inline-flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-brand px-1 text-[10px] font-semibold text-white">
                    {unack}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1180px] px-4 py-7 lg:px-[26px] fade-up" key={screen}>
            {screen === "dashboard" && (
              <DashboardClient
                data={MOCK.dashboard}
                range="30d"
                orgName="Northwind"
                recentAnomalies={MOCK.recentAnomalies}
                demo
              />
            )}
            {screen === "developers" && <DemoDevelopers />}
            {screen === "anomalies" && <DemoAnomalies />}
            {screen === "providers" && <DemoProviders />}
            {screen === "integrations" && <DemoIntegrations />}
          </div>
        </main>
      </div>
    </div>
  );
}

function DemoDevelopers() {
  const total = MOCK.developers.reduce((a, d) => a + d.totalCost, 0);
  return (
    <div>
      <PageHead title="Developers" sub="Northwind · 10 developers · 3 providers" />
      <div className="overflow-hidden rounded-xl border border-line bg-paper shadow-sm">
        <table className="w-full">
          <thead>
            <tr className="border-b border-line">
              {["Developer", "Share", "30-day spend", "Keys"].map((h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MOCK.developers.map((d, i) => (
              <tr key={d.id} className="border-b border-line transition-colors last:border-0 hover:bg-bg-2">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <Avatar name={d.displayName} size={28} hue={(i * 47) % 360} />
                    <div>
                      <div className="text-[13.5px] font-medium text-ink">{d.displayName}</div>
                      <div className="text-[12px] text-ink-3">{d.email}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="max-w-[160px]">
                    <ShareBar parts={[{ k: "x", value: (d.totalCost / total) * 100 }]} total={100} h={4} />
                  </div>
                </td>
                <td className="px-4 py-3 mono text-[13.5px] text-ink">
                  {fmtMoney(microsToDollars(d.totalCost))}
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex h-[21px] items-center rounded-full bg-bg-2 px-2.5 text-[11.5px] font-medium text-ink-2">
                    {d.keyCount} keys
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DemoAnomalies() {
  return (
    <div>
      <PageHead title="Anomalies" sub="Flagged at mean + 3σ over a trailing 28-day window." />
      <div className="flex flex-col gap-3">
        {MOCK.anomalies.map((a, i) => (
          <div key={a.id} className="overflow-hidden rounded-xl border border-line bg-paper shadow-sm">
            <div className="flex gap-4 p-4">
              <span
                className="-my-4 -ml-4 w-1 shrink-0"
                style={{
                  background:
                    a.severity === "critical"
                      ? "var(--sev-crit)"
                      : a.severity === "warn"
                        ? "var(--sev-warn)"
                        : "var(--sev-info)",
                }}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <SeverityBadge severity={a.severity} />
                  <span className="inline-flex h-[21px] items-center rounded-full bg-bg-2 px-2.5 text-[11.5px] font-medium text-ink-2">
                    {a.kind.replace("_", " ")}
                  </span>
                  <span className="text-[12px] text-ink-3">
                    {formatDistanceToNow(new Date(a.detectedAt), { addSuffix: true })}
                  </span>
                </div>
                <div className="mono mt-2 text-[22px] font-semibold text-ink">
                  {a.multiple}×
                  <span className="ml-2 text-[13px] font-normal text-ink-3">above baseline</span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <Avatar name={a.developerName} size={22} hue={(i * 47) % 360} />
                  <span className="text-[13px] font-medium text-ink">{a.developerName}</span>
                </div>
              </div>
              <button className="h-8 shrink-0 self-start rounded-lg bg-ink px-3 text-[12.5px] font-medium text-paper hover:opacity-90">
                Acknowledge
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DemoProviders() {
  const cards = [
    { name: "Anthropic", color: "var(--p-anthropic)", keys: 10, total: 4120, models: "Opus 4 · Sonnet 4 · Haiku 4" },
    { name: "OpenAI", color: "var(--p-openai)", keys: 8, total: 2740, models: "GPT-5 · GPT-5 mini · o4" },
    { name: "GitHub Copilot", color: "var(--p-copilot)", keys: 10, total: 760, models: "Copilot Business" },
  ];
  return (
    <div>
      <PageHead title="Providers" sub="AI providers we poll for usage and cost." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <div key={c.name} className="rounded-xl border border-line bg-paper p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />
              <span className="text-[15px] font-semibold text-ink">{c.name}</span>
            </div>
            <div className="mono mt-3 text-[24px] font-semibold text-ink">{fmtMoney(c.total)}</div>
            <p className="mt-0.5 text-[12.5px] text-ink-3">last 30 days · {c.keys} keys</p>
            <p className="mt-3 text-[12px] text-ink-3">{c.models}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function DemoIntegrations() {
  const rows = [
    { name: "Slack", desc: "Daily digests + anomaly alerts to #eng-spend", on: true },
    { name: "Linear", desc: "File an issue on every critical anomaly (ENG team)", on: true },
  ];
  return (
    <div>
      <PageHead title="Integrations" sub="Route digests and anomaly alerts where your team works." />
      <div className="flex flex-col gap-3">
        {rows.map((r) => (
          <div
            key={r.name}
            className="flex items-center justify-between rounded-xl border border-line bg-paper p-4 shadow-sm"
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[14px] font-semibold text-ink">{r.name}</span>
                <span className="inline-flex h-[19px] items-center rounded-full bg-[color-mix(in_oklab,var(--pos)_12%,transparent)] px-2 text-[11px] font-medium text-pos">
                  Connected
                </span>
              </div>
              <p className="mt-1 text-[12.5px] text-ink-3">{r.desc}</p>
            </div>
            <span
              className="relative inline-block h-5 w-9 rounded-full transition-colors"
              style={{ background: r.on ? "var(--brand)" : "var(--line-2)" }}
            >
              <span
                className="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform"
                style={{ transform: r.on ? "translateX(18px)" : "translateX(2px)" }}
              />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
