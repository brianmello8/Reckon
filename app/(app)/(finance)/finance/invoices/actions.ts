"use server";

import { requireSurface } from "@/lib/auth";
import { withOrgContext } from "@/lib/db/rls";
import { providerInvoices, invoiceLineItems } from "@/lib/db/schema";
import { and, eq, desc } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { upsertInvoice } from "@/lib/invoices/ingest";

function toMicros(dollars: number): bigint {
  return BigInt(Math.round(dollars * 1_000_000));
}

export async function getInvoices() {
  const user = await requireSurface("finance");
  return withOrgContext(user.orgId, async (tx) =>
    tx
      .select()
      .from(providerInvoices)
      .where(eq(providerInvoices.orgId, user.orgId))
      .orderBy(desc(providerInvoices.billingPeriodStart))
  );
}

export async function getInvoiceLineItems(invoiceId: string) {
  const user = await requireSurface("finance");
  const rows = await withOrgContext(user.orgId, async (tx) =>
    tx
      .select()
      .from(invoiceLineItems)
      .where(
        and(
          eq(invoiceLineItems.orgId, user.orgId),
          eq(invoiceLineItems.invoiceId, invoiceId)
        )
      )
  );
  // Stringify bigint columns — a server action's return is serialized to the
  // client, and BigInt is not serializable across that boundary.
  return rows.map((r) => ({
    id: r.id,
    description: r.description,
    model: r.model,
    quantity: r.quantity != null ? r.quantity.toString() : null,
    unit: r.unit,
    amount: r.amount.toString(),
  }));
}

const lineSchema = z.object({
  description: z.string().min(1),
  model: z.string().optional().or(z.literal("")),
  quantity: z.coerce.number().optional(),
  unit: z.string().optional().or(z.literal("")),
  amount: z.coerce.number(),
});

const invoiceSchema = z.object({
  provider: z.string().min(1),
  invoiceNumber: z.string().min(1),
  billingPeriodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  billingPeriodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  currency: z.string().length(3),
  subtotal: z.coerce.number(),
  creditsApplied: z.coerce.number(),
  // null/"" = unknown (kept NULL, never coerced to 0); a value = promised credit.
  expectedCredits: z.union([z.coerce.number(), z.null()]).optional(),
  tax: z.coerce.number(),
  total: z.coerce.number(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  paymentTerms: z.string().optional().or(z.literal("")),
  pdfFileRef: z.string().optional().or(z.literal("")),
  lineItems: z.array(lineSchema),
});

export async function saveManualInvoice(input: z.input<typeof invoiceSchema>) {
  const user = await requireSurface("finance");
  const p = invoiceSchema.parse(input);

  const hasExpected = p.expectedCredits !== null && p.expectedCredits !== undefined;
  const today = new Date().toISOString().slice(0, 10);

  await upsertInvoice(
    user.orgId,
    {
      provider: p.provider,
      invoiceNumber: p.invoiceNumber,
      billingPeriodStart: p.billingPeriodStart,
      billingPeriodEnd: p.billingPeriodEnd,
      currency: p.currency.toUpperCase(),
      subtotal: toMicros(p.subtotal),
      creditsApplied: toMicros(p.creditsApplied),
      // Distinct from credits_applied; NULL when the controller didn't enter one.
      expectedCredits: hasExpected ? toMicros(p.expectedCredits as number) : null,
      expectedCreditsSource: hasExpected ? "manual" : "none",
      tax: toMicros(p.tax),
      total: toMicros(p.total),
      dueDate: p.dueDate || null,
      paymentTerms: p.paymentTerms || null,
      source: "manual",
      pdfFileRef: p.pdfFileRef || null,
      raw: { enteredVia: "manual_ui" },
      lineItems: p.lineItems.map((l) => ({
        description: l.description,
        model: l.model || null,
        quantity: l.quantity != null && !Number.isNaN(l.quantity) ? BigInt(Math.round(l.quantity)) : null,
        unit: l.unit || null,
        amount: toMicros(l.amount),
      })),
    },
    today
  );

  revalidatePath("/finance/invoices");
  return { success: true };
}

export async function setInvoiceStatus(id: string, status: "draft" | "confirmed") {
  const user = await requireSurface("finance");
  await withOrgContext(user.orgId, async (tx) =>
    tx
      .update(providerInvoices)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(providerInvoices.id, id), eq(providerInvoices.orgId, user.orgId)))
  );
  revalidatePath("/finance/invoices");
  return { success: true };
}

export async function deleteInvoice(id: string) {
  const user = await requireSurface("finance");
  await withOrgContext(user.orgId, async (tx) => {
    await tx
      .delete(invoiceLineItems)
      .where(and(eq(invoiceLineItems.orgId, user.orgId), eq(invoiceLineItems.invoiceId, id)));
    await tx
      .delete(providerInvoices)
      .where(and(eq(providerInvoices.id, id), eq(providerInvoices.orgId, user.orgId)));
  });
  revalidatePath("/finance/invoices");
  return { success: true };
}
