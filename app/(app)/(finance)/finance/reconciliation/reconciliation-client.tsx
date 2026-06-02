"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fmtMoney, microsToDollars } from "@/lib/reckon/format";
import {
  runReconcileAction,
  refreshReconAction,
  setReconStatus,
} from "./actions";

type Disc = {
  id: string;
  type: string;
  amount: string;
  detail: Record<string, unknown> | null;
  suggestedAction: string | null;
};
type Recon = {
  id: string;
  invoiceId: string;
  provider: string;
  invoiceNumber: string;
  periodStart: string;
  periodEnd: string;
  billedTotal: string;
  observedTotal: string;
  delta: string;
  status: "open" | "explained" | "accepted" | "disputed" | "stale";
  observedThrough: string | null;
  rateRefAsOf: string | null;
  computedAt: string;
  discrepancies: Disc[];
};
type Invoice = {
  id: string;
  provider: string;
  invoiceNumber: string;
  total: string;
  currency: string;
  status: string;
  rateCheckable: boolean;
  reconciled: boolean;
};

const money = (m: string | number) => fmtMoney(microsToDollars(Number(m)));
const signed = (m: string) => (Number(m) > 0 ? "+" : "") + money(m);
const signedD = (v: number) => (v < 0 ? "−" : "+") + fmtMoney(Math.abs(v));

const TYPE_LABEL: Record<string, string> = {
  untracked_keys: "Untracked keys",
  credits: "Credit applied",
  missing_credit: "Missing credit",
  tax: "Tax",
  fx: "Currency (FX)",
  price_change: "Price change",
  rounding: "Rounding",
  unknown: "Unknown",
};

export function ReconciliationClient({
  reconciliations,
  invoices,
}: {
  reconciliations: Recon[];
  invoices: Invoice[];
}) {
  return (
    <div className="space-y-6">
      <RunSection invoices={invoices} />
      <div className="space-y-4">
        {reconciliations.length === 0 ? (
          <p className="text-sm text-zinc-500">No reconciliations yet. Reconcile an invoice above.</p>
        ) : (
          reconciliations.map((r) => <ReconCard key={r.id} r={r} />)
        )}
      </div>
    </div>
  );
}

function RunSection({ invoices }: { invoices: Invoice[] }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  if (invoices.length === 0) {
    return <p className="text-sm text-zinc-500">No invoices yet. Capture one on the Invoices page first.</p>;
  }
  async function run(id: string) {
    setBusy(id);
    try {
      await runReconcileAction(id);
      toast.success("Reconciled");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-paper">
      <table className="w-full text-sm">
        <thead className="border-b border-line bg-bg-2 text-left text-[12px] text-ink-3">
          <tr>
            <th className="px-4 py-2 font-medium">Invoice</th>
            <th className="px-4 py-2 text-right font-medium">Total</th>
            <th className="px-4 py-2 font-medium">Rate-checkable</th>
            <th className="px-4 py-2" />
          </tr>
        </thead>
        <tbody>
          {invoices.map((i) => (
            <tr key={i.id} className="border-b border-line last:border-0">
              <td className="px-4 py-2.5 text-ink">{i.provider} · <span className="font-mono text-[12.5px]">{i.invoiceNumber}</span></td>
              <td className="px-4 py-2.5 text-right font-mono text-ink-2">{money(i.total)} {i.currency}</td>
              <td className="px-4 py-2.5">
                <Badge variant={i.rateCheckable ? "default" : "secondary"}>{i.rateCheckable ? "yes" : "lump-sum"}</Badge>
              </td>
              <td className="px-4 py-2.5 text-right">
                <Button variant="outline" size="sm" disabled={busy === i.id} onClick={() => run(i.id)}>
                  {i.reconciled ? "Recompute" : "Reconcile"}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReconCard({ r }: { r: Recon }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const statusVariant =
    r.status === "stale" ? "destructive" : r.status === "accepted" ? "default" : "secondary";
  const hasUnknown = r.discrepancies.some((d) => d.type === "unknown" && Number(d.amount) !== 0);
  const hasMissingCredit = r.discrepancies.some((d) => d.type === "missing_credit");

  return (
    <div className="rounded-xl border border-line bg-paper p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-semibold text-ink">
            {r.provider} · <span className="font-mono text-[13px]">{r.invoiceNumber}</span>
          </div>
          <div className="text-[12.5px] text-ink-3">{r.periodStart} → {r.periodEnd}</div>
        </div>
        <Badge variant={statusVariant}>{r.status.toUpperCase()}</Badge>
      </div>

      {r.status === "stale" && (
        <div className="mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-[13px] text-red-700">
          New in-period usage landed after this was {`accepted/disputed`}. Conclusion preserved — re-review and recompute.
        </div>
      )}

      <div className="mt-3 grid grid-cols-3 gap-3">
        <Stat label="Billed" value={money(r.billedTotal)} />
        <Stat label="Observed" value={money(r.observedTotal)} />
        <Stat label="Delta" value={signed(r.delta)} accent={Number(r.delta) !== 0} />
      </div>

      <div className="mt-4">
        <div className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-ink-3">
          Waterfall <span className="font-normal normal-case text-ink-3">— how the {signed(r.delta)} delta is explained</span>
        </div>
        {r.discrepancies.length === 0 ? (
          <p className="text-sm text-emerald-600">Exact match — no delta to explain. ✓</p>
        ) : (
          <>
            <Waterfall discrepancies={r.discrepancies} />
            <div className="mt-3 divide-y divide-line rounded-lg border border-line">
              {r.discrepancies.map((d) => (
                <DiscRow key={d.id} d={d} />
              ))}
            </div>
          </>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-[12px] text-ink-3">
          observed through {r.observedThrough ? new Date(r.observedThrough).toLocaleString() : "—"} ·
          rate as-of {r.rateRefAsOf ?? "—"}
        </span>
        <div className="ml-auto flex gap-1">
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => act(() => refreshReconAction(r.id), "Refreshed")}>Refresh</Button>
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => act(() => runReconcileAction(r.invoiceId), "Recomputed")}>Recompute</Button>
          <Button variant="ghost" size="sm" disabled={busy || hasUnknown} title={hasUnknown ? "Resolve the unknown before accepting" : ""} onClick={() => act(() => setReconStatus(r.id, "accepted"), "Accepted")}>Accept</Button>
          <Button variant="ghost" size="sm" disabled={busy} className="text-red-600" onClick={() => act(() => setReconStatus(r.id, "disputed"), "Disputed")}>Dispute</Button>
        </div>
      </div>
      {hasUnknown && (
        <p className="mt-2 text-[12px] text-red-600">An unexplained (unknown) amount remains — investigate before accepting.</p>
      )}
      {hasMissingCredit && (
        <p className="mt-1 text-[12px] text-amber-700">A promised credit is missing from this invoice — consider disputing.</p>
      )}
    </div>
  );
}

/** Floating waterfall: each discrepancy steps the running total; the bars build
 * from zero to the net explained delta. Credits/reductions step down (green),
 * additions step up (coral), an unexplained "unknown" is red. */
function Waterfall({ discrepancies }: { discrepancies: Disc[] }) {
  const items = discrepancies.map((d) => ({
    type: d.type,
    label: TYPE_LABEL[d.type] ?? d.type,
    v: microsToDollars(Number(d.amount)),
  }));
  // Prefix sums (no mutable accumulator — keeps render pure). n ≤ 8.
  const cum = items.map((_, i) => items.slice(0, i + 1).reduce((a, x) => a + x.v, 0));
  const bars = items.map((it, i) => ({ ...it, from: i === 0 ? 0 : cum[i - 1], to: cum[i] }));
  const vals = [0, ...bars.flatMap((b) => [b.from, b.to])];
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const range = hi - lo || 1;

  const H = 158, padTop = 16, padBot = 30, colW = 64, barW = 30, left = 10;
  const W = Math.max(340, left * 2 + bars.length * colW);
  const y = (v: number) => padTop + (1 - (v - lo) / range) * (H - padTop - padBot);
  const zeroY = y(0);
  const colorFor = (b: { type: string; v: number }) =>
    b.type === "unknown" ? "var(--sev-crit)" : b.v < 0 ? "var(--pos)" : "var(--brand)";

  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-bg-2/40 p-2">
      <svg width={W} height={H} className="block">
        <line x1={4} x2={W - 4} y1={zeroY} y2={zeroY} stroke="var(--line-2)" strokeDasharray="3 3" />
        {bars.map((b, i) => {
          const x = left + i * colW + (colW - barW) / 2;
          const top = y(Math.max(b.from, b.to));
          const h = Math.max(2, Math.abs(y(b.from) - y(b.to)));
          const nextX = left + (i + 1) * colW + (colW - barW) / 2;
          const labelY = Math.min(y(b.from), y(b.to)) - 5;
          return (
            <g key={i}>
              <rect x={x} y={top} width={barW} height={h} rx={2} fill={colorFor(b)} opacity={0.9} />
              {i < bars.length - 1 && (
                <line x1={x + barW} x2={nextX} y1={y(b.to)} y2={y(b.to)} stroke="var(--line-2)" />
              )}
              <text x={x + barW / 2} y={labelY} textAnchor="middle" fontSize="9.5" fill="var(--ink-2)" style={{ fontVariantNumeric: "tabular-nums" }}>
                {signedD(b.v)}
              </text>
              <text x={x + barW / 2} y={H - 14} textAnchor="middle" fontSize="9" fill="var(--ink-3)">
                {b.label.length > 11 ? b.label.slice(0, 10) + "…" : b.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function DiscRow({ d }: { d: Disc }) {
  const detail = d.detail ?? {};
  const lowConf = (detail as { lowConfidence?: boolean }).lowConfidence;
  const stale = (detail as { staleRef?: boolean }).staleRef;
  const advisory = (detail as { advisory?: boolean }).advisory;
  const isUnknown = d.type === "unknown";
  return (
    <div className={`px-3 py-2.5 ${isUnknown ? "bg-red-50" : advisory ? "bg-amber-50" : ""}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[13.5px] font-medium text-ink">{TYPE_LABEL[d.type] ?? d.type}</span>
          {lowConf && <Badge variant="secondary">low confidence</Badge>}
          {stale && <Badge variant="destructive">stale baseline</Badge>}
          {advisory && <Badge variant="secondary">advisory</Badge>}
          {isUnknown && <Badge variant="destructive">unexplained</Badge>}
        </div>
        <span className={`font-mono text-[13px] ${isUnknown ? "text-red-700" : "text-ink"}`}>{signed(d.amount)}</span>
      </div>
      {d.suggestedAction && <p className="mt-0.5 text-[12px] text-ink-3">{d.suggestedAction}</p>}
      {d.type === "price_change" && Array.isArray((detail as { perModel?: unknown[] }).perModel) && (
        <p className="mt-0.5 text-[11.5px] text-ink-3">
          {((detail as { perModel: { model?: string }[] }).perModel).map((m) => m.model).filter(Boolean).join(", ")}
        </p>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-line bg-bg-2 p-2.5">
      <div className="text-[11.5px] text-ink-3">{label}</div>
      <div className={`font-mono text-[15px] font-semibold ${accent ? "text-ink" : "text-ink"}`}>{value}</div>
    </div>
  );
}
