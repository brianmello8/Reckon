"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { fmtMoney, microsToDollars } from "@/lib/reckon/format";
import {
  saveManualInvoice,
  setInvoiceStatus,
  deleteInvoice,
  getInvoiceLineItems,
} from "./actions";

type Invoice = {
  id: string;
  provider: string;
  invoiceNumber: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  currency: string;
  subtotal: string;
  creditsApplied: string;
  expectedCredits: string | null;
  expectedCreditsSource: string;
  tax: string;
  total: string;
  status: "draft" | "confirmed";
  source: string;
  rateCheckable: boolean;
};
type Line = { description: string; model: string; quantity: string; unit: string; amount: string };

const money = (m: string | number) => fmtMoney(microsToDollars(Number(m)));

export function InvoicesClient({
  providers,
  invoices,
}: {
  providers: { key: string; name: string }[];
  invoices: Invoice[];
}) {
  const [showForm, setShowForm] = React.useState(false);
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant={showForm ? "ghost" : "default"} onClick={() => setShowForm((s) => !s)}>
          {showForm ? "Cancel" : "Add invoice"}
        </Button>
      </div>
      {showForm && <InvoiceForm providers={providers} onDone={() => setShowForm(false)} />}
      <InvoiceList invoices={invoices} />
    </div>
  );
}

function InvoiceForm({
  providers,
  onDone,
}: {
  providers: { key: string; name: string }[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [lines, setLines] = React.useState<Line[]>([
    { description: "", model: "", quantity: "", unit: "tokens", amount: "" },
  ]);
  const [expectedUnknown, setExpectedUnknown] = React.useState(true);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const g = (k: string) => (fd.get(k) as string) ?? "";
    setPending(true);
    try {
      await saveManualInvoice({
        provider: g("provider"),
        invoiceNumber: g("invoiceNumber"),
        billingPeriodStart: g("billingPeriodStart"),
        billingPeriodEnd: g("billingPeriodEnd"),
        currency: g("currency") || "USD",
        subtotal: Number(g("subtotal") || 0),
        creditsApplied: Number(g("creditsApplied") || 0),
        // Blank = unknown (NULL), never coerced to 0.
        expectedCredits: expectedUnknown ? null : Number(g("expectedCredits") || 0),
        tax: Number(g("tax") || 0),
        total: Number(g("total") || 0),
        dueDate: g("dueDate"),
        paymentTerms: g("paymentTerms"),
        pdfFileRef: g("pdfFileRef"),
        lineItems: lines
          .filter((l) => l.description.trim())
          .map((l) => ({
            description: l.description,
            model: l.model,
            quantity: l.quantity ? Number(l.quantity) : undefined,
            unit: l.unit,
            amount: Number(l.amount || 0),
          })),
      });
      toast.success("Invoice saved (draft)");
      onDone();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setPending(false);
    }
  }

  const setLine = (i: number, k: keyof Line, v: string) =>
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, [k]: v } : l)));

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-line bg-paper p-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label="Provider">
          <select name="provider" required className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm">
            {providers.map((p) => (
              <option key={p.key} value={p.key}>{p.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Invoice number"><Input name="invoiceNumber" required /></Field>
        <Field label="Currency"><Input name="currency" defaultValue="USD" maxLength={3} /></Field>
        <Field label="Period start"><Input name="billingPeriodStart" type="date" required /></Field>
        <Field label="Period end"><Input name="billingPeriodEnd" type="date" required /></Field>
        <Field label="Due date"><Input name="dueDate" type="date" /></Field>
        <Field label="Subtotal ($)"><Input name="subtotal" type="number" step="0.01" /></Field>
        <Field label="Credits applied ($)"><Input name="creditsApplied" type="number" step="0.01" /></Field>
        <Field label="Tax ($)"><Input name="tax" type="number" step="0.01" /></Field>
        <Field label="Total ($)"><Input name="total" type="number" step="0.01" required /></Field>
        <Field label="Payment terms"><Input name="paymentTerms" placeholder="Net 30" /></Field>
        <Field label="PDF reference"><Input name="pdfFileRef" placeholder="storage path / URL" /></Field>
      </div>

      <div className="rounded-lg border border-line bg-bg-2 p-3">
        <label className="flex items-center gap-2 text-sm text-ink-2">
          <input type="checkbox" checked={expectedUnknown} onChange={(e) => setExpectedUnknown(e.target.checked)} className="h-4 w-4 accent-ink" />
          Expected credits unknown (leave NULL — not the same as $0)
        </label>
        {!expectedUnknown && (
          <div className="mt-2">
            <Field label="Expected credits promised this period ($)">
              <Input name="expectedCredits" type="number" step="0.01" />
            </Field>
          </div>
        )}
        <p className="mt-1.5 text-[12px] text-ink-3">
          What you were <em>promised</em> (e.g. a committed credit) — distinct from what the invoice
          shows applied. Reconciliation uses this to flag an owed-but-missing credit. Blank = unknown.
        </p>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[13px] font-semibold text-ink">Line items</span>
          <Button type="button" variant="ghost" size="sm" onClick={() => setLines((ls) => [...ls, { description: "", model: "", quantity: "", unit: "tokens", amount: "" }])}>
            + Add line
          </Button>
        </div>
        <p className="mb-2 text-[12px] text-ink-3">
          Include model + quantity + amount for a line to be rate-checkable. A lump-sum invoice
          (no per-model breakdown) is captured and flagged as not rate-checkable.
        </p>
        <div className="space-y-2">
          {lines.map((l, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <Input placeholder="Description" value={l.description} onChange={(e) => setLine(i, "description", e.target.value)} className="w-48" />
              <Input placeholder="Model (optional)" value={l.model} onChange={(e) => setLine(i, "model", e.target.value)} className="w-40" />
              <Input placeholder="Qty" type="number" value={l.quantity} onChange={(e) => setLine(i, "quantity", e.target.value)} className="w-28" />
              <Input placeholder="Unit" value={l.unit} onChange={(e) => setLine(i, "unit", e.target.value)} className="w-24" />
              <Input placeholder="Amount $" type="number" step="0.01" value={l.amount} onChange={(e) => setLine(i, "amount", e.target.value)} className="w-28" />
              {lines.length > 1 && (
                <button type="button" onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))} className="text-sm text-red-600">
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save invoice"}</Button>
    </form>
  );
}

function InvoiceList({ invoices }: { invoices: Invoice[] }) {
  if (invoices.length === 0) {
    return <p className="py-6 text-sm text-zinc-500">No invoices yet. Add one above (manual), or connect a provider billing API.</p>;
  }
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-paper">
      <table className="w-full text-sm">
        <thead className="border-b border-line bg-bg-2 text-left text-[12px] text-ink-3">
          <tr>
            <th className="px-4 py-2 font-medium">Provider</th>
            <th className="px-4 py-2 font-medium">Invoice</th>
            <th className="px-4 py-2 font-medium">Period</th>
            <th className="px-4 py-2 text-right font-medium">Total</th>
            <th className="px-4 py-2 font-medium">Status</th>
            <th className="px-4 py-2 font-medium">Rate-checkable</th>
            <th className="px-4 py-2" />
          </tr>
        </thead>
        <tbody>
          {invoices.map((inv) => (
            <InvoiceRow key={inv.id} inv={inv} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InvoiceRow({ inv }: { inv: Invoice }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [lines, setLines] = React.useState<Awaited<ReturnType<typeof getInvoiceLineItems>> | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && lines === null) {
      try {
        setLines(await getInvoiceLineItems(inv.id));
      } catch {
        setLines([]);
      }
    }
  }

  return (
    <>
      <tr className="cursor-pointer border-b border-line last:border-0 hover:bg-bg-2" onClick={toggle}>
        <td className="px-4 py-2.5 text-ink">{inv.provider}</td>
        <td className="px-4 py-2.5 font-mono text-[12.5px] text-ink-2">{inv.invoiceNumber}</td>
        <td className="px-4 py-2.5 text-ink-2">{inv.billingPeriodStart} → {inv.billingPeriodEnd}</td>
        <td className="px-4 py-2.5 text-right font-mono text-ink">{money(inv.total)} {inv.currency}</td>
        <td className="px-4 py-2.5">
          <Badge variant={inv.status === "confirmed" ? "default" : "secondary"}>{inv.status}</Badge>
          <span className="ml-1 text-[11px] text-ink-3">{inv.source}</span>
        </td>
        <td className="px-4 py-2.5">
          <Badge variant={inv.rateCheckable ? "default" : "secondary"}>{inv.rateCheckable ? "yes" : "lump-sum"}</Badge>
        </td>
        <td className="px-4 py-2.5 text-right text-ink-3">{open ? "▲" : "▼"}</td>
      </tr>
      {open && (
        <tr className="bg-bg-2/40">
          <td colSpan={7} className="px-4 py-3">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Subtotal" value={`${money(inv.subtotal)}`} />
              <Stat label="Credits applied" value={`${money(inv.creditsApplied)}`} />
              <Stat
                label="Expected credits"
                value={inv.expectedCredits === null ? "unknown" : money(inv.expectedCredits)}
                hint={inv.expectedCredits === null ? "not entered" : inv.expectedCreditsSource}
              />
              <Stat label="Tax" value={`${money(inv.tax)}`} />
            </div>

            <div className="mt-3 rounded-lg border border-line bg-paper">
              <table className="w-full text-[13px]">
                <thead className="text-left text-[12px] text-ink-3">
                  <tr>
                    <th className="px-3 py-1.5 font-medium">Description</th>
                    <th className="px-3 py-1.5 font-medium">Model</th>
                    <th className="px-3 py-1.5 font-medium">Qty</th>
                    <th className="px-3 py-1.5 font-medium">Unit</th>
                    <th className="px-3 py-1.5 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {(lines ?? []).map((l) => (
                    <tr key={l.id} className="border-t border-line">
                      <td className="px-3 py-1.5 text-ink-2">{l.description}</td>
                      <td className="px-3 py-1.5 text-ink-2">{l.model ?? "—"}</td>
                      <td className="px-3 py-1.5 font-mono text-ink-2">{l.quantity != null ? String(l.quantity) : "—"}</td>
                      <td className="px-3 py-1.5 text-ink-2">{l.unit ?? "—"}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-ink-2">{money(Number(l.amount))}</td>
                    </tr>
                  ))}
                  {lines !== null && lines.length === 0 && (
                    <tr><td colSpan={5} className="px-3 py-2 text-ink-3">No line items (lump-sum).</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await setInvoiceStatus(inv.id, inv.status === "confirmed" ? "draft" : "confirmed");
                    toast.success(inv.status === "confirmed" ? "Reverted to draft" : "Confirmed");
                    router.refresh();
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {inv.status === "confirmed" ? "Revert to draft" : "Confirm"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                className="text-red-600 hover:text-red-700"
                onClick={async () => {
                  if (!confirm("Delete this invoice?")) return;
                  setBusy(true);
                  try {
                    await deleteInvoice(inv.id);
                    toast.success("Deleted");
                    router.refresh();
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Delete
              </Button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-[12px] text-ink-3">
      {label}
      {children}
    </label>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-line bg-paper p-2.5">
      <div className="text-[11.5px] text-ink-3">{label}</div>
      <div className="font-mono text-[14px] text-ink">{value}</div>
      {hint && <div className="text-[11px] text-ink-3">{hint}</div>}
    </div>
  );
}
