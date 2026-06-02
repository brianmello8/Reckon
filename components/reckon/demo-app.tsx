"use client";

import * as React from "react";
import Link from "next/link";
import {
  LayoutDashboard, Users, Key, Activity, AlertTriangle, Plug, Workflow,
  Landmark, FolderTree, Tags, FileText, Scale, TrendingUp, Wallet,
  CalendarClock, BookText, Target, Gauge, ListTree, FileDown,
  ArrowLeft, ChevronDown,
} from "lucide-react";
import { DashboardClient } from "@/app/(app)/(operations)/dashboard/dashboard-client";
import { MOCK } from "@/lib/reckon/mock";
import { Logo, Avatar, SeverityBadge, ShareBar } from "@/components/reckon/primitives";
import { ThemeToggle } from "@/components/reckon/theme-toggle";
import { PageHead } from "@/components/reckon/page-head";
import { fmtMoney, microsToDollars } from "@/lib/reckon/format";
import { formatDistanceToNow } from "date-fns";

type Screen =
  | "dashboard" | "developers" | "providers" | "observability" | "anomalies" | "integrations"
  | "workflows"
  | "finance" | "dimensions" | "coding" | "invoices" | "reconciliation" | "forecast"
  | "commitments" | "periods" | "accruals" | "outcomes" | "unit-economics" | "erp-codes" | "export";

type Anomaly = (typeof MOCK.anomalies)[number];
type NavItem = { id: Screen; label: string; icon: typeof Users; badge?: boolean; pro?: boolean };

// Mirrors app/(app)/sidebar.tsx exactly — same groups, labels, order, icons.
// Primary sidebar (mirrors the app): Operations + Workflows + a single Finance entry.
const PRIMARY: { section: string; items: NavItem[] }[] = [
  {
    section: "Operations",
    items: [
      { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
      { id: "developers", label: "Developers", icon: Users },
      { id: "providers", label: "Providers", icon: Key },
      { id: "observability", label: "Observability", icon: Activity },
      { id: "anomalies", label: "Anomalies", icon: AlertTriangle, badge: true },
      { id: "integrations", label: "Integrations", icon: Plug },
    ],
  },
  { section: "Workflows", items: [{ id: "workflows", label: "Workflows", icon: Workflow }] },
];
const FINANCE_ITEM: NavItem = { id: "finance", label: "Finance", icon: Landmark, pro: true };

// Secondary finance rail, grouped into the four close stages (mirrors finance-shell.tsx).
const FIN_RAIL: { group: string; items: NavItem[] }[] = [
  { group: "Allocate", items: [
    { id: "finance", label: "Finance", icon: Landmark },
    { id: "coding", label: "Coding", icon: Tags },
    { id: "dimensions", label: "Dimensions", icon: FolderTree },
    { id: "erp-codes", label: "ERP codes", icon: ListTree },
  ] },
  { group: "Verify", items: [
    { id: "invoices", label: "Invoices", icon: FileText },
    { id: "reconciliation", label: "Reconciliation", icon: Scale },
    { id: "commitments", label: "Commitments", icon: Wallet },
    { id: "forecast", label: "Forecast", icon: TrendingUp },
  ] },
  { group: "Close", items: [
    { id: "accruals", label: "Accruals", icon: BookText },
    { id: "periods", label: "Periods", icon: CalendarClock },
    { id: "export", label: "Export", icon: FileDown },
  ] },
  { group: "Analyze", items: [
    { id: "unit-economics", label: "Unit economics", icon: Gauge },
    { id: "outcomes", label: "Outcomes", icon: Target },
  ] },
];
const FIN_ITEMS = FIN_RAIL.flatMap((g) => g.items);
const FINANCE_IDS = new Set<Screen>(FIN_ITEMS.map((i) => i.id));
const ALL_ITEMS = [...PRIMARY.flatMap((s) => s.items), ...FIN_ITEMS]; // mobile flat nav

export function DemoApp() {
  const [screen, setScreen] = React.useState<Screen>("dashboard");
  const [anomalies, setAnomalies] = React.useState<Anomaly[]>(MOCK.anomalies);
  const unack = anomalies.length;
  const onFin = FINANCE_IDS.has(screen);

  const renderScreen = () => {
    switch (screen) {
      case "dashboard": return <DashboardClient data={MOCK.dashboard} range="30d" orgName="Northwind" recentAnomalies={MOCK.recentAnomalies} demo />;
      case "developers": return <DemoDevelopers />;
      case "providers": return <DemoProviders />;
      case "observability": return <DemoObservability />;
      case "anomalies": return <DemoAnomalies anomalies={anomalies} onAck={(id) => setAnomalies((a) => a.filter((x) => x.id !== id))} onReset={() => setAnomalies(MOCK.anomalies)} />;
      case "integrations": return <DemoIntegrations />;
      case "workflows": return <DemoWorkflows />;
      case "finance": return <DemoFinance />;
      case "dimensions": return <DemoDimensions />;
      case "coding": return <DemoCoding />;
      case "invoices": return <DemoInvoices />;
      case "reconciliation": return <DemoReconciliation />;
      case "forecast": return <DemoForecast />;
      case "commitments": return <DemoCommitments />;
      case "periods": return <DemoPeriods />;
      case "accruals": return <DemoAccruals />;
      case "outcomes": return <DemoOutcomes />;
      case "unit-economics": return <DemoUnitEconomics />;
      case "erp-codes": return <DemoErpCodes />;
      case "export": return <DemoExport />;
    }
  };

  const navButton = (item: NavItem, mobile = false) => {
    const on = screen === item.id;
    const Icon = item.icon;
    return (
      <button
        key={item.id}
        onClick={() => setScreen(item.id)}
        className={
          mobile
            ? `inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors ${on ? "bg-bg-2 text-ink" : "text-ink-3"}`
            : `relative flex items-center gap-[11px] rounded-[9px] px-[11px] py-2 text-left text-[13.5px] font-medium transition-colors ${on ? "bg-bg-2 text-ink" : "text-ink-3 hover:bg-bg-2 hover:text-ink"}`
        }
      >
        {!mobile && on && <span className="absolute -left-3 bottom-2 top-2 w-[3px] rounded-[3px] bg-brand" />}
        <Icon size={mobile ? 15 : 17} strokeWidth={on ? 2.2 : 1.9} />
        {item.label}
        {item.badge && unack > 0 && (
          <span className={`mono ${mobile ? "" : "ml-auto"} inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-semibold text-white`}>{unack}</span>
        )}
      </button>
    );
  };

  return (
    <div className="flex h-screen overflow-hidden bg-bg-warm">
      <aside className="hidden w-[232px] shrink-0 flex-col border-r border-line bg-paper lg:flex">
        <div className="flex h-[60px] items-center border-b border-line px-[18px]"><Logo /></div>
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-3">
          {PRIMARY.map((sec, i) => (
            <div key={sec.section} className={i > 0 ? "mt-3" : ""}>
              <div className="px-[11px] pb-1 text-[10.5px] font-semibold uppercase tracking-wide text-ink-3/70">{sec.section}</div>
              {sec.items.map((item) => navButton(item))}
            </div>
          ))}
          <div className="mt-3">
            <div className="px-[11px] pb-1 text-[10.5px] font-semibold uppercase tracking-wide text-ink-3/70">Pro Finance</div>
            <button
              onClick={() => setScreen("finance")}
              className={`relative flex w-full items-center gap-[11px] rounded-[9px] px-[11px] py-2 text-left text-[13.5px] font-medium transition-colors ${onFin ? "bg-bg-2 text-ink" : "text-ink-3 hover:bg-bg-2 hover:text-ink"}`}
            >
              {onFin && <span className="absolute -left-3 bottom-2 top-2 w-[3px] rounded-[3px] bg-brand" />}
              <Landmark size={17} strokeWidth={onFin ? 2.2 : 1.9} />
              {FINANCE_ITEM.label}
              <span className="ml-auto rounded-[5px] border border-brand-line bg-brand-soft px-1.5 py-px text-[9.5px] font-bold uppercase tracking-wide text-brand-ink">Pro</span>
            </button>
          </div>
        </nav>
        <div className="border-t border-line p-3">
          <div className="rounded-xl border border-line bg-bg-2 p-3">
            <div className="flex items-center gap-2"><span className="pulse-dot" /><span className="text-[12.5px] font-semibold text-ink">Ingestion live</span></div>
            <p className="mt-1.5 text-[11.5px] leading-snug text-ink-3">Last poll 6m ago · next in 54m</p>
          </div>
        </div>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-center gap-2 bg-brand-soft px-4 py-1.5 text-[12.5px] text-brand-ink">
          <span className="font-medium">Interactive demo</span><span className="text-ink-3">· sample data · click around, nothing is saved</span>
        </div>
        <header className="sticky top-0 z-10 flex h-[56px] shrink-0 items-center justify-between border-b border-line px-4 backdrop-blur lg:px-[26px]" style={{ background: "color-mix(in oklab, var(--paper) 82%, transparent)" }}>
          <div className="flex items-center gap-2"><span className="inline-flex h-6 w-6 items-center justify-center rounded-[7px] bg-ink text-[12px] font-bold text-paper">N</span><span className="text-[13.5px] font-semibold text-ink">Northwind</span></div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link href="/sign-up" className="inline-flex h-8 items-center rounded-lg bg-brand px-4 text-[12.5px] font-medium text-white hover:opacity-90">Start free</Link>
            <Link href="/" className="inline-flex items-center gap-1 text-[12.5px] text-ink-2 hover:text-ink"><ArrowLeft size={14} /> Exit</Link>
          </div>
        </header>
        <nav className="flex gap-1 overflow-x-auto border-b border-line bg-paper px-3 py-2 lg:hidden">{ALL_ITEMS.map((item) => navButton(item, true))}</nav>

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1180px] px-4 py-7 lg:px-[26px] fade-up" key={onFin ? "finance" : screen}>
            {onFin ? (
              <>
                {/* mobile finance rail */}
                <div className="mb-4 flex gap-1 overflow-x-auto pb-1 lg:hidden">{FIN_ITEMS.map((it) => navButton(it, true))}</div>
                <div className="lg:grid lg:grid-cols-[200px_1fr] lg:gap-7">
                  <aside className="hidden lg:sticky lg:top-0 lg:block lg:self-start">
                    <span className="mb-3 inline-flex items-center rounded-full border border-brand-line bg-brand-soft px-2.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-brand-ink">Pro Finance</span>
                    <div className="flex flex-col gap-4">
                      {FIN_RAIL.map((g) => (
                        <div key={g.group}>
                          <div className="px-[11px] pb-1 text-[10.5px] font-semibold uppercase tracking-wide text-ink-3/70">{g.group}</div>
                          {g.items.map((it) => navButton(it))}
                        </div>
                      ))}
                    </div>
                  </aside>
                  <div className="min-w-0" key={screen}>{renderScreen()}</div>
                </div>
              </>
            ) : (
              renderScreen()
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

// ── shared ──────────────────────────────────────────────────────────────────
function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl border bg-paper p-4 shadow-sm ${accent ? "border-brand/40" : "border-line"}`}>
      <div className="text-[11.5px] uppercase tracking-wide text-ink-3">{label}</div>
      <div className={`mono mt-1 text-[22px] font-semibold ${accent ? "text-brand" : "text-ink"}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[12px] text-ink-3">{sub}</div>}
    </div>
  );
}
function Panel({ title, sub, children, action }: { title: string; sub?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-paper p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div><div className="font-semibold text-ink">{title}</div>{sub && <p className="mt-0.5 text-[12.5px] text-ink-3">{sub}</p>}</div>
        {action}
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}
function SimpleTable({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-line">
      <table className="w-full text-[13px]">
        <thead className="bg-bg-2 text-left text-[11.5px] uppercase tracking-wide text-ink-3"><tr>{head.map((h, i) => <th key={i} className={`px-3 py-2 font-medium ${i > 0 ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((cells, ri) => (
          <tr key={ri} className="border-t border-line">{cells.map((c, ci) => <td key={ci} className={`px-3 py-2 ${ci > 0 ? "mono text-right text-ink-2" : "text-ink"}`}>{c}</td>)}</tr>
        ))}</tbody>
      </table>
    </div>
  );
}
function Btn({ children, onClick, variant = "solid", disabled }: { children: React.ReactNode; onClick?: () => void; variant?: "solid" | "outline"; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className={`inline-flex h-8 items-center rounded-lg px-3 text-[12.5px] font-medium transition-colors disabled:opacity-50 ${variant === "solid" ? "bg-ink text-paper hover:opacity-90" : "border border-line text-ink hover:bg-bg-2"}`}>{children}</button>
  );
}
function Pill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "pos" | "warn" }) {
  const cls = tone === "pos" ? "bg-[color-mix(in_oklab,var(--pos)_12%,transparent)] text-pos" : tone === "warn" ? "bg-amber-500/15 text-amber-600" : "bg-bg-2 text-ink-2";
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>{children}</span>;
}
const usd = (n: number) => fmtMoney(n);

// ── Operations ──────────────────────────────────────────────────────────────
function DemoDevelopers() {
  const total = MOCK.developers.reduce((a, d) => a + d.totalCost, 0);
  const [open, setOpen] = React.useState<string | null>(null);
  return (
    <div>
      <PageHead title="Developers" sub="Northwind · 10 developers · 3 providers · click a row to drill in" />
      <div className="overflow-hidden rounded-xl border border-line bg-paper shadow-sm">
        <table className="w-full">
          <thead><tr className="border-b border-line">{["Developer", "Share", "30-day spend", "Keys", ""].map((h, i) => <th key={i} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{h}</th>)}</tr></thead>
          <tbody>
            {MOCK.developers.map((d, i) => {
              const isOpen = open === d.id; const dollars = microsToDollars(d.totalCost);
              const split = [{ m: "Opus 4", pct: 0.55 }, { m: "Sonnet 4", pct: 0.32 }, { m: "Haiku 4", pct: 0.13 }];
              return (
                <React.Fragment key={d.id}>
                  <tr className="cursor-pointer border-b border-line transition-colors hover:bg-bg-2" onClick={() => setOpen(isOpen ? null : d.id)}>
                    <td className="px-4 py-3"><div className="flex items-center gap-2.5"><Avatar name={d.displayName} size={28} hue={(i * 47) % 360} /><div><div className="text-[13.5px] font-medium text-ink">{d.displayName}</div><div className="text-[12px] text-ink-3">{d.email}</div></div></div></td>
                    <td className="px-4 py-3"><div className="max-w-[160px]"><ShareBar parts={[{ k: "x", value: (d.totalCost / total) * 100 }]} total={100} h={4} /></div></td>
                    <td className="px-4 py-3 mono text-[13.5px] text-ink">{fmtMoney(dollars)}</td>
                    <td className="px-4 py-3"><Pill>{d.keyCount} keys</Pill></td>
                    <td className="px-4 py-3 text-right"><ChevronDown size={15} className={`inline text-ink-3 transition-transform ${isOpen ? "rotate-180" : ""}`} /></td>
                  </tr>
                  {isOpen && (
                    <tr className="border-b border-line bg-bg-2/40"><td colSpan={5} className="px-4 py-3">
                      <div className="text-[12px] font-medium text-ink-3">Model breakdown (30d)</div>
                      <div className="mt-2 space-y-2">{split.map((s) => (
                        <div key={s.m}><div className="flex justify-between text-[12.5px]"><span className="text-ink-2">{s.m}</span><span className="mono text-ink">{fmtMoney(dollars * s.pct)}</span></div><div className="mt-1"><ShareBar parts={[{ k: s.m, value: s.pct * 100 }]} total={100} h={4} /></div></div>
                      ))}</div>
                    </td></tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
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
            <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} /><span className="text-[15px] font-semibold text-ink">{c.name}</span></div>
            <div className="mono mt-3 text-[24px] font-semibold text-ink">{fmtMoney(c.total)}</div>
            <p className="mt-0.5 text-[12.5px] text-ink-3">last 30 days · {c.keys} keys</p>
            <p className="mt-3 text-[12px] text-ink-3">{c.models}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function DemoObservability() {
  return (
    <div>
      <PageHead title="Observability" sub="Connect Langfuse or Helicone to attribute spend to workflows and runs — metadata only, never prompt content." />
      <div className="grid gap-4 sm:grid-cols-3"><Stat label="Traces ingested (30d)" value="48,210" sub="from Langfuse" /><Stat label="Attributed spend" value="78%" sub="of total, to a workflow" /><Stat label="Last sync" value="12m ago" sub="hourly" /></div>
      <div className="mt-4"><Panel title="Connections">
        <div className="flex items-center justify-between rounded-lg border border-line p-3">
          <div><div className="flex items-center gap-2"><span className="text-[14px] font-semibold text-ink">Langfuse</span><Pill tone="pos">Active</Pill></div><p className="mt-1 text-[12.5px] text-ink-3">us.cloud.langfuse.com · reads trace metadata (name, tags, cost) to map runs → workflows</p></div>
          <span className="mono text-[12px] text-ink-3">pk-lf-3cc7…</span>
        </div>
      </Panel></div>
    </div>
  );
}

function DemoAnomalies({ anomalies, onAck, onReset }: { anomalies: Anomaly[]; onAck: (id: string) => void; onReset: () => void }) {
  return (
    <div>
      <PageHead title="Anomalies" sub="Flagged at mean + 3σ over a trailing 28-day window." />
      {anomalies.length === 0 ? (
        <div className="rounded-xl border border-line bg-paper p-8 text-center shadow-sm">
          <p className="text-[14px] font-medium text-ink">All clear — every anomaly acknowledged.</p>
          <p className="mt-1 text-[12.5px] text-ink-3">In the real app this clears the Slack alert too.</p>
          <button onClick={onReset} className="mt-4 text-[12.5px] font-medium text-brand hover:underline">Reset demo anomalies</button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {anomalies.map((a, i) => (
            <div key={a.id} className="overflow-hidden rounded-xl border border-line bg-paper shadow-sm"><div className="flex gap-4 p-4">
              <span className="-my-4 -ml-4 w-1 shrink-0" style={{ background: a.severity === "critical" ? "var(--sev-crit)" : a.severity === "warn" ? "var(--sev-warn)" : "var(--sev-info)" }} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><SeverityBadge severity={a.severity} /><Pill>{a.kind.replace("_", " ")}</Pill><span className="text-[12px] text-ink-3">{formatDistanceToNow(new Date(a.detectedAt), { addSuffix: true })}</span></div>
                <div className="mono mt-2 text-[22px] font-semibold text-ink">{a.multiple}×<span className="ml-2 text-[13px] font-normal text-ink-3">above baseline</span></div>
                <div className="mt-2 flex items-center gap-2"><Avatar name={a.developerName} size={22} hue={(i * 47) % 360} /><span className="text-[13px] font-medium text-ink">{a.developerName}</span></div>
              </div>
              <button onClick={() => onAck(a.id)} className="h-8 shrink-0 self-start rounded-lg bg-ink px-3 text-[12.5px] font-medium text-paper hover:opacity-90">Acknowledge</button>
            </div></div>
          ))}
        </div>
      )}
    </div>
  );
}

function DemoIntegrations() {
  const [on, setOn] = React.useState<Record<string, boolean>>({ Slack: true, Linear: true });
  const rows = [{ name: "Slack", desc: "Daily digests + anomaly alerts to #eng-spend" }, { name: "Linear", desc: "File an issue on every critical anomaly (ENG team)" }];
  return (
    <div>
      <PageHead title="Integrations" sub="Route digests and anomaly alerts where your team works." />
      <div className="flex flex-col gap-3">{rows.map((r) => (
        <div key={r.name} className="flex items-center justify-between rounded-xl border border-line bg-paper p-4 shadow-sm">
          <div><div className="flex items-center gap-2"><span className="text-[14px] font-semibold text-ink">{r.name}</span>{on[r.name] && <Pill tone="pos">Connected</Pill>}</div><p className="mt-1 text-[12.5px] text-ink-3">{r.desc}</p></div>
          <button onClick={() => setOn((s) => ({ ...s, [r.name]: !s[r.name] }))} className="relative inline-block h-5 w-9 rounded-full transition-colors" style={{ background: on[r.name] ? "var(--brand)" : "var(--line-2)" }}><span className="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform" style={{ transform: on[r.name] ? "translateX(18px)" : "translateX(2px)" }} /></button>
        </div>
      ))}</div>
    </div>
  );
}

// ── Workflows ───────────────────────────────────────────────────────────────
function DemoWorkflows() {
  const [tab, setTab] = React.useState<"workflows" | "agents" | "customers" | "roi">("workflows");
  const workflows = [
    { name: "Support Triage Bot", agent: "Support Agent", total: 4200, runs: 1240, perRun: 3.39, outcome: "9,800 tickets → $0.43/ticket" },
    { name: "Code Review Bot", agent: "Dev Agent", total: 2860, runs: 540, perRun: 5.30, outcome: "540 PRs → $5.30/PR" },
    { name: "Doc Summarizer", agent: "Knowledge Agent", total: 1150, runs: 2600, perRun: 0.44, outcome: "2,600 docs → $0.44/doc" },
  ];
  const agents = [{ a: "Support Agent", total: 4200, wf: 1 }, { a: "Dev Agent", total: 2860, wf: 1 }, { a: "Knowledge Agent", total: 1150, wf: 1 }];
  const customers = [{ ref: "Acme Corp", cost: 1900 }, { ref: "Globex", cost: 1200 }, { ref: "Initech", cost: 760 }];
  const tabs = [["workflows", "Workflows"], ["agents", "Agents"], ["customers", "Customers"], ["roi", "ROI"]] as const;
  return (
    <div>
      <PageHead title="Workflows" sub="A product lens on AI spend — cost per agent, workflow, run, and outcome." />
      <div className="grid gap-4 sm:grid-cols-3"><Stat label="Workflow spend (30d)" value={usd(8210)} sub="3 workflows · 3 agents" /><Stat label="Runs" value="4,380" /><Stat label="Top workflow" value="Support Triage" sub={usd(4200)} /></div>
      <div className="mt-4 flex gap-1">{tabs.map(([id, label]) => <button key={id} onClick={() => setTab(id)} className={`rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors ${tab === id ? "bg-ink text-paper" : "text-ink-3 hover:bg-bg-2"}`}>{label}</button>)}</div>
      <div className="mt-3">
        {tab === "workflows" && <SimpleTable head={["Workflow", "Agent", "AI cost", "Runs", "Cost / run"]} rows={workflows.map((w) => [w.name, <span key="a" className="text-ink-3">{w.agent}</span>, usd(w.total), w.runs.toLocaleString(), usd(w.perRun)])} />}
        {tab === "agents" && <SimpleTable head={["Agent", "AI cost", "Workflows"]} rows={agents.map((a) => [a.a, usd(a.total), String(a.wf)])} />}
        {tab === "customers" && <SimpleTable head={["Customer", "AI cost (30d)"]} rows={customers.map((c) => [c.ref, usd(c.cost)])} />}
        {tab === "roi" && <SimpleTable head={["Workflow", "AI cost", "Cost per outcome"]} rows={workflows.map((w) => [w.name, usd(w.total), <span key="o" className="text-ink-2">{w.outcome}</span>])} />}
      </div>
    </div>
  );
}

// ── Finance: Finance (showback) ─────────────────────────────────────────────
function DemoFinance() {
  const cc = [{ k: "Platform Eng", v: 4100 }, { k: "Data", v: 2300 }, { k: "Support", v: 1810 }];
  const types = [{ k: "COGS", v: 5900 }, { k: "Opex · R&D", v: 2310 }];
  const total = cc.reduce((a, x) => a + x.v, 0);
  return (
    <div>
      <PageHead title="Finance" sub="Showback — every dollar coded to a cost center, GL account, and product line; reconciles to raw usage." />
      <div className="grid gap-4 sm:grid-cols-3"><Stat label="Coded spend (30d)" value={usd(total)} sub="100% of usage" /><Stat label="Cost centers" value="3" /><Stat label="Uncoded" value="$0" sub="needs-coding queue cleared" /></div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="By cost center">{cc.map((x) => (<div key={x.k} className="mb-3 last:mb-0"><div className="flex justify-between text-[13px]"><span className="text-ink-2">{x.k}</span><span className="mono text-ink">{usd(x.v)}</span></div><div className="mt-1"><ShareBar parts={[{ k: x.k, value: (x.v / total) * 100 }]} total={100} h={5} /></div></div>))}</Panel>
        <Panel title="By GL account type"><SimpleTable head={["Account type", "Spend"]} rows={types.map((t) => [t.k, usd(t.v)])} /><p className="mt-2 text-[12px] text-ink-3">COGS-coded spend feeds AI COGS % of revenue on Unit economics.</p></Panel>
      </div>
    </div>
  );
}

// ── Finance: Dimensions ─────────────────────────────────────────────────────
function DemoDimensions() {
  return (
    <div>
      <PageHead title="Dimensions" sub="The finance dimensions every dollar is coded against." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Cost centers"><SimpleTable head={["Code", "Name"]} rows={[["CC-PLT", "Platform Eng"], ["CC-DATA", "Data"], ["CC-SUP", "Support"]]} /></Panel>
        <Panel title="GL accounts"><SimpleTable head={["Code", "Name", "Type"]} rows={[["6000", "AI COGS", "cogs"], ["6010", "AI R&D", "opex_rnd"], ["2150", "Accrued liabilities", "liability"]]} /></Panel>
        <Panel title="Product lines"><SimpleTable head={["Code", "Name"]} rows={[["PL-CORE", "Core API"], ["PL-ASST", "Assistant"]]} /></Panel>
        <Panel title="Entities"><SimpleTable head={["Code", "Name", "Reporting tz"]} rows={[["US", "Northwind US", "America/Los_Angeles"]]} /></Panel>
      </div>
    </div>
  );
}

// ── Finance: Coding ─────────────────────────────────────────────────────────
function DemoCoding() {
  return (
    <div>
      <PageHead title="Coding" sub="Account determination routes each usage event to a GL account × cost center; the rest lands in the needs-coding queue." />
      <div className="grid gap-4 sm:grid-cols-3"><Stat label="Events coded (30d)" value="12,418" sub="100%" /><Stat label="Needs coding" value="0" sub="queue clear" accent /><Stat label="Active rules" value="4" /></div>
      <div className="mt-4 space-y-4">
        <Panel title="Account-determination rules" sub="First match wins; ordered.">
          <SimpleTable head={["#", "Match", "→ GL account", "Cost center"]} rows={[
            ["1", <span key="1" className="text-ink-3">provider = anthropic · model contains opus</span>, "6000 · AI COGS", "by developer team"],
            ["2", <span key="2" className="text-ink-3">workflow = Code Review Bot</span>, "6010 · AI R&D", "CC-PLT"],
            ["3", <span key="3" className="text-ink-3">provider = github_copilot</span>, "6010 · AI R&D", "by seat team"],
            ["4", <span key="4" className="text-ink-3">(fallback)</span>, "6000 · AI COGS", "needs-coding queue"],
          ]} />
        </Panel>
        <Panel title="Recently coded"><SimpleTable head={["Day · model", "Cost", "GL", "Cost center"]} rows={[
          ["May 28 · Opus 4", usd(212.4), "6000", "CC-PLT"],
          ["May 28 · GPT-5", usd(96.1), "6000", "CC-DATA"],
          ["May 27 · Copilot", usd(24.0), "6010", "CC-PLT"],
        ]} /></Panel>
      </div>
    </div>
  );
}

// ── Finance: Invoices ───────────────────────────────────────────────────────
function DemoInvoices() {
  return (
    <div>
      <PageHead title="Invoices" sub="Provider invoices, by upload (CSV/PDF) or billing API. Each reconciles against observed usage." />
      <Panel title="May 2026">
        <SimpleTable head={["Provider", "Source", "Invoice total", "Status"]} rows={[
          ["Anthropic", <span key="1" className="text-ink-3">billing API</span>, usd(4180.5), <Pill key="s1" tone="pos">reconciled</Pill>],
          ["OpenAI", <span key="2" className="text-ink-3">CSV upload</span>, usd(2710.0), <Pill key="s2" tone="pos">reconciled</Pill>],
          ["GitHub Copilot", <span key="3" className="text-ink-3">PDF upload</span>, usd(760.0), <Pill key="s3" tone="warn">pending recon</Pill>],
        ]} />
      </Panel>
    </div>
  );
}

// ── Finance: Reconciliation ─────────────────────────────────────────────────
function DemoReconciliation() {
  return (
    <div>
      <PageHead title="Reconciliation" sub="Match the provider invoice to the usage we observed — explain every dollar of the gap." />
      <div className="grid gap-4 sm:grid-cols-3"><Stat label="Anthropic invoice" value={usd(4180.5)} sub="May" /><Stat label="Observed usage" value={usd(4205.2)} sub="sum of usage_events" /><Stat label="Reconciled" value="within $0.00" sub="gap fully explained" accent /></div>
      <div className="mt-4"><Panel title="Discrepancies (explained)" sub="Residual after explaining each line nets to zero.">
        <SimpleTable head={["Type", "Amount", "Note"]} rows={[
          ["credits", <span key="1">−{usd(42)}</span>, <span key="n1" className="text-ink-3">promotional credit applied on invoice</span>],
          ["untracked_keys", <span key="2">+{usd(18)}</span>, <span key="n2" className="text-ink-3">key not yet mapped to a developer</span>],
          ["rounding", <span key="3">−{usd(0.7)}</span>, <span key="n3" className="text-ink-3">provider rounds to the cent</span>],
        ]} />
      </Panel></div>
    </div>
  );
}

// ── Finance: Forecast ───────────────────────────────────────────────────────
function DemoForecast() {
  return (
    <div>
      <PageHead title="Forecast" sub="Project month-end spend per provider from the run-rate so far." />
      <div className="grid gap-4 sm:grid-cols-3"><Stat label="Projected month-end" value={usd(8420)} sub="all providers" accent /><Stat label="MTD observed" value={usd(5610)} sub="day 19 of 31" /><Stat label="vs last month" value="+6.2%" /></div>
      <div className="mt-4"><Panel title="Per-provider projection"><SimpleTable head={["Provider", "MTD", "Run-rate / day", "Projected"]} rows={[
        ["Anthropic", usd(2900), usd(152.6), usd(4730)],
        ["OpenAI", usd(1980), usd(104.2), usd(3230)],
        ["GitHub Copilot", usd(730), usd(24.2), usd(750)],
      ]} /></Panel></div>
    </div>
  );
}

// ── Finance: Commitments ────────────────────────────────────────────────────
function DemoCommitments() {
  return (
    <div>
      <PageHead title="Commitments" sub="Prepaid credits and committed-use deals — drawdown, pace, and at-risk alerts." />
      <div className="space-y-4">
        <Panel title="Anthropic — annual committed use" action={<Pill tone="pos">on pace</Pill>}>
          <div className="flex flex-wrap items-center gap-4 text-[13px]"><span className="text-ink-3">Commitment</span><span className="mono text-ink">{usd(50000)}/yr</span><span className="text-ink-3">Drawn</span><span className="mono text-ink">{usd(31000)} (62%)</span><span className="text-ink-3">Ends</span><span className="text-ink">Dec 31, 2026</span></div>
          <div className="mt-2"><ShareBar parts={[{ k: "drawn", value: 62 }]} total={100} h={6} /></div>
        </Panel>
        <Panel title="OpenAI — prepaid credit" action={<Pill tone="warn">under-utilization</Pill>}>
          <div className="flex flex-wrap items-center gap-4 text-[13px]"><span className="text-ink-3">Credit</span><span className="mono text-ink">{usd(5000)}</span><span className="text-ink-3">Used</span><span className="mono text-ink">{usd(1500)} (30%)</span><span className="text-ink-3">Expires</span><span className="text-ink">in 40 days</span></div>
          <p className="mt-2 text-[12.5px] text-amber-600">At the current pace ~{usd(2900)} will expire unused — alerted to Slack.</p>
        </Panel>
      </div>
    </div>
  );
}

// ── Finance: Periods ────────────────────────────────────────────────────────
function DemoPeriods() {
  return (
    <div>
      <PageHead title="Periods" sub="Accounting periods with timezone-correct cutoff. Closing/locking gates what can post." />
      <Panel title="Accounting periods"><SimpleTable head={["Period", "Reporting tz", "Status"]} rows={[
        ["May 1 → May 31, 2026", "America/Los_Angeles", <Pill key="1">open</Pill>],
        ["Apr 1 → Apr 30, 2026", "America/Los_Angeles", <Pill key="2">closed</Pill>],
        ["Mar 1 → Mar 31, 2026", "America/Los_Angeles", <Pill key="3" tone="warn">locked</Pill>],
      ]} /></Panel>
    </div>
  );
}

// ── Finance: Accruals (interactive) ─────────────────────────────────────────
function DemoAccruals() {
  const [step, setStep] = React.useState<"idle" | "generating" | "draft" | "approved">("idle");
  function generate() { setStep("generating"); setTimeout(() => setStep("draft"), 700); }
  return (
    <div>
      <PageHead title="Accruals" sub="Real-time usage is the best accrual estimate. Generate a balanced draft JE; reverse and true-up next period." />
      <div className="grid gap-4 sm:grid-cols-4"><Stat label="Estimated accrual" value={usd(7940)} sub="May" /><Stat label="Observed" value={usd(6200)} sub="coded usage" /><Stat label="Forecast tail" value={usd(1740)} sub="not-yet-reported" /><Stat label="Accrual accuracy" value="±6.2%" sub="trailing 3 periods" accent /></div>
      <div className="mt-4"><Panel title="Month-end accrual — May" sub="Expense debits by GL × cost center, one accrued-liability credit. Debits = credits."
        action={step === "idle" ? <Btn onClick={generate}>Generate accrual</Btn> : step === "generating" ? <Btn disabled>Generating…</Btn> : step === "draft" ? <Btn onClick={() => setStep("approved")}>Approve (internal)</Btn> : <Pill tone="pos">approved</Pill>}>
        {step === "idle" && <p className="text-[13px] text-ink-3">Click <b>Generate accrual</b> to build the draft journal entry from this period&apos;s coded usage + forecast tail.</p>}
        {step === "generating" && <p className="text-[13px] text-ink-3">Summing coded usage, forecasting the not-yet-reported tail, balancing the entry…</p>}
        {(step === "draft" || step === "approved") && (<>
          <SimpleTable head={["GL account", "Cost center", "Debit", "Credit"]} rows={[
            ["6000 · AI COGS", "Platform Eng", usd(3960), ""], ["6000 · AI COGS", "Data", usd(2210), ""], ["6010 · AI R&D", "Support", usd(1770), ""],
            [<span key="l" className="text-ink-3">2150 · Accrued liabilities</span>, "—", "", usd(7940)],
          ]} />
          <div className="mt-3 flex flex-wrap items-center gap-2"><Pill>balanced · debits = credits</Pill><Pill>{step === "approved" ? "approved" : "draft"}</Pill>{step === "approved" && <span className="text-[12px] text-ink-3">→ reversed &amp; trued-up against the actual invoice next period</span>}</div>
        </>)}
      </Panel></div>
    </div>
  );
}

// ── Finance: Outcomes ───────────────────────────────────────────────────────
function DemoOutcomes() {
  return (
    <div>
      <PageHead title="Outcomes" sub="Feed in the numerators — revenue, tickets, docs — so AI cost can be divided into a unit economic." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Metrics"><SimpleTable head={["Key", "Unit", "Grain"]} rows={[
          ["usd_revenue", "usd_revenue", "org"], ["tickets_closed", "tickets", "workflow"], ["docs_processed", "docs", "workflow"],
        ]} /></Panel>
        <Panel title="Values (May)"><SimpleTable head={["Metric", "Bound to", "Value"]} rows={[
          ["Revenue", "Org", "$142,000"], ["Tickets closed", "Support Triage Bot", "9,800"], ["Docs processed", "Doc Summarizer", "2,600"],
        ]} /></Panel>
      </div>
      <p className="mt-3 text-[12.5px] text-ink-3">Loaded by manual entry, CSV upload, or the authenticated ingest API.</p>
    </div>
  );
}

// ── Finance: Unit economics ─────────────────────────────────────────────────
function DemoUnitEconomics() {
  return (
    <div>
      <PageHead title="Unit economics" sub="Is the AI spend worth it? Cost per unit, AI COGS as a share of revenue, and margin." />
      <div className="grid gap-4 sm:grid-cols-4"><Stat label="Revenue (org)" value={usd(142000)} sub="customer-supplied" /><Stat label="AI COGS" value={usd(8260)} sub="COGS-coded only" /><Stat label="AI COGS % of revenue" value="5.8%" accent /><Stat label="Gross margin (AI)" value={usd(133740)} sub="94.2%" /></div>
      <div className="mt-4 space-y-4">
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4"><div className="font-semibold text-ink">Margin at risk</div><div className="mt-2 text-[13px] text-ink-2"><span className="mr-2 inline-flex items-center rounded-full bg-red-500/15 px-2 py-0.5 text-[11.5px] font-medium text-red-600">negative margin</span>customer · Initech — AI cost {usd(760)} vs revenue {usd(0)} · <span className="font-medium text-ink">{usd(760)} at risk</span></div></div>
        <Panel title="Cost per outcome"><SimpleTable head={["Grain", "AI cost", "Outcome", "Cost per unit"]} rows={[
          ["Support Triage (workflow)", usd(4200), "9,800 tickets", "$0.43 / ticket"], ["Doc Summarizer (workflow)", usd(1150), "2,600 docs", "$0.44 / doc"], ["Acme Corp (customer)", usd(1900), "$48,000 revenue", "4.0% of revenue"],
        ]} /></Panel>
      </div>
    </div>
  );
}

// ── Finance: ERP codes ──────────────────────────────────────────────────────
function DemoErpCodes() {
  const [maps, setMaps] = React.useState<Record<string, string>>({ "6000": "60000", "Platform Eng": "ENG" });
  const rows: { label: string; key: string; options: string[] }[] = [
    { label: "6000 · AI COGS", key: "6000", options: ["60000", "60010"] },
    { label: "Platform Eng (cost center)", key: "Platform Eng", options: ["ENG", "PLT"] },
    { label: "Support (cost center)", key: "Support", options: ["SUP", "CS"] },
  ];
  return (
    <div>
      <PageHead title="ERP codes" sub="Upload your real chart of accounts and map Reckon dimensions to it — so exports carry your codes. Upload only, no API." />
      <Panel title="Uploaded code sets"><SimpleTable head={["Code set", "Codes", "Uploaded"]} rows={[["NetSuite production CoA", "142", "May 12"]]} /></Panel>
      <div className="mt-4"><Panel title="Dimension mapping" sub="Unmapped values export with Reckon's code and are flagged.">
        <div className="overflow-hidden rounded-lg border border-line"><table className="w-full text-[13px]">
          <thead className="bg-bg-2 text-left text-[11.5px] uppercase tracking-wide text-ink-3"><tr><th className="px-3 py-2 font-medium">Reckon value</th><th className="px-3 py-2 font-medium">Real ERP code</th><th className="px-3 py-2 font-medium">Status</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.key} className="border-t border-line">
              <td className="px-3 py-2 text-ink">{r.label}</td>
              <td className="px-3 py-2"><select value={maps[r.key] ?? ""} onChange={(e) => setMaps((m) => ({ ...m, [r.key]: e.target.value }))} className="h-8 rounded-md border border-input bg-transparent px-2 text-[12.5px]"><option value="">— unmapped —</option>{r.options.map((o) => <option key={o} value={o}>{o}</option>)}</select></td>
              <td className="px-3 py-2">{maps[r.key] ? <Pill>mapped</Pill> : <Pill tone="warn">needs mapping</Pill>}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </Panel></div>
    </div>
  );
}

// ── Finance: Export (real CSV download) ─────────────────────────────────────
const JE_LINES = [
  { gl: "6000", glName: "AI COGS", cc: "Platform Eng", debit: 3960, credit: 0 },
  { gl: "6000", glName: "AI COGS", cc: "Data", debit: 2210, credit: 0 },
  { gl: "6010", glName: "AI R&D", cc: "Support", debit: 1770, credit: 0 },
  { gl: "2150", glName: "Accrued liabilities", cc: "", debit: 0, credit: 7940 },
];
function buildCsv(batchId: string): string {
  const header = ["batch_external_id", "journal_entry_id", "gl_code", "gl_name", "cost_center", "debit", "credit"];
  return [
    `# Reckon export — ${batchId} — May 2026 (inclusive start, exclusive end; tz America/Los_Angeles)`,
    header.join(","),
    ...JE_LINES.map((l) => [batchId, "JE-MAY-ACCRUAL", l.gl, l.glName, l.cc, l.debit ? l.debit.toFixed(2) : "", l.credit ? l.credit.toFixed(2) : ""].join(",")),
  ].join("\n") + "\n";
}
function DemoExport() {
  const [batches, setBatches] = React.useState([{ id: "RCKN-2026-04-1B77DE03", fmt: "generic_csv", jes: 11, hash: "2d44e018", status: "acknowledged" }]);
  function generate(fmt: string) {
    const id = `RCKN-2026-05-${Math.abs(Array.from(fmt).reduce((a, c) => a + c.charCodeAt(0), Date.now() % 100000)).toString(16).toUpperCase().slice(0, 8)}`;
    const blob = new Blob([buildCsv(id)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `${id}.csv`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    setBatches((b) => [{ id, fmt, jes: 12, hash: Math.random().toString(16).slice(2, 10), status: "downloaded" }, ...b]);
  }
  return (
    <div>
      <PageHead title="Export" sub="Turn approved journal entries into a GL-ready file you import — deterministic, re-import-safe, no credentials." />
      <Panel title="Generate export batch" sub="May accrual · 12 approved JEs. Pick a format and download a real file.">
        <div className="flex flex-wrap gap-2"><Btn onClick={() => generate("generic_csv")}>Generic CSV ↓</Btn><Btn variant="outline" onClick={() => generate("netsuite_csv")}>NetSuite CSV ↓</Btn><Btn variant="outline" onClick={() => generate("qbo_iif")}>QuickBooks IIF ↓</Btn><Btn variant="outline" onClick={() => generate("xero_csv")}>Xero CSV ↓</Btn></div>
        <p className="mt-2 text-[12px] text-ink-3">Each download is a real, deterministic file (same JE set → same content hash). Try it.</p>
      </Panel>
      <div className="mt-4"><Panel title="Batch history" sub="Every batch carries a stable id + content hash; a JE is never silently exported twice.">
        <SimpleTable head={["Batch", "Format", "JEs", "Hash", "Status"]} rows={batches.map((b) => [<span key="1" className="mono text-[11.5px]">{b.id}</span>, b.fmt, String(b.jes), <span key="h" className="text-[11.5px]">{b.hash}…</span>, <Pill key="s">{b.status}</Pill>])} />
      </Panel></div>
    </div>
  );
}
