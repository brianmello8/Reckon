"use server";

import { requireSurface } from "@/lib/auth";
import { withOrgContext } from "@/lib/db/rls";
import {
  reconciliations,
  reconciliationDiscrepancies,
  providerInvoices,
} from "@/lib/db/schema";
import { and, eq, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { reconcileInvoice, refreshReconciliation } from "@/lib/reconciliation/reconcile";

export async function getReconcilableInvoices() {
  const user = await requireSurface("finance");
  return withOrgContext(user.orgId, async (tx) => {
    const invoices = await tx
      .select({
        id: providerInvoices.id,
        provider: providerInvoices.provider,
        invoiceNumber: providerInvoices.invoiceNumber,
        total: providerInvoices.total,
        currency: providerInvoices.currency,
        status: providerInvoices.status,
        rateCheckable: providerInvoices.rateCheckable,
      })
      .from(providerInvoices)
      .where(eq(providerInvoices.orgId, user.orgId))
      .orderBy(desc(providerInvoices.billingPeriodStart));
    const recons = await tx
      .select({ invoiceId: reconciliations.invoiceId })
      .from(reconciliations)
      .where(eq(reconciliations.orgId, user.orgId));
    const reconciled = new Set(recons.map((r) => r.invoiceId));
    return invoices.map((i) => ({
      ...i,
      total: i.total.toString(),
      reconciled: reconciled.has(i.id),
    }));
  });
}

export async function getReconciliations() {
  const user = await requireSurface("finance");
  return withOrgContext(user.orgId, async (tx) => {
    const recons = await tx
      .select({
        id: reconciliations.id,
        invoiceId: reconciliations.invoiceId,
        provider: providerInvoices.provider,
        invoiceNumber: providerInvoices.invoiceNumber,
        periodStart: reconciliations.periodStart,
        periodEnd: reconciliations.periodEnd,
        billedTotal: reconciliations.billedTotal,
        observedTotal: reconciliations.observedTotal,
        delta: reconciliations.delta,
        status: reconciliations.status,
        observedThrough: reconciliations.observedThrough,
        rateRefAsOf: reconciliations.rateRefAsOf,
        computedAt: reconciliations.computedAt,
      })
      .from(reconciliations)
      .innerJoin(providerInvoices, eq(providerInvoices.id, reconciliations.invoiceId))
      .where(eq(reconciliations.orgId, user.orgId))
      .orderBy(desc(reconciliations.computedAt));

    const discs = await tx
      .select()
      .from(reconciliationDiscrepancies)
      .where(eq(reconciliationDiscrepancies.orgId, user.orgId));
    const byRecon = new Map<string, typeof discs>();
    for (const d of discs) {
      (byRecon.get(d.reconciliationId) ?? byRecon.set(d.reconciliationId, []).get(d.reconciliationId)!).push(d);
    }

    return recons.map((r) => ({
      ...r,
      billedTotal: r.billedTotal.toString(),
      observedTotal: r.observedTotal.toString(),
      delta: r.delta.toString(),
      observedThrough: r.observedThrough ? r.observedThrough.toISOString() : null,
      computedAt: r.computedAt.toISOString(),
      discrepancies: (byRecon.get(r.id) ?? [])
        .map((d) => ({
          id: d.id,
          type: d.type,
          amount: d.amount.toString(),
          detail: d.detail as Record<string, unknown> | null,
          suggestedAction: d.suggestedAction,
        }))
        .sort((a, b) => Math.abs(Number(b.amount)) - Math.abs(Number(a.amount))),
    }));
  });
}

export async function runReconcileAction(invoiceId: string) {
  const user = await requireSurface("finance");
  await reconcileInvoice(user.orgId, invoiceId);
  revalidatePath("/finance/reconciliation");
  return { success: true };
}

export async function refreshReconAction(reconciliationId: string) {
  const user = await requireSurface("finance");
  const res = await refreshReconciliation(user.orgId, reconciliationId);
  revalidatePath("/finance/reconciliation");
  return res;
}

export async function setReconStatus(
  reconciliationId: string,
  status: "explained" | "accepted" | "disputed" | "open"
) {
  const user = await requireSurface("finance");
  await withOrgContext(user.orgId, async (tx) =>
    tx
      .update(reconciliations)
      .set({ status })
      .where(and(eq(reconciliations.id, reconciliationId), eq(reconciliations.orgId, user.orgId)))
  );
  revalidatePath("/finance/reconciliation");
  return { success: true };
}
