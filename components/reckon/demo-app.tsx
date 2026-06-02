"use client";

import * as React from "react";
import Link from "next/link";
import {
  LayoutDashboard,
  Users,
  AlertTriangle,
  Key,
  Plug,
  Activity,
  Workflow,
  Landmark,
  FileText,
  BookText,
  Gauge,
  FileDown,
  ArrowLeft,
} from "lucide-react";
import { DashboardClient } from "@/app/(app)/(operations)/dashboard/dashboard-client";
import { MOCK } from "@/lib/reckon/mock";
import { Logo, Avatar, SeverityBadge, ShareBar } from "@/components/reckon/primitives";
import { ThemeToggle } from "@/components/reckon/theme-toggle";
import { PageHead } from "@/components/reckon/page-head";
import { fmtMoney, microsToDollars } from "@/lib/reckon/format";
import { formatDistanceToNow } from "date-fns";

type Screen =
  | "dashboard" | "developers" | "anomalies" | "providers" | "observability" | "integrations"
  | "workflows"
  | "showback" | "invoices" | "accruals" | "unit-economics" | "export";

type NavItem = { id: Screen; label: string; icon: typeof Users; badge?: boolean };
const NAV_SECTIONS: { section: string; items: NavItem[] }[] = [
  {
    section: "Operations",
    items: [
      { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
      { id: "developers", label: "Developers", icon: Users },
      { id: "anomalies", label: "Anomalies", icon: AlertTriangle, badge: true },
      { id: "providers", label: "Providers", icon: Key },
      { id: "observability", label: "Observability", icon: Activity },
      { id: "integrations", label: "Integrations", icon: Plug },
    ],
  },
  { section: "Workflows", items: [{ id: "workflows", label: "Workflows", icon: Workflow }] },
  {
    section: "Pro Finance",
    items: [
      { id: "showback", label: "Showback", icon: Landmark },
      { id: "invoices", label: "Invoices & recon", icon: FileText },
      { id: "accruals", label: "Accruals", icon: BookText },
      { id: "unit-economics", label: "Unit economics", icon: Gauge },
      { id: "export", label: "Export", icon: FileDown },
    ],
  },
];
const ALL_ITEMS = NAV_SECTIONS.flatMap((s) => s.items);

export function DemoApp() {
  const [screen, setScreen] = React.useState<Screen>("dashboard");
  const unack = MOCK.anomalies.length;

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
          <span className={`mono ${mobile ? "" : "ml-auto"} inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-semibold text-white`}>
            {unack}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="flex h-screen overflow-hidden bg-bg-warm">
      {/* Sidebar */}
      <aside className="hidden w-[232px] shrink-0 flex-col border-r border-line bg-paper lg:flex">
        <div className="flex h-[60px] items-center border-b border-line px-[18px]">
          <Logo />
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-3">
          {NAV_SECTIONS.map((sec, i) => (
            <div key={sec.section} className={i > 0 ? "mt-3" : ""}>
              <div className="px-[11px] pb-1 text-[10.5px] font-semibold uppercase tracking-wide text-ink-3/70">{sec.section}</div>
              {sec.items.map((item) => navButton(item))}
            </div>
          ))}
        </nav>
        <div className="border-t border-line p-3">
          <div className="rounded-xl border border-line bg-bg-2 p-3">
            <div className="flex items-center gap-2">
              <span className="pulse-dot" />
              <span className="text-[12.5px] font-semibold text-ink">Ingestion live</span>
            </div>
            <p className="mt-1.5 text-[11.5px] leading-snug text-ink-3">Last poll 6m ago · next in 54m</p>
          </div>
        </div>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-center gap-2 bg-brand-soft px-4 py-1.5 text-[12.5px] text-brand-ink">
          <span className="font-medium">Interactive demo</span>
          <span className="text-ink-3">· sample data, nothing is saved</span>
        </div>

        <header
          className="sticky top-0 z-10 flex h-[56px] shrink-0 items-center justify-between border-b border-line px-4 backdrop-blur lg:px-[26px]"
          style={{ background: "color-mix(in oklab, var(--paper) 82%, transparent)" }}
        >
          <div className="flex items-center gap-2">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-[7px] bg-ink text-[12px] font-bold text-paper">N</span>
            <span className="text-[13.5px] font-semibold text-ink">Northwind</span>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link href="/sign-up" className="inline-flex h-8 items-center rounded-lg bg-brand px-4 text-[12.5px] font-medium text-white hover:opacity-90">Start free</Link>
            <Link href="/" className="inline-flex items-center gap-1 text-[12.5px] text-ink-2 hover:text-ink"><ArrowLeft size={14} /> Exit</Link>
          </div>
        </header>

        <nav className="flex gap-1 overflow-x-auto border-b border-line bg-paper px-3 py-2 lg:hidden">
          {ALL_ITEMS.map((item) => navButton(item, true))}
        </nav>

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1180px] px-4 py-7 lg:px-[26px] fade-up" key={screen}>
            {screen === "dashboard" && (
              <DashboardClient data={MOCK.dashboard} range="30d" orgName="Northwind" recentAnomalies={MOCK.recentAnomalies} demo />
            )}
            {screen === "developers" && <DemoDevelopers />}
            {screen === "anomalies" && <DemoAnomalies />}
            {screen === "providers" && <DemoProviders />}
            {screen === "observability" && <DemoObservability />}
            {screen === "integrations" && <DemoIntegrations />}
            {screen === "workflows" && <DemoWorkflows />}
            {screen === "showback" && <DemoShowback />}
            {screen === "invoices" && <DemoInvoices />}
            {screen === "accruals" && <DemoAccruals />}
            {screen === "unit-economics" && <DemoUnitEconomics />}
            {screen === "export" && <DemoExport />}
          </div>
        </main>
      </div>
    </div>
  );
}

// ── shared bits ─────────────────────────────────────────────────────────────
function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl border bg-paper p-4 shadow-sm ${accent ? "border-brand/40" : "border-line"}`}>
      <div className="text-[11.5px] uppercase tracking-wide text-ink-3">{label}</div>
      <div className={`mono mt-1 text-[22px] font-semibold ${accent ? "text-brand" : "text-ink"}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[12px] text-ink-3">{sub}</div>}
    </div>
  );
}
function Panel({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-paper p-4 shadow-sm">
      <div className="font-semibold text-ink">{title}</div>
      {sub && <p className="mt-0.5 text-[12.5px] text-ink-3">{sub}</p>}
      <div className="mt-3">{children}</div>
    </div>
  );
}
function SimpleTable({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-line">
      <table className="w-full text-[13px]">
        <thead className="bg-bg-2 text-left text-[11.5px] uppercase tracking-wide text-ink-3">
          <tr>{head.map((h, i) => <th key={i} className={`px-3 py-2 font-medium ${i > 0 ? "text-right" : ""}`}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((cells, ri) => (
            <tr key={ri} className="border-t border-line">
              {cells.map((c, ci) => <td key={ci} className={`px-3 py-2 ${ci > 0 ? "mono text-right text-ink-2" : "text-ink"}`}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
const usd = (n: number) => fmtMoney(n);

// ── existing operations screens ─────────────────────────────────────────────
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
                <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{h}</th>
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
                <td className="px-4 py-3"><div className="max-w-[160px]"><ShareBar parts={[{ k: "x", value: (d.totalCost / total) * 100 }]} total={100} h={4} /></div></td>
                <td className="px-4 py-3 mono text-[13.5px] text-ink">{fmtMoney(microsToDollars(d.totalCost))}</td>
                <td className="px-4 py-3"><span className="inline-flex h-[21px] items-center rounded-full bg-bg-2 px-2.5 text-[11.5px] font-medium text-ink-2">{d.keyCount} keys</span></td>
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
              <span className="-my-4 -ml-4 w-1 shrink-0" style={{ background: a.severity === "critical" ? "var(--sev-crit)" : a.severity === "warn" ? "var(--sev-warn)" : "var(--sev-info)" }} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <SeverityBadge severity={a.severity} />
                  <span className="inline-flex h-[21px] items-center rounded-full bg-bg-2 px-2.5 text-[11.5px] font-medium text-ink-2">{a.kind.replace("_", " ")}</span>
                  <span className="text-[12px] text-ink-3">{formatDistanceToNow(new Date(a.detectedAt), { addSuffix: true })}</span>
                </div>
                <div className="mono mt-2 text-[22px] font-semibold text-ink">{a.multiple}×<span className="ml-2 text-[13px] font-normal text-ink-3">above baseline</span></div>
                <div className="mt-2 flex items-center gap-2"><Avatar name={a.developerName} size={22} hue={(i * 47) % 360} /><span className="text-[13px] font-medium text-ink">{a.developerName}</span></div>
              </div>
              <button className="h-8 shrink-0 self-start rounded-lg bg-ink px-3 text-[12.5px] font-medium text-paper hover:opacity-90">Acknowledge</button>
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
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Traces ingested (30d)" value="48,210" sub="from Langfuse" />
        <Stat label="Attributed spend" value="78%" sub="of total, to a workflow" />
        <Stat label="Last sync" value="12m ago" sub="hourly" />
      </div>
      <div className="mt-4">
        <Panel title="Connections">
          <div className="flex items-center justify-between rounded-lg border border-line p-3">
            <div>
              <div className="flex items-center gap-2"><span className="text-[14px] font-semibold text-ink">Langfuse</span><span className="inline-flex h-[19px] items-center rounded-full bg-[color-mix(in_oklab,var(--pos)_12%,transparent)] px-2 text-[11px] font-medium text-pos">Active</span></div>
              <p className="mt-1 text-[12.5px] text-ink-3">us.cloud.langfuse.com · reads trace metadata (name, tags, cost) to map runs → workflows</p>
            </div>
            <span className="mono text-[12px] text-ink-3">pk-lf-3cc7…</span>
          </div>
        </Panel>
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
          <div key={r.name} className="flex items-center justify-between rounded-xl border border-line bg-paper p-4 shadow-sm">
            <div>
              <div className="flex items-center gap-2"><span className="text-[14px] font-semibold text-ink">{r.name}</span><span className="inline-flex h-[19px] items-center rounded-full bg-[color-mix(in_oklab,var(--pos)_12%,transparent)] px-2 text-[11px] font-medium text-pos">Connected</span></div>
              <p className="mt-1 text-[12.5px] text-ink-3">{r.desc}</p>
            </div>
            <span className="relative inline-block h-5 w-9 rounded-full" style={{ background: r.on ? "var(--brand)" : "var(--line-2)" }}>
              <span className="absolute top-0.5 h-4 w-4 rounded-full bg-white" style={{ transform: r.on ? "translateX(18px)" : "translateX(2px)" }} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Workflows surface ───────────────────────────────────────────────────────
function DemoWorkflows() {
  const workflows = [
    { name: "Support Triage Bot", agent: "Support Agent", total: 4200, runs: 1240, perRun: 3.39, outcome: "9,800 tickets → $0.43/ticket" },
    { name: "Code Review Bot", agent: "Dev Agent", total: 2860, runs: 540, perRun: 5.30, outcome: "540 PRs → $5.30/PR" },
    { name: "Doc Summarizer", agent: "Knowledge Agent", total: 1150, runs: 2600, perRun: 0.44, outcome: "2,600 docs → $0.44/doc" },
  ];
  const customers = [
    { ref: "Acme Corp", cost: 1900 }, { ref: "Globex", cost: 1200 }, { ref: "Initech", cost: 760 },
  ];
  return (
    <div>
      <PageHead title="Workflows" sub="A product lens on AI spend — cost per agent, workflow, run, and outcome." />
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Workflow spend (30d)" value={usd(8210)} sub="3 workflows · 2 agents" />
        <Stat label="Runs" value="4,380" sub="across all workflows" />
        <Stat label="Top workflow" value="Support Triage" sub={usd(4200)} />
      </div>
      <div className="mt-4 space-y-4">
        <Panel title="Workflow ROI" sub="Cost per run and cost per business outcome.">
          <SimpleTable
            head={["Workflow", "Agent", "AI cost", "Runs", "Cost / run", "Cost per outcome"]}
            rows={workflows.map((w) => [w.name, <span key="a" className="text-ink-3">{w.agent}</span>, usd(w.total), w.runs.toLocaleString(), usd(w.perRun), <span key="o" className="text-ink-2">{w.outcome}</span>])}
          />
        </Panel>
        <Panel title="Cost by end-customer" sub="Attributed from run metadata (customer_ref).">
          <SimpleTable head={["Customer", "AI cost (30d)"]} rows={customers.map((c) => [c.ref, usd(c.cost)])} />
        </Panel>
      </div>
    </div>
  );
}

// ── Finance: Showback ───────────────────────────────────────────────────────
function DemoShowback() {
  const cc = [{ k: "Platform Eng", v: 4100 }, { k: "Data", v: 2300 }, { k: "Support", v: 1810 }];
  const types = [{ k: "COGS", v: 5900 }, { k: "Opex · R&D", v: 2310 }];
  const total = cc.reduce((a, x) => a + x.v, 0);
  return (
    <div>
      <PageHead title="Showback" sub="Every dollar coded to a cost center, GL account, and product line — reconciles to raw usage." />
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Coded spend (30d)" value={usd(total)} sub="100% of usage" />
        <Stat label="Cost centers" value="3" />
        <Stat label="Uncoded" value="$0" sub="all in the needs-coding queue cleared" />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="By cost center">
          {cc.map((x) => (
            <div key={x.k} className="mb-3 last:mb-0">
              <div className="flex justify-between text-[13px]"><span className="text-ink-2">{x.k}</span><span className="mono text-ink">{usd(x.v)}</span></div>
              <div className="mt-1"><ShareBar parts={[{ k: x.k, value: (x.v / total) * 100 }]} total={100} h={5} /></div>
            </div>
          ))}
        </Panel>
        <Panel title="By GL account type">
          <SimpleTable head={["Account type", "Spend"]} rows={types.map((t) => [t.k, usd(t.v)])} />
          <p className="mt-2 text-[12px] text-ink-3">COGS-coded spend feeds AI COGS % of revenue on Unit economics.</p>
        </Panel>
      </div>
    </div>
  );
}

// ── Finance: Invoices & reconciliation ──────────────────────────────────────
function DemoInvoices() {
  return (
    <div>
      <PageHead title="Invoices & reconciliation" sub="Match the provider invoice to the usage we observed — explain every dollar of the gap." />
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Anthropic invoice" value={usd(4180.5)} sub="May · billing API" />
        <Stat label="Observed usage" value={usd(4205.2)} sub="sum of usage_events" />
        <Stat label="Reconciled" value="within $0.00" sub="gap fully explained" accent />
      </div>
      <div className="mt-4">
        <Panel title="Discrepancies (explained)" sub="Residual after explaining each line nets to zero.">
          <SimpleTable
            head={["Type", "Amount", "Note"]}
            rows={[
              ["credits", <span key="1">−{usd(42)}</span>, <span key="n1" className="text-ink-3">promotional credit applied on invoice</span>],
              ["untracked_keys", <span key="2">+{usd(18)}</span>, <span key="n2" className="text-ink-3">key not yet mapped to a developer</span>],
              ["rounding", <span key="3">−{usd(0.7)}</span>, <span key="n3" className="text-ink-3">provider rounds to the cent</span>],
            ]}
          />
        </Panel>
      </div>
    </div>
  );
}

// ── Finance: Accruals / close ───────────────────────────────────────────────
function DemoAccruals() {
  return (
    <div>
      <PageHead title="Accruals" sub="Real-time usage is the best accrual estimate. Generate a balanced draft JE; reverse and true-up next period." />
      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Estimated accrual" value={usd(7940)} sub="May" />
        <Stat label="Observed" value={usd(6200)} sub="coded usage" />
        <Stat label="Forecast tail" value={usd(1740)} sub="not-yet-reported" />
        <Stat label="Accrual accuracy" value="±6.2%" sub="trailing 3 periods" accent />
      </div>
      <div className="mt-4 space-y-4">
        <Panel title="Draft journal entry — May accrual" sub="Expense debits by GL × cost center, one accrued-liability credit. Debits = credits.">
          <SimpleTable
            head={["GL account", "Cost center", "Debit", "Credit"]}
            rows={[
              ["6000 · AI COGS", "Platform Eng", usd(3960), ""],
              ["6000 · AI COGS", "Data", usd(2210), ""],
              ["6010 · AI R&D", "Support", usd(1770), ""],
              [<span key="l" className="text-ink-3">2150 · Accrued liabilities</span>, "—", "", usd(7940)],
            ]}
          />
          <div className="mt-3 flex items-center gap-2">
            <span className="inline-flex h-[21px] items-center rounded-full bg-bg-2 px-2.5 text-[11.5px] font-medium text-ink-2">balanced</span>
            <span className="inline-flex h-[21px] items-center rounded-full bg-bg-2 px-2.5 text-[11.5px] font-medium text-ink-2">draft → approved</span>
            <span className="text-[12px] text-ink-3">reversed &amp; trued-up against the actual invoice next period</span>
          </div>
        </Panel>
      </div>
    </div>
  );
}

// ── Finance: Unit economics ─────────────────────────────────────────────────
function DemoUnitEconomics() {
  return (
    <div>
      <PageHead title="Unit economics" sub="Is the AI spend worth it? Cost per unit, AI COGS as a share of revenue, and margin." />
      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Revenue (org)" value={usd(142000)} sub="customer-supplied" />
        <Stat label="AI COGS" value={usd(8260)} sub="COGS-coded only" />
        <Stat label="AI COGS % of revenue" value="5.8%" accent />
        <Stat label="Gross margin (AI)" value={usd(133740)} sub="94.2%" />
      </div>
      <div className="mt-4 space-y-4">
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
          <div className="font-semibold text-ink">Margin at risk</div>
          <div className="mt-2 text-[13px] text-ink-2">
            <span className="mr-2 inline-flex items-center rounded-full bg-red-500/15 px-2 py-0.5 text-[11.5px] font-medium text-red-600">negative margin</span>
            customer · Initech — AI cost {usd(760)} vs revenue {usd(0)} · <span className="font-medium text-ink">{usd(760)} at risk</span>
          </div>
        </div>
        <Panel title="Cost per outcome">
          <SimpleTable
            head={["Grain", "AI cost", "Outcome", "Cost per unit"]}
            rows={[
              ["Support Triage (workflow)", usd(4200), "9,800 tickets", "$0.43 / ticket"],
              ["Doc Summarizer (workflow)", usd(1150), "2,600 docs", "$0.44 / doc"],
              ["Acme Corp (customer)", usd(1900), "$48,000 revenue", "4.0% of revenue"],
            ]}
          />
        </Panel>
      </div>
    </div>
  );
}

// ── Finance: Export ─────────────────────────────────────────────────────────
function DemoExport() {
  return (
    <div>
      <PageHead title="Export" sub="Turn approved journal entries into a GL-ready file you import — deterministic, re-import-safe, no credentials." />
      <div className="mt-1 space-y-4">
        <Panel title="Batch history" sub="Every batch carries a stable id + content hash; a JE is never silently exported twice.">
          <SimpleTable
            head={["Batch", "Format", "JEs", "Hash", "Status"]}
            rows={[
              [<span key="1" className="mono text-[11.5px]">RCKN-2026-05-4F2A91C0</span>, "netsuite_csv", "12", <span key="h1" className="text-[11.5px]">8c1f9a2b…</span>, <span key="s1" className="inline-flex items-center rounded-full bg-bg-2 px-2 py-0.5 text-[11px] font-medium text-ink-2">downloaded</span>],
              [<span key="2" className="mono text-[11.5px]">RCKN-2026-04-1B77DE03</span>, "generic_csv", "11", <span key="h2" className="text-[11.5px]">2d44e018…</span>, <span key="s2" className="inline-flex items-center rounded-full bg-bg-2 px-2 py-0.5 text-[11px] font-medium text-ink-2">acknowledged</span>],
            ]}
          />
        </Panel>
        <Panel title="ERP code mapping" sub="Map Reckon dimensions to your real chart of accounts — uploaded, never via API.">
          <SimpleTable
            head={["Reckon value", "Real ERP code", "Status"]}
            rows={[
              ["6000 · AI COGS", "60000 · AI COGS", <span key="1" className="inline-flex items-center rounded-full bg-bg-2 px-2 py-0.5 text-[11px] font-medium text-ink-2">mapped</span>],
              ["Platform Eng (cost center)", "ENG", <span key="2" className="inline-flex items-center rounded-full bg-bg-2 px-2 py-0.5 text-[11px] font-medium text-ink-2">mapped</span>],
              ["Support (cost center)", "—", <span key="3" className="inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-600">needs mapping</span>],
            ]}
          />
        </Panel>
      </div>
    </div>
  );
}
