import { db } from "@/lib/db/client";
import { providerInvoices, invoiceLineItems } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { captureRatesNow } from "./rates";

/**
 * Invoice upsert (Phase 10.1). Idempotent on (org, provider, invoice_number):
 * re-syncing updates the financial fields but **preserves** a human-set
 * `confirmed` status (billing-API invoices land as draft for review; we never
 * auto-confirm or silently revert a confirmation). Line items are replaced.
 * `rate_checkable` is derived (≥1 line with model + quantity + amount). Captures
 * a current rate snapshot so future reconciliations have a baseline.
 */
export type InvoiceLineInput = {
  description: string;
  model?: string | null;
  quantity?: bigint | null;
  unit?: string | null;
  amount: bigint;
};

export type InvoiceInput = {
  provider: string;
  invoiceNumber: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  currency: string;
  subtotal: bigint;
  creditsApplied: bigint;
  expectedCredits: bigint | null; // NULL = unknown — never coerce to 0
  expectedCreditsSource: "none" | "manual" | "commitment";
  tax: bigint;
  total: bigint;
  dueDate?: string | null;
  paymentTerms?: string | null;
  source: "manual" | "billing_api" | "ocr";
  pdfFileRef?: string | null;
  raw?: unknown;
  lineItems: InvoiceLineInput[];
};

function isRateCheckable(lines: InvoiceLineInput[]): boolean {
  return lines.some(
    (l) => !!l.model && l.quantity != null && l.quantity > 0n && l.amount != null
  );
}

export async function upsertInvoice(
  orgId: string,
  input: InvoiceInput,
  today: string
): Promise<{ id: string; created: boolean }> {
  const rateCheckable = isRateCheckable(input.lineItems);

  const result = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: providerInvoices.id })
      .from(providerInvoices)
      .where(
        and(
          eq(providerInvoices.orgId, orgId),
          eq(providerInvoices.provider, input.provider),
          eq(providerInvoices.invoiceNumber, input.invoiceNumber)
        )
      )
      .limit(1);

    const fields = {
      billingPeriodStart: input.billingPeriodStart,
      billingPeriodEnd: input.billingPeriodEnd,
      currency: input.currency,
      subtotal: input.subtotal,
      creditsApplied: input.creditsApplied,
      expectedCredits: input.expectedCredits, // may be null — preserved as null
      expectedCreditsSource: input.expectedCreditsSource,
      tax: input.tax,
      total: input.total,
      dueDate: input.dueDate ?? null,
      paymentTerms: input.paymentTerms ?? null,
      source: input.source,
      rateCheckable,
      pdfFileRef: input.pdfFileRef ?? null,
      raw: (input.raw ?? null) as Record<string, unknown> | null,
      updatedAt: new Date(),
    };

    let id: string;
    let created: boolean;
    if (existing) {
      // Preserve human-set status (don't revert a confirmation on re-sync).
      await tx
        .update(providerInvoices)
        .set(fields)
        .where(eq(providerInvoices.id, existing.id));
      id = existing.id;
      created = false;
    } else {
      const [row] = await tx
        .insert(providerInvoices)
        .values({
          orgId,
          provider: input.provider,
          invoiceNumber: input.invoiceNumber,
          status: "draft",
          ...fields,
        })
        .returning({ id: providerInvoices.id });
      id = row.id;
      created = true;
    }

    // Replace line items.
    await tx.delete(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, id));
    if (input.lineItems.length > 0) {
      await tx.insert(invoiceLineItems).values(
        input.lineItems.map((l) => ({
          orgId,
          invoiceId: id,
          description: l.description,
          model: l.model ?? null,
          quantity: l.quantity ?? null,
          unit: l.unit ?? null,
          amount: l.amount,
        }))
      );
    }
    return { id, created };
  });

  // Establish a rate baseline going forward (observation-dated, not backdated).
  await captureRatesNow(orgId, today);
  return result;
}
