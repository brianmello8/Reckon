"use client";

import * as React from "react";
import { useRouter, usePathname } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { fmtMoney, microsToDollars } from "@/lib/reckon/format";

type Metric = { key: string; name: string; unit: string; valueScaled: string; costPerUnitMicros: string | null };
type ProductLine = {
  id: string; code: string; name: string;
  costMicros: string; cogsMicros: string; revenueMicros: string | null;
  cogsPctBps: number | null; marginMicros: string | null; marginPctBps: number | null; hasRevenue: boolean;
};
type Customer = { ref: string; costMicros: string; metrics: Metric[] };
type Workflow = { id: string; name: string; costMicros: string; runCount: number; costPerRunMicros: string | null; metrics: Metric[] };
type Alert = {
  grain: "customer" | "workflow" | "product_line"; label: string;
  kind: "negative_margin" | "erosion"; severity: "critical" | "warn";
  costMicros: string; revenueMicros: string; marginAtRiskMicros: string;
};
type View = {
  period: string;
  periods: string[];
  economics: {
    window: { from: string; to: string };
    board: {
      revenueMicros: string | null; cogsMicros: string; cogsPctBps: number | null;
      marginMicros: string | null; marginPctBps: number | null; hasRevenue: boolean;
    };
    byProductLine: ProductLine[];
    customers: Customer[];
    workflows: Workflow[];
    reconciliation: {
      usageTotalMicros: string; allocatedTotalMicros: string; matches: boolean;
      attributedCustomerMicros: string; attributedWorkflowMicros: string;
    };
  };
  alerts: Alert[];
};

const money = (m: string) => fmtMoney(microsToDollars(Number(m)));
const bps = (b: number | null) => (b == null ? "—" : (b / 100).toFixed(1) + "%");
/** cost-per-unit micros → "$X.XX" with up to 4 dp for sub-dollar units. */
function perUnit(micros: string | null): string {
  if (micros == null) return "—";
  const d = microsToDollars(Number(micros));
  return "$" + d.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: d < 1 ? 4 : 2 });
}
const unitName = (u: string) => u.replace(/_/g, " ");

export function UnitEconomicsClient({ view }: { view: View }) {
  const router = useRouter();
  const pathname = usePathname();
  const e = view.economics;

  return (
    <div className="space-y-5">
      {/* Period selector */}
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-ink-3">Period</span>
        <select
          className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
          value={view.period}
          onChange={(ev) => router.push(`${pathname}?period=${ev.target.value}`)}
        >
          {view.periods.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <span className="text-[12px] text-ink-3">{e.window.from} → {e.window.to}</span>
      </div>

      {/* Margin alerts */}
      {view.alerts.length > 0 && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
          <div className="font-semibold text-ink">Margin at risk</div>
          <div className="mt-2 space-y-1.5">
            {view.alerts.map((a, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 text-[13px]">
                <Badge variant={a.severity === "critical" ? "destructive" : "secondary"}>
                  {a.kind === "negative_margin" ? "negative margin" : "erosion"}
                </Badge>
                <span className="text-ink-2">{a.grain.replace(/_/g, " ")} · {a.label}</span>
                <span className="text-ink-3">
                  cost {money(a.costMicros)} vs revenue {money(a.revenueMicros)} —{" "}
                  <span className="font-medium text-ink">{money(a.marginAtRiskMicros)} at risk</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Board number */}
      <div className="rounded-xl border border-line bg-paper p-4">
        <div className="font-semibold text-ink">The board number</div>
        {e.board.hasRevenue ? (
          <div className="mt-3 flex flex-wrap gap-3">
            <Stat label="Revenue (org)" value={money(e.board.revenueMicros!)} />
            <Stat label="AI COGS" value={money(e.board.cogsMicros)} />
            <Stat label="AI COGS % of revenue" value={bps(e.board.cogsPctBps)} accent />
            <Stat label="Gross margin (AI)" value={money(e.board.marginMicros!)} />
            <Stat label="Margin %" value={bps(e.board.marginPctBps)} />
          </div>
        ) : (
          <NoData>
            No org-level revenue outcome for this period. AI COGS was {money(e.board.cogsMicros)}; add a revenue
            metric (grain: org) on the Outcomes page to see COGS % and margin.
          </NoData>
        )}
      </div>

      {/* Product lines: COGS % + margin */}
      <Section title="Margin by product line" sub="AI COGS uses only COGS-coded spend; margin = revenue − AI COGS.">
        {e.byProductLine.length === 0 ? (
          <NoData>No product-line-coded usage in this period.</NoData>
        ) : (
          <Table head={["Product line", "AI cost", "AI COGS", "Revenue", "COGS %", "Margin", "Margin %"]}>
            {e.byProductLine.map((pl) => (
              <tr key={pl.id} className="border-t border-line">
                <td className="px-3 py-1.5 text-ink-2">{pl.code} · {pl.name}</td>
                <td className="px-3 py-1.5 text-right font-mono text-ink-2">{money(pl.costMicros)}</td>
                <td className="px-3 py-1.5 text-right font-mono text-ink-2">{money(pl.cogsMicros)}</td>
                <td className="px-3 py-1.5 text-right font-mono text-ink-2">{pl.revenueMicros ? money(pl.revenueMicros) : <span className="text-ink-3">no data</span>}</td>
                <td className="px-3 py-1.5 text-right font-mono text-ink-2">{bps(pl.cogsPctBps)}</td>
                <td className="px-3 py-1.5 text-right font-mono text-ink-2">{pl.marginMicros ? money(pl.marginMicros) : "—"}</td>
                <td className="px-3 py-1.5 text-right font-mono text-ink">{bps(pl.marginPctBps)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      {/* Workflows: cost per run vs outcome → ROI */}
      <Section title="Workflow ROI" sub="Cost per run and cost per outcome unit.">
        {e.workflows.length === 0 ? (
          <NoData>No attributed workflow cost in this period.</NoData>
        ) : (
          <Table head={["Workflow", "AI cost", "Runs", "Cost / run", "Cost per outcome"]}>
            {e.workflows.map((w) => (
              <tr key={w.id} className="border-t border-line align-top">
                <td className="px-3 py-1.5 text-ink-2">{w.name}</td>
                <td className="px-3 py-1.5 text-right font-mono text-ink-2">{money(w.costMicros)}</td>
                <td className="px-3 py-1.5 text-right font-mono text-ink-2">{w.runCount}</td>
                <td className="px-3 py-1.5 text-right font-mono text-ink-2">{w.costPerRunMicros ? money(w.costPerRunMicros) : "—"}</td>
                <td className="px-3 py-1.5">{costPerUnitCell(w.metrics)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      {/* Customers: cost per outcome unit */}
      <Section title="Customer unit cost" sub="AI cost per customer, divided by the outcomes supplied for that customer.">
        {e.customers.length === 0 ? (
          <NoData>No customer-attributed cost in this period.</NoData>
        ) : (
          <Table head={["Customer", "AI cost", "Cost per outcome"]}>
            {e.customers.map((c) => (
              <tr key={c.ref} className="border-t border-line align-top">
                <td className="px-3 py-1.5 text-ink-2">{c.ref}</td>
                <td className="px-3 py-1.5 text-right font-mono text-ink-2">{money(c.costMicros)}</td>
                <td className="px-3 py-1.5">{costPerUnitCell(c.metrics)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      {/* Reconciliation */}
      <div className="rounded-xl border border-line bg-bg-2 p-3 text-[12.5px]">
        <div className="flex items-center gap-2">
          <Badge variant={e.reconciliation.matches ? "default" : "destructive"}>
            {e.reconciliation.matches ? "reconciled" : "MISMATCH"}
          </Badge>
          <span className="text-ink-3">
            Allocated cost {money(e.reconciliation.allocatedTotalMicros)} = underlying usage{" "}
            {money(e.reconciliation.usageTotalMicros)}. Attributed: customers{" "}
            {money(e.reconciliation.attributedCustomerMicros)}, workflows{" "}
            {money(e.reconciliation.attributedWorkflowMicros)}.
          </span>
        </div>
      </div>
    </div>
  );
}

function costPerUnitCell(metrics: Metric[]) {
  if (metrics.length === 0) return <span className="text-[12px] text-ink-3">no outcome data</span>;
  return (
    <div className="space-y-0.5">
      {metrics.map((m) => (
        <div key={m.key} className="text-[12.5px] text-ink-2">
          <span className="font-mono text-ink">{perUnit(m.costPerUnitMicros)}</span>
          <span className="text-ink-3"> / {unitName(m.unit)}</span>
          <span className="text-ink-3"> ({m.name})</span>
        </div>
      ))}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${accent ? "border-brand/40 bg-brand/5" : "border-line bg-bg-2"}`}>
      <div className="text-[11px] text-ink-3">{label}</div>
      <div className={`font-mono text-[16px] font-semibold ${accent ? "text-brand" : "text-ink"}`}>{value}</div>
    </div>
  );
}

function Section({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-paper p-4">
      <div className="font-semibold text-ink">{title}</div>
      <p className="mt-0.5 text-[12.5px] text-ink-3">{sub}</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border border-line">
      <table className="w-full text-[13px]">
        <thead className="bg-bg-2 text-left text-[12px] text-ink-3">
          <tr>
            {head.map((h, i) => (
              <th key={i} className={`px-3 py-1.5 font-medium ${i > 0 && i < head.length ? "text-right" : ""}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function NoData({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-dashed border-line bg-bg-2 px-3 py-2 text-[12.5px] text-ink-3">{children}</p>;
}
