"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { fmtMoney, microsToDollars } from "@/lib/reckon/format";
import { getDrillAction, saveBudget, deleteBudget } from "./actions";

type Dim = "cost_center" | "gl_account" | "entity" | "project" | "product_line";
type CcNode = {
  id: string;
  code: string;
  name: string;
  parentId: string | null;
  directMicros: string;
  rolledMicros: string;
  children: CcNode[];
};
type Row = { id: string | null; code: string; name: string; micros: string };
type GlRow = Row & { accountType: string };
type Opt = { id: string; label: string };

type Showback = {
  grandMicros: string;
  costCenterTree: CcNode[];
  uncodedCostCenterMicros: string;
  byGlAccount: GlRow[];
  byAccountType: { accountType: string; micros: string }[];
  byEntity: Row[];
  byProductLine: Row[];
};
type BudgetVsActual = {
  period: string;
  from: string;
  to: string;
  rows: {
    id: string;
    scopeType: string;
    scopeId: string;
    label: string;
    budgetMicros: string;
    actualMicros: string;
    varianceMicros: string;
    variancePct: number | null;
    paceMicros: string | null;
    overPace: boolean | null;
  }[];
};

const money = (m: string | number) => fmtMoney(microsToDollars(Number(m)));
const ACCOUNT_TYPE_LABEL: Record<string, string> = {
  cogs: "COGS",
  opex_rnd: "Opex · R&D",
  opex_ga: "Opex · G&A",
  opex_sm: "Opex · S&M",
  other: "Other",
  uncoded: "Uncoded",
};

function shiftMonth(period: string, delta: number): string {
  const m = period.match(/^(\d{4})-(\d{2})$/);
  if (!m) return period;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function ShowbackClient(props: {
  period: string;
  from: string;
  to: string;
  showback: Showback;
  budgetVsActual: BudgetVsActual;
  budgets: { id: string; scopeType: string; scopeId: string; amountMicros: string }[];
  canSeeDevelopers: boolean;
  scopeOptions: { cost_center: Opt[]; gl_account: Opt[]; project: Opt[] };
}) {
  const router = useRouter();
  const [tab, setTab] = React.useState<"cost_center" | "gl" | "entity" | "product_line" | "budgets">("cost_center");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => router.push(`/finance?period=${shiftMonth(props.period, -1)}`)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[88px] text-center text-sm font-medium text-ink">{props.period}</span>
          <Button variant="ghost" size="sm" onClick={() => router.push(`/finance?period=${shiftMonth(props.period, 1)}`)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="text-sm text-ink-2">
          Total billed usage:{" "}
          <span className="font-mono font-semibold text-ink">{money(props.showback.grandMicros)}</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        {([
          ["cost_center", "Cost centers"],
          ["gl", "GL accounts"],
          ["entity", "Entities"],
          ["product_line", "Product lines"],
          ["budgets", "Budgets"],
        ] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === k ? "bg-ink text-paper" : "text-ink-3 hover:bg-bg-2 hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "cost_center" && <CostCenterView {...props} />}
      {tab === "gl" && <GlView {...props} />}
      {tab === "entity" && <FlatView {...props} dim="entity" rows={props.showback.byEntity} head="Entity" />}
      {tab === "product_line" && <FlatView {...props} dim="product_line" rows={props.showback.byProductLine} head="Product line" />}
      {tab === "budgets" && <BudgetsView {...props} />}
    </div>
  );
}

// --- Drill panel (shared) ---
function useDrill(from: string, to: string) {
  const [drill, setDrill] = React.useState<{ dim: Dim; scopeId: string | null; label: string } | null>(null);
  const [rows, setRows] = React.useState<Awaited<ReturnType<typeof getDrillAction>>>([]);
  const [loading, setLoading] = React.useState(false);

  async function open(dim: Dim, scopeId: string | null, label: string) {
    setDrill({ dim, scopeId, label });
    setLoading(true);
    try {
      setRows(await getDrillAction(dim, scopeId, from, to));
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }
  return { drill, rows, loading, open, close: () => setDrill(null) };
}

function DrillPanel({
  drill,
  rows,
  loading,
  close,
  canSeeDevelopers,
}: {
  drill: { label: string } | null;
  rows: Awaited<ReturnType<typeof getDrillAction>>;
  loading: boolean;
  close: () => void;
  canSeeDevelopers: boolean;
  open?: unknown;
}) {
  if (!drill) return null;
  return (
    <div className="mt-4 rounded-xl border border-line bg-paper p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[14px] font-semibold text-ink">Contributing usage · {drill.label}</h3>
        <Button variant="ghost" size="sm" onClick={close}>Close</Button>
      </div>
      {loading ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-zinc-500">No usage in this period.</p>
      ) : (
        <table className="w-full text-[13px]">
          <thead className="text-left text-[12px] text-ink-3">
            <tr>
              <th className="py-1 font-medium">Day</th>
              <th className="py-1 font-medium">Provider</th>
              <th className="py-1 font-medium">Model</th>
              {canSeeDevelopers && <th className="py-1 font-medium">Developer</th>}
              <th className="py-1 font-medium">Allocated</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-line">
                <td className="py-1 text-ink-2">{r.day}</td>
                <td className="py-1 text-ink-2">{r.providerName}</td>
                <td className="py-1 text-ink-2">{r.model}</td>
                {canSeeDevelopers && <td className="py-1 text-ink-2">{r.developerName ?? "—"}</td>}
                <td className="py-1 font-mono text-ink-2">{money(r.allocatedMicros)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function CostCenterView(props: React.ComponentProps<typeof ShowbackClient>) {
  const d = useDrill(props.from, props.to);
  const renderNode = (n: CcNode, depth: number): React.ReactNode => (
    <React.Fragment key={n.id}>
      <tr className="border-b border-line last:border-0 hover:bg-bg-2 cursor-pointer" onClick={() => d.open("cost_center", n.id, `${n.code} · ${n.name}`)}>
        <td className="px-4 py-2.5">
          <span style={{ paddingLeft: depth * 18 }} className="inline-flex items-center gap-2">
            {depth > 0 && <span className="text-ink-3">└</span>}
            <span className="font-mono text-[12px] text-ink-2">{n.code}</span>
            <span className="text-ink">{n.name}</span>
          </span>
        </td>
        <td className="px-4 py-2.5 text-right font-mono text-ink-2">{money(n.directMicros)}</td>
        <td className="px-4 py-2.5 text-right font-mono font-semibold text-ink">{money(n.rolledMicros)}</td>
      </tr>
      {n.children.map((c) => renderNode(c, depth + 1))}
    </React.Fragment>
  );
  return (
    <div>
      <div className="overflow-hidden rounded-xl border border-line bg-paper">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-bg-2 text-left text-[12px] text-ink-3">
            <tr>
              <th className="px-4 py-2 font-medium">Cost center</th>
              <th className="px-4 py-2 text-right font-medium">Direct</th>
              <th className="px-4 py-2 text-right font-medium">Rolled up</th>
            </tr>
          </thead>
          <tbody>
            {props.showback.costCenterTree.map((n) => renderNode(n, 0))}
            {Number(props.showback.uncodedCostCenterMicros) > 0 && (
              <tr className="border-t border-line hover:bg-bg-2 cursor-pointer" onClick={() => d.open("cost_center", null, "Uncoded")}>
                <td className="px-4 py-2.5 text-ink-3">Uncoded (no cost center)</td>
                <td className="px-4 py-2.5 text-right font-mono text-ink-3">{money(props.showback.uncodedCostCenterMicros)}</td>
                <td className="px-4 py-2.5 text-right font-mono text-ink-3">{money(props.showback.uncodedCostCenterMicros)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <DrillPanel {...d} canSeeDevelopers={props.canSeeDevelopers} />
    </div>
  );
}

function GlView(props: React.ComponentProps<typeof ShowbackClient>) {
  const d = useDrill(props.from, props.to);
  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        {props.showback.byAccountType.map((t) => (
          <div key={t.accountType} className="rounded-xl border border-line bg-paper px-3 py-2">
            <div className="text-[11.5px] text-ink-3">{ACCOUNT_TYPE_LABEL[t.accountType] ?? t.accountType}</div>
            <div className="font-mono text-[15px] font-semibold text-ink">{money(t.micros)}</div>
          </div>
        ))}
      </div>
      <div className="overflow-hidden rounded-xl border border-line bg-paper">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-bg-2 text-left text-[12px] text-ink-3">
            <tr>
              <th className="px-4 py-2 font-medium">GL account</th>
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 text-right font-medium">Spend</th>
            </tr>
          </thead>
          <tbody>
            {props.showback.byGlAccount.map((g, i) => (
              <tr key={i} className="border-b border-line last:border-0 hover:bg-bg-2 cursor-pointer" onClick={() => d.open("gl_account", g.id, `${g.code} · ${g.name}`)}>
                <td className="px-4 py-2.5">
                  <span className="font-mono text-[12px] text-ink-2">{g.code}</span> <span className="text-ink">{g.name}</span>
                </td>
                <td className="px-4 py-2.5">
                  <Badge variant={g.accountType === "cogs" ? "default" : "secondary"}>
                    {ACCOUNT_TYPE_LABEL[g.accountType] ?? g.accountType}
                  </Badge>
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-ink">{money(g.micros)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <DrillPanel {...d} canSeeDevelopers={props.canSeeDevelopers} />
    </div>
  );
}

function FlatView(
  props: React.ComponentProps<typeof ShowbackClient> & { dim: Dim; rows: Row[]; head: string }
) {
  const d = useDrill(props.from, props.to);
  return (
    <div>
      <div className="overflow-hidden rounded-xl border border-line bg-paper">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-bg-2 text-left text-[12px] text-ink-3">
            <tr>
              <th className="px-4 py-2 font-medium">{props.head}</th>
              <th className="px-4 py-2 text-right font-medium">Spend</th>
            </tr>
          </thead>
          <tbody>
            {props.rows.map((r, i) => (
              <tr key={i} className="border-b border-line last:border-0 hover:bg-bg-2 cursor-pointer" onClick={() => d.open(props.dim, r.id, r.id ? `${r.code} · ${r.name}` : "Uncoded")}>
                <td className="px-4 py-2.5 text-ink">{r.id ? `${r.code} · ${r.name}` : "Uncoded"}</td>
                <td className="px-4 py-2.5 text-right font-mono text-ink">{money(r.micros)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <DrillPanel {...d} canSeeDevelopers={props.canSeeDevelopers} />
    </div>
  );
}

function BudgetsView(props: React.ComponentProps<typeof ShowbackClient>) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [scopeType, setScopeType] = React.useState<"cost_center" | "gl_account" | "project">("cost_center");

  async function submit(formData: FormData) {
    setPending(true);
    try {
      const raw = Object.fromEntries(formData.entries()) as Record<string, string>;
      raw.period = props.period;
      await saveBudget(raw);
      toast.success("Budget saved");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setPending(false);
    }
  }

  const opts = props.scopeOptions[scopeType];

  return (
    <div className="space-y-4">
      <form action={submit} className="flex flex-wrap items-end gap-3 rounded-xl border border-line bg-paper p-3">
        <label className="flex flex-col gap-1 text-[12px] text-ink-3">
          Scope
          <select
            name="scopeType"
            value={scopeType}
            onChange={(e) => setScopeType(e.target.value as typeof scopeType)}
            className="h-9 w-36 rounded-md border border-input bg-transparent px-2 text-sm"
          >
            <option value="cost_center">Cost center</option>
            <option value="gl_account">GL account</option>
            <option value="project">Project</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-ink-3">
          Target
          <select name="scopeId" required className="h-9 w-56 rounded-md border border-input bg-transparent px-2 text-sm">
            {opts.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-ink-3">
          Amount ({props.period})
          <Input name="amount" type="number" step="0.01" min="0" required className="w-32" />
        </label>
        <Button type="submit" disabled={pending || opts.length === 0}>{pending ? "Saving…" : "Set budget"}</Button>
      </form>

      {props.budgetVsActual.rows.length === 0 ? (
        <p className="text-sm text-zinc-500">No budgets for {props.period}. Add one above to track budget vs actual.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-paper">
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-bg-2 text-left text-[12px] text-ink-3">
              <tr>
                <th className="px-4 py-2 font-medium">Scope</th>
                <th className="px-4 py-2 text-right font-medium">Budget</th>
                <th className="px-4 py-2 text-right font-medium">Actual</th>
                <th className="px-4 py-2 text-right font-medium">Variance</th>
                <th className="px-4 py-2 font-medium">Pace (MTD)</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {props.budgetVsActual.rows.map((r) => {
                const over = Number(r.varianceMicros) > 0;
                return (
                  <tr key={r.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-2.5 text-ink">{r.label}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-ink-2">{money(r.budgetMicros)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-ink">{money(r.actualMicros)}</td>
                    <td className={`px-4 py-2.5 text-right font-mono ${over ? "text-red-600" : "text-emerald-600"}`}>
                      {over ? "+" : ""}{money(r.varianceMicros)}
                      {r.variancePct !== null && <span className="text-ink-3"> ({r.variancePct > 0 ? "+" : ""}{r.variancePct}%)</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      {r.paceMicros === null ? (
                        <span className="text-ink-3">—</span>
                      ) : (
                        <Badge variant={r.overPace ? "destructive" : "default"}>
                          {r.overPace ? "ahead of pace" : "on/under pace"}
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-700"
                        onClick={async () => {
                          if (!confirm("Delete this budget?")) return;
                          await deleteBudget(r.id);
                          router.refresh();
                        }}
                      >
                        Delete
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
