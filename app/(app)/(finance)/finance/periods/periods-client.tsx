"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { fmtMoney, microsToDollars } from "@/lib/reckon/format";
import { savePeriod, setPeriodStatus, deletePeriod, setReportingTimezone } from "./actions";

type Period = {
  id: string;
  entityId: string | null;
  entityName: string;
  periodStart: string;
  periodEnd: string;
  status: "open" | "closed" | "locked";
  closedAt: string | null;
  tz: string;
  observedMicros: string;
  eventCount: number;
};
type View = {
  orgReportingTz: string | null;
  digestTz: string;
  entities: { id: string; label: string; tz: string | null }[];
  periods: Period[];
};

const money = (m: string) => fmtMoney(microsToDollars(Number(m)));
const statusVariant = { open: "default", closed: "secondary", locked: "destructive" } as const;

export function PeriodsClient({ view }: { view: View }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function act(fn: () => Promise<unknown>, ok: string) {
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
  }

  async function createPeriod(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await act(
      () =>
        savePeriod({
          entityId: (fd.get("entityId") as string) || "",
          periodStart: fd.get("periodStart") as string,
          periodEnd: fd.get("periodEnd") as string,
        }),
      "Period created"
    );
  }

  return (
    <div className="space-y-5">
      {/* Reporting timezone settings — the cutoff source. */}
      <div className="rounded-xl border border-line bg-paper p-4">
        <h2 className="text-[14px] font-semibold text-ink">Reporting timezone</h2>
        <p className="mt-1 text-[12.5px] text-ink-3">
          Cutoff uses entity TZ → org TZ → digest TZ ({view.digestTz}). Blank = fall back.
        </p>
        <div className="mt-3 space-y-2">
          <TzRow
            label="Organization"
            defaultValue={view.orgReportingTz ?? ""}
            placeholder={`falls back to ${view.digestTz}`}
            onSave={(tz) => act(() => setReportingTimezone("org", tz), "Org timezone saved")}
            busy={busy}
          />
          {view.entities.map((e) => (
            <TzRow
              key={e.id}
              label={e.label}
              defaultValue={e.tz ?? ""}
              placeholder="falls back to org"
              onSave={(tz) => act(() => setReportingTimezone(e.id, tz), "Entity timezone saved")}
              busy={busy}
            />
          ))}
        </div>
      </div>

      {/* Create a period. */}
      <form onSubmit={createPeriod} className="flex flex-wrap items-end gap-3 rounded-xl border border-line bg-paper p-4">
        <label className="flex flex-col gap-1 text-[12px] text-ink-3">
          Scope
          <select name="entityId" className="h-9 w-44 rounded-md border border-input bg-transparent px-2 text-sm">
            <option value="">Org-wide</option>
            {view.entities.map((e) => (
              <option key={e.id} value={e.id}>{e.label}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-ink-3">
          Start<Input name="periodStart" type="date" required className="w-40" />
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-ink-3">
          End<Input name="periodEnd" type="date" required className="w-40" />
        </label>
        <Button type="submit" disabled={busy}>Add period</Button>
      </form>

      {view.periods.length === 0 ? (
        <p className="text-sm text-zinc-500">No periods yet. Add one above.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-paper">
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-bg-2 text-left text-[12px] text-ink-3">
              <tr>
                <th className="px-4 py-2 font-medium">Scope</th>
                <th className="px-4 py-2 font-medium">Period</th>
                <th className="px-4 py-2 font-medium">TZ</th>
                <th className="px-4 py-2 text-right font-medium">Observed</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {view.periods.map((p) => (
                <tr key={p.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-2.5 text-ink">{p.entityName}</td>
                  <td className="px-4 py-2.5 text-ink-2">{p.periodStart} → {p.periodEnd}</td>
                  <td className="px-4 py-2.5 text-[12px] text-ink-3">{p.tz}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-ink-2">
                    {money(p.observedMicros)}
                    <span className="text-ink-3"> · {p.eventCount}d</span>
                  </td>
                  <td className="px-4 py-2.5"><Badge variant={statusVariant[p.status]}>{p.status}</Badge></td>
                  <td className="px-4 py-2.5 text-right">
                    {p.status === "open" && (
                      <Button variant="ghost" size="sm" disabled={busy} onClick={() => act(() => setPeriodStatus(p.id, "closed"), "Closed")}>Close</Button>
                    )}
                    {p.status === "closed" && (
                      <>
                        <Button variant="ghost" size="sm" disabled={busy} onClick={() => act(() => setPeriodStatus(p.id, "open"), "Reopened")}>Reopen</Button>
                        <Button variant="ghost" size="sm" disabled={busy} onClick={() => act(() => setPeriodStatus(p.id, "locked"), "Locked")}>Lock</Button>
                      </>
                    )}
                    {p.status === "locked" && (
                      <Button variant="ghost" size="sm" disabled={busy} onClick={() => act(() => setPeriodStatus(p.id, "closed"), "Unlocked")}>Unlock</Button>
                    )}
                    <Button variant="ghost" size="sm" disabled={busy} className="text-red-600 hover:text-red-700" onClick={() => { if (confirm("Delete period?")) act(() => deletePeriod(p.id), "Deleted"); }}>Delete</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TzRow({
  label,
  defaultValue,
  placeholder,
  onSave,
  busy,
}: {
  label: string;
  defaultValue: string;
  placeholder: string;
  onSave: (tz: string) => void;
  busy: boolean;
}) {
  const [val, setVal] = React.useState(defaultValue);
  return (
    <div className="flex items-center gap-2">
      <span className="w-44 text-[13px] text-ink-2">{label}</span>
      <Input value={val} onChange={(e) => setVal(e.target.value)} placeholder={placeholder} className="w-56 font-mono text-[12.5px]" />
      <Button variant="outline" size="sm" disabled={busy} onClick={() => onSave(val)}>Save</Button>
    </div>
  );
}
