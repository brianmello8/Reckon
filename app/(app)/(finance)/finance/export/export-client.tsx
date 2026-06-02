"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  generateBatchAction,
  supersedeBatchAction,
  acknowledgeBatchAction,
  downloadBatchAction,
} from "./actions";
import type { TargetFormat } from "@/lib/export";

type Period = {
  id: string;
  label: string;
  status: string;
  approvedCount: number;
  exportedCount: number;
  notExportedCount: number;
  notExported: { id: string; type: string; memo: string | null }[];
};
type Batch = {
  id: string;
  periodId: string;
  targetFormat: string;
  externalBatchId: string;
  contentHash: string;
  status: string;
  jeCount: number;
  lockOverrideReason: string | null;
  supersedeReason: string | null;
  generatedAt: string;
  downloadedAt: string | null;
  acknowledgedAt: string | null;
};
type View = { periods: Period[]; batches: Batch[] };

// Only generic_csv is implemented in 13.1; ERP templates arrive in 13.2.
const FORMATS: { key: TargetFormat; label: string; ready: boolean }[] = [
  { key: "generic_csv", label: "Generic CSV", ready: true },
  { key: "qbo_iif", label: "QuickBooks IIF (13.2)", ready: false },
  { key: "netsuite_csv", label: "NetSuite CSV (13.2)", ready: false },
  { key: "intacct_csv", label: "Intacct CSV (13.2)", ready: false },
  { key: "xero_csv", label: "Xero CSV (13.2)", ready: false },
  { key: "spend_splits_csv", label: "Spend splits CSV (13.2)", ready: false },
];

const statusVariant: Record<string, "default" | "secondary" | "destructive"> = {
  generated: "secondary",
  downloaded: "default",
  acknowledged: "default",
  superseded: "destructive",
  open: "default",
  closed: "secondary",
  locked: "destructive",
};

function triggerDownload(file: { filename: string; mimetype: string; body: string }) {
  const blob = new Blob([file.body], { type: file.mimetype });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function ExportClient({ view }: { view: View }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [format, setFormat] = React.useState<Record<string, TargetFormat>>({});

  async function generate(
    periodId: string,
    opts: { confirmSupersede?: boolean; lockOverrideReason?: string } = {}
  ) {
    const targetFormat = format[periodId] ?? "generic_csv";
    setBusy(periodId);
    try {
      const res = await generateBatchAction({ periodId, targetFormat, ...opts });
      if (res.status === "ok") {
        const file = await downloadBatchAction(res.batchId);
        triggerDownload(file);
        toast.success(`Generated ${res.externalBatchId} (hash ${res.contentHash.slice(0, 8)}…) — downloaded`);
        router.refresh();
      } else if (res.status === "empty") {
        toast.error("No approved entries to export in this period.");
      } else if (res.status === "lock_required") {
        const reason = window.prompt(
          `Period ${res.periodLabel} is LOCKED. Enter a reason to override and export anyway:`
        );
        if (reason?.trim()) await generate(periodId, { ...opts, lockOverrideReason: reason.trim() });
      } else if (res.status === "guard") {
        const downloaded = res.conflicts.find((c) => c.downloadedAt);
        const warn = downloaded
          ? `\n\n⚠ Batch ${downloaded.externalBatchId} was DOWNLOADED on ${new Date(
              downloaded.downloadedAt!
            ).toLocaleString()}. Superseding assumes it was NOT imported — a supersede plus re-import can double-book on your side.`
          : "";
        const ok = window.confirm(
          `These approved entries are already in ${res.conflicts.length} active batch(es): ${res.conflicts
            .map((c) => c.externalBatchId)
            .join(", ")}.\n\nSupersede them and regenerate?${warn}`
        );
        if (ok) await generate(periodId, { ...opts, confirmSupersede: true });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

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

  const batchesByPeriod = new Map<string, Batch[]>();
  for (const b of view.batches) (batchesByPeriod.get(b.periodId) ?? batchesByPeriod.set(b.periodId, []).get(b.periodId)!).push(b);

  if (view.periods.length === 0) {
    return <p className="text-sm text-ink-3">No accounting periods yet. Create one on the Periods page, approve some journal entries, then export here.</p>;
  }

  return (
    <div className="space-y-4">
      {view.periods.map((p) => (
        <div key={p.id} className="rounded-xl border border-line bg-paper p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-semibold text-ink">{p.label}</div>
              <div className="mt-0.5 flex items-center gap-2 text-[12.5px] text-ink-3">
                <Badge variant={statusVariant[p.status] ?? "secondary"}>{p.status}</Badge>
                <span>{p.approvedCount} approved · {p.exportedCount} exported</span>
                {p.notExportedCount > 0 && (
                  <span className="font-medium text-ink">{p.notExportedCount} not yet exported</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <select
                className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                value={format[p.id] ?? "generic_csv"}
                onChange={(e) => setFormat((f) => ({ ...f, [p.id]: e.target.value as TargetFormat }))}
              >
                {FORMATS.map((f) => (
                  <option key={f.key} value={f.key} disabled={!f.ready}>{f.label}</option>
                ))}
              </select>
              <Button size="sm" disabled={busy === p.id || p.approvedCount === 0} onClick={() => generate(p.id)}>
                Generate &amp; download
              </Button>
            </div>
          </div>

          {p.notExportedCount > 0 && (
            <details className="mt-2 text-[12.5px] text-ink-2">
              <summary className="cursor-pointer text-ink-3">{p.notExportedCount} approved {p.notExportedCount === 1 ? "entry" : "entries"} not yet exported</summary>
              <ul className="mt-1 list-disc pl-5 text-ink-3">
                {p.notExported.map((j) => (
                  <li key={j.id}>{j.type} — {j.memo ?? j.id.slice(0, 8)}</li>
                ))}
              </ul>
            </details>
          )}

          {/* Batch history for this period */}
          {(batchesByPeriod.get(p.id) ?? []).length > 0 && (
            <div className="mt-3 overflow-hidden rounded-lg border border-line">
              <table className="w-full text-[13px]">
                <thead className="bg-bg-2 text-left text-[12px] text-ink-3">
                  <tr>
                    <th className="px-3 py-1.5 font-medium">Batch</th>
                    <th className="px-3 py-1.5 font-medium">Format</th>
                    <th className="px-3 py-1.5 text-right font-medium">JEs</th>
                    <th className="px-3 py-1.5 font-medium">Hash</th>
                    <th className="px-3 py-1.5 font-medium">Status</th>
                    <th className="px-3 py-1.5 font-medium">Timeline</th>
                    <th className="px-3 py-1.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {(batchesByPeriod.get(p.id) ?? []).map((b) => (
                    <tr key={b.id} className="border-t border-line align-top">
                      <td className="px-3 py-1.5 font-mono text-[11.5px] text-ink-2">
                        {b.externalBatchId}
                        {b.lockOverrideReason && <div className="text-[11px] text-amber-600">lock override: {b.lockOverrideReason}</div>}
                        {b.supersedeReason && <div className="text-[11px] text-ink-3">superseded: {b.supersedeReason}</div>}
                      </td>
                      <td className="px-3 py-1.5 text-ink-3">{b.targetFormat}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-ink-2">{b.jeCount}</td>
                      <td className="px-3 py-1.5 font-mono text-[11.5px] text-ink-3">{b.contentHash}…</td>
                      <td className="px-3 py-1.5"><Badge variant={statusVariant[b.status] ?? "secondary"}>{b.status}</Badge></td>
                      <td className="px-3 py-1.5 text-[11.5px] text-ink-3">
                        <div>gen {new Date(b.generatedAt).toLocaleString()}</div>
                        {b.downloadedAt && <div>dl {new Date(b.downloadedAt).toLocaleString()}</div>}
                        {b.acknowledgedAt && <div>ack {new Date(b.acknowledgedAt).toLocaleString()}</div>}
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        {b.status !== "superseded" && (
                          <div className="flex flex-col items-end gap-1">
                            <button className="text-[12px] text-ink-3 hover:text-ink" disabled={busy === b.id}
                              onClick={() => run(b.id, async () => triggerDownload(await downloadBatchAction(b.id)), "Downloaded")}>
                              download
                            </button>
                            {b.status !== "acknowledged" && (
                              <button className="text-[12px] text-ink-3 hover:text-ink" disabled={busy === b.id}
                                onClick={() => run(b.id, () => acknowledgeBatchAction(b.id), "Marked imported")}>
                                mark imported
                              </button>
                            )}
                            <button className="text-[12px] text-ink-3 hover:text-red-500" disabled={busy === b.id}
                              onClick={() => {
                                const warn = b.downloadedAt
                                  ? `\n\n⚠ This batch was downloaded on ${new Date(b.downloadedAt).toLocaleString()}; superseding assumes it was NOT imported.`
                                  : "";
                                const reason = window.prompt(`Reason for superseding ${b.externalBatchId}?${warn}`);
                                if (reason?.trim()) run(b.id, () => supersedeBatchAction(b.id, reason.trim()), "Superseded");
                              }}>
                              supersede
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
