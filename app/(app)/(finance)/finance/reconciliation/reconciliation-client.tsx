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

      <div className="mt-3">
        <div className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-ink-3">Waterfall</div>
        {r.discrepancies.length === 0 ? (
          <p className="text-sm text-emerald-600">Exact match — no delta to explain. ✓</p>
        ) : (
          <div className="divide-y divide-line rounded-lg border border-line">
            {r.discrepancies.map((d) => (
              <DiscRow key={d.id} d={d} />
            ))}
          </div>
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
