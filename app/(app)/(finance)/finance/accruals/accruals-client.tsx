"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fmtMoney, microsToDollars } from "@/lib/reckon/format";
import { generateAccrualAction, approveAccrualJE } from "./actions";

type Line = { label: string; costCenter: string; debit: string; credit: string };
type Accrual = {
  id: string;
  periodId: string;
  estimated: string;
  tail: string;
  methodNote: string;
  status: string;
  journalEntryId: string | null;
  jeStatus: string;
  approvedAt: string | null;
  balanced: boolean;
  totalDebit: string;
  totalCredit: string;
  lines: Line[];
};
type Period = {
  id: string;
  label: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  hasAccrual: boolean;
};

const money = (m: string) => fmtMoney(microsToDollars(Number(m)));

export function AccrualsClient({ view }: { view: { periods: Period[]; accruals: Accrual[] } }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const accrualByPeriod = new Map(view.accruals.map((a) => [a.periodId, a]));

  async function run(id: string, fn: () => Promise<unknown>, ok: string) {
    setBusy(id);
    try {
      await fn();
      toast.success(ok);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  if (view.periods.length === 0) {
    return <p className="text-sm text-zinc-500">No accounting periods yet. Create one on the Periods page first.</p>;
  }

  return (
    <div className="space-y-4">
      {view.periods.map((p) => {
        const a = accrualByPeriod.get(p.id);
        return (
          <div key={p.id} className="rounded-xl border border-line bg-paper p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-semibold text-ink">
                  {p.label} · {p.periodStart} → {p.periodEnd}
                </div>
                <div className="text-[12.5px] text-ink-3">period {p.status}</div>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={busy === p.id || a?.jeStatus !== "draft" && !!a}
                title={a && a.jeStatus !== "draft" ? "Approved — regenerate is blocked" : ""}
                onClick={() => run(p.id, () => generateAccrualAction(p.id), a ? "Regenerated" : "Accrual generated")}
              >
                {a ? "Regenerate" : "Generate accrual"}
              </Button>
            </div>

            {a && (
              <div className="mt-3 space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <Stat label="Estimated" value={money(a.estimated)} />
                  <Stat label="Forecast tail" value={money(a.tail)} />
                  <Badge variant={a.jeStatus === "approved" ? "default" : "secondary"}>JE {a.jeStatus}</Badge>
                  <Badge variant={a.balanced ? "default" : "destructive"}>
                    {a.balanced ? "balanced" : "UNBALANCED"}
                  </Badge>
                  {a.approvedAt && (
                    <span className="text-[12px] text-ink-3">approved {new Date(a.approvedAt).toLocaleString()}</span>
                  )}
                </div>

                <div className="overflow-hidden rounded-lg border border-line">
                  <table className="w-full text-[13px]">
                    <thead className="bg-bg-2 text-left text-[12px] text-ink-3">
                      <tr>
                        <th className="px-3 py-1.5 font-medium">GL account</th>
                        <th className="px-3 py-1.5 font-medium">Cost center</th>
                        <th className="px-3 py-1.5 text-right font-medium">Debit</th>
                        <th className="px-3 py-1.5 text-right font-medium">Credit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {a.lines.map((l, i) => (
                        <tr key={i} className="border-t border-line">
                          <td className="px-3 py-1.5 text-ink-2">{l.label}</td>
                          <td className="px-3 py-1.5 text-ink-2">{l.costCenter}</td>
                          <td className="px-3 py-1.5 text-right font-mono text-ink-2">{Number(l.debit) > 0 ? money(l.debit) : ""}</td>
                          <td className="px-3 py-1.5 text-right font-mono text-ink-2">{Number(l.credit) > 0 ? money(l.credit) : ""}</td>
                        </tr>
                      ))}
                      <tr className="border-t border-line bg-bg-2 font-medium">
                        <td className="px-3 py-1.5" colSpan={2}>Total</td>
                        <td className="px-3 py-1.5 text-right font-mono text-ink">{money(a.totalDebit)}</td>
                        <td className="px-3 py-1.5 text-right font-mono text-ink">{money(a.totalCredit)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <details className="text-[12.5px] text-ink-2">
                  <summary className="cursor-pointer font-medium text-ink">Method note (audit evidence)</summary>
                  <pre className="mt-1 whitespace-pre-wrap font-sans text-[12.5px] text-ink-3">{a.methodNote}</pre>
                </details>

                {a.journalEntryId && a.jeStatus === "draft" && (
                  <Button
                    size="sm"
                    disabled={busy === p.id || !a.balanced}
                    onClick={() => run(p.id, () => approveAccrualJE(a.journalEntryId!), "Approved")}
                  >
                    Approve (internal)
                  </Button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-bg-2 px-3 py-1.5">
      <div className="text-[11px] text-ink-3">{label}</div>
      <div className="font-mono text-[14px] font-semibold text-ink">{value}</div>
    </div>
  );
}
