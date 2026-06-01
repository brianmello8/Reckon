"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { fmtMoney, fmtCompact, microsToDollars } from "@/lib/reckon/format";
import { saveCommitment, deleteCommitment } from "./actions";

type Alert = { kind: string; amountAtRisk: string; date: string; message: string };
type Commitment = {
  id: string;
  provider: string;
  type: string;
  currency: string;
  amount: string;
  startDate: string;
  endDate: string;
  effectiveRate: string | null;
  notes: string | null;
  derivedStatus: "active" | "expired" | "exhausted";
  consumed: string;
  remaining: string;
  pctConsumed: number;
  projectedEndConsumed: string;
  projectedRemaining: string;
  daysRemaining: number;
  dailyRunRate: string;
  curve: { date: string; cumulativeMicros: string }[];
  alerts: Alert[];
};

const money = (m: string) => fmtMoney(microsToDollars(Number(m)));
const TYPE_LABEL: Record<string, string> = {
  committed_use: "Committed use",
  prepaid_credit: "Prepaid credit",
  enterprise_agreement: "Enterprise agreement",
};
const ALERT_VARIANT: Record<string, "default" | "secondary" | "destructive"> = {
  overage: "destructive",
  expiry: "destructive",
  under_utilization: "secondary",
};

export function CommitmentsClient({
  commitments,
  providers,
}: {
  commitments: Commitment[];
  providers: { key: string; name: string }[];
}) {
  const [showForm, setShowForm] = React.useState(false);
  const [editing, setEditing] = React.useState<Commitment | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          variant={showForm ? "ghost" : "default"}
          onClick={() => {
            setEditing(null);
            setShowForm((s) => !s);
          }}
        >
          {showForm ? "Cancel" : "Add commitment"}
        </Button>
      </div>
      {(showForm || editing) && (
        <CommitmentForm
          key={editing?.id ?? "new"}
          providers={providers}
          editing={editing}
          onDone={() => {
            setShowForm(false);
            setEditing(null);
          }}
        />
      )}
      {commitments.length === 0 ? (
        <p className="text-sm text-zinc-500">No commitments yet. Add a committed-use deal, enterprise agreement, or prepaid credit.</p>
      ) : (
        <div className="space-y-4">
          {commitments.map((c) => (
            <CommitmentCard key={c.id} c={c} onEdit={() => setEditing(c)} />
          ))}
        </div>
      )}
    </div>
  );
}

function CommitmentCard({ c, onEdit }: { c: Commitment; onEdit: () => void }) {
  const router = useRouter();
  const chart = c.curve.map((p) => ({ date: p.date.slice(5), cum: microsToDollars(Number(p.cumulativeMicros)) }));
  const amountDollars = microsToDollars(Number(c.amount));

  return (
    <div className="rounded-xl border border-line bg-paper p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[15px] font-semibold text-ink">
            {c.provider} · {TYPE_LABEL[c.type] ?? c.type}
          </div>
          <div className="text-[12.5px] text-ink-3">
            {c.startDate} → {c.endDate} · {money(c.amount)} {c.currency}
            {c.effectiveRate && (
              <> · negotiated rate {money(c.effectiveRate)}/1M units</>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={c.derivedStatus === "exhausted" ? "destructive" : c.derivedStatus === "expired" ? "secondary" : "default"}>
            {c.derivedStatus}
          </Badge>
          <Button variant="ghost" size="sm" onClick={onEdit}>Edit</Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-red-600 hover:text-red-700"
            onClick={async () => {
              if (!confirm("Delete this commitment?")) return;
              await deleteCommitment(c.id);
              toast.success("Deleted");
              router.refresh();
            }}
          >
            Delete
          </Button>
        </div>
      </div>

      {c.alerts.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {c.alerts.map((a, i) => (
            <div key={i} className="flex items-start gap-2 rounded-lg border border-line bg-bg-2 px-3 py-2">
              <Badge variant={ALERT_VARIANT[a.kind] ?? "secondary"}>{a.kind.replace(/_/g, " ")}</Badge>
              <span className="text-[13px] text-ink-2">{a.message}</span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Consumed" value={`${money(c.consumed)} (${c.pctConsumed}%)`} />
        <Stat label="Remaining" value={money(c.remaining)} />
        <Stat label="Projected end" value={money(c.projectedEndConsumed)} />
        <Stat label="Days left" value={String(c.daysRemaining)} />
      </div>

      {chart.length > 0 && (
        <div className="mt-4">
          <div className="mb-1 text-[12px] font-medium text-ink-3">Drawdown vs commitment</div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chart}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="date" fontSize={11} />
              <YAxis tickFormatter={fmtCompact} fontSize={11} width={48} />
              <Tooltip formatter={(v) => fmtMoney(Number(v))} />
              <ReferenceLine
                y={amountDollars}
                stroke="#ef4444"
                strokeDasharray="4 4"
                label={{ value: "commitment", fontSize: 10, fill: "#ef4444", position: "insideTopRight" }}
              />
              <Area dataKey="cum" name="cumulative" stroke="#6366f1" fill="#6366f133" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
      {c.notes && <p className="mt-2 text-[12px] text-ink-3">{c.notes}</p>}
    </div>
  );
}

function CommitmentForm({
  providers,
  editing,
  onDone,
}: {
  providers: { key: string; name: string }[];
  editing: Commitment | null;
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const g = (k: string) => (fd.get(k) as string) ?? "";
    setPending(true);
    try {
      await saveCommitment({
        id: editing?.id ?? "",
        provider: g("provider"),
        type: g("type") as "committed_use" | "prepaid_credit" | "enterprise_agreement",
        amount: Number(g("amount") || 0),
        currency: g("currency") || "USD",
        startDate: g("startDate"),
        endDate: g("endDate"),
        effectiveRate: g("effectiveRate") ? Number(g("effectiveRate")) : null,
        notes: g("notes"),
      });
      toast.success(editing ? "Updated" : "Created");
      onDone();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setPending(false);
    }
  }

  const ed = editing;
  const dol = (m: string | null) => (m ? String(microsToDollars(Number(m))) : "");

  return (
    <form onSubmit={onSubmit} className="grid grid-cols-2 gap-3 rounded-xl border border-line bg-paper p-4 sm:grid-cols-3">
      <Field label="Provider">
        <select name="provider" defaultValue={ed?.provider} required className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm">
          {providers.map((p) => (
            <option key={p.key} value={p.key}>{p.name}</option>
          ))}
        </select>
      </Field>
      <Field label="Type">
        <select name="type" defaultValue={ed?.type ?? "committed_use"} className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm">
          <option value="committed_use">Committed use</option>
          <option value="prepaid_credit">Prepaid credit</option>
          <option value="enterprise_agreement">Enterprise agreement</option>
        </select>
      </Field>
      <Field label="Currency"><Input name="currency" defaultValue={ed?.currency ?? "USD"} maxLength={3} /></Field>
      <Field label="Amount ($)"><Input name="amount" type="number" step="0.01" defaultValue={dol(ed?.amount ?? null)} required /></Field>
      <Field label="Start date"><Input name="startDate" type="date" defaultValue={ed?.startDate} required /></Field>
      <Field label="End date"><Input name="endDate" type="date" defaultValue={ed?.endDate} required /></Field>
      <Field label="Negotiated rate ($/1M units, optional)"><Input name="effectiveRate" type="number" step="0.0001" defaultValue={dol(ed?.effectiveRate ?? null)} /></Field>
      <Field label="Notes" wide><Input name="notes" defaultValue={ed?.notes ?? ""} /></Field>
      <div className="col-span-2 sm:col-span-3">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : editing ? "Save" : "Add commitment"}</Button>
      </div>
    </form>
  );
}

function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={`flex flex-col gap-1 text-[12px] text-ink-3 ${wide ? "col-span-2" : ""}`}>
      {label}
      {children}
    </label>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-bg-2 p-2">
      <div className="text-[11px] text-ink-3">{label}</div>
      <div className="font-mono text-[13px] text-ink">{value}</div>
    </div>
  );
}
