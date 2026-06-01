import { db } from "@/lib/db/client";
import {
  providerInvoices,
  invoiceLineItems,
  usageEvents,
  providers,
  reconciliations,
  reconciliationDiscrepancies,
} from "@/lib/db/schema";
import { and, eq, between, sql } from "drizzle-orm";
import { resolveRateAsOf } from "@/lib/invoices/rates";

/**
 * Invoice ↔ usage reconciliation (Phase 10.2, architecture §5a).
 *
 * RESIDUAL-BASED classification: each bucket is sized from its OWN evidence and
 * subtracted from `remaining`, so no later bucket can re-claim a dollar an
 * earlier one explained, and a first match never absorbs the whole delta. The
 * delta-decomposing buckets sum EXACTLY to delta; `missing_credit` is ADVISORY
 * (owed-but-absent isn't part of billed − observed) and flagged separately.
 * An honest `unknown` always beats a forced explanation.
 */

const PER_MILLION = 1_000_000n;
const babs = (x: bigint) => (x < 0n ? -x : x);

export type ReconLine = {
  model: string | null;
  quantity: bigint | null;
  unit: string | null;
  amount: bigint;
  observedCost: bigint; // observed usage cost for this line's model in the period
  expectedRate: { rate: bigint; effectiveFrom: string } | null; // per 1M units, as-of period
};

export type ReconInput = {
  currency: string;
  billedTotal: bigint;
  creditsApplied: bigint;
  tax: bigint;
  expectedCredits: bigint | null; // null = unknown → skip missing-credit check
  rateCheckable: boolean;
  periodStart: string;
  periodEnd: string;
  observedTotal: bigint;
  observedByModel: Map<string, bigint>;
  lines: ReconLine[];
};

export type Discrepancy = {
  type:
    | "untracked_keys"
    | "credits"
    | "missing_credit"
    | "tax"
    | "fx"
    | "price_change"
    | "rounding"
    | "unknown";
  amount: bigint;
  detail: Record<string, unknown>;
  suggestedAction: string | null;
};

export type ReconResult = {
  delta: bigint;
  discrepancies: Discrepancy[];
  rateRefAsOf: string | null;
  hasUnknown: boolean;
};

/** Pure classifier — no I/O, so it's exhaustively unit-testable. */
export function computeReconciliation(input: ReconInput): ReconResult {
  const delta = input.billedTotal - input.observedTotal;

  // fx is a precondition: we never convert. A currency mismatch makes the whole
  // comparison an fx discrepancy (documented order deviation — see §5a).
  if (input.currency.toUpperCase() !== "USD") {
    return {
      delta,
      rateRefAsOf: null,
      hasUnknown: false,
      discrepancies: [
        {
          type: "fx",
          amount: delta,
          detail: {
            invoiceCurrency: input.currency,
            observedCurrency: "USD",
            note: "Billed currency differs from observed (USD); not converted.",
          },
          suggestedAction: "Normalize currency before reconciling — we do not auto-convert.",
        },
      ],
    };
  }

  const discrepancies: Discrepancy[] = [];
  let remaining = delta;
  const add = (d: Discrepancy) => {
    discrepancies.push(d);
    remaining -= d.amount; // residual subtraction — no double-claim
  };

  // tax — billed includes tax that observed usage doesn't.
  if (input.tax !== 0n) {
    add({ type: "tax", amount: input.tax, detail: { tax: input.tax.toString() }, suggestedAction: "Account for tax separately from spend." });
  }

  // credits applied — a landed credit lowered billed below usage.
  if (input.creditsApplied !== 0n) {
    add({
      type: "credits",
      amount: -input.creditsApplied,
      detail: { creditsApplied: input.creditsApplied.toString() },
      suggestedAction: "Confirm the applied credit matches what was expected.",
    });
  }

  // untracked_keys — billed for models we observe nothing for (a blind spot).
  const untrackedModels: string[] = [];
  let untracked = 0n;
  for (const l of input.lines) {
    if (l.model && (input.observedByModel.get(l.model) ?? 0n) === 0n) {
      untracked += l.amount;
      untrackedModels.push(l.model);
    }
  }
  if (untracked !== 0n) {
    add({
      type: "untracked_keys",
      amount: untracked,
      detail: { models: untrackedModels, note: "Billed for usage we don't ingest." },
      suggestedAction: "Connect/track the missing provider key(s) for these models.",
    });
  }

  // price_change — per observed rate-checkable line: billed rate vs expected.
  let rateRefAsOf: string | null = null;
  if (input.rateCheckable) {
    let priceChange = 0n;
    const perModel: Record<string, unknown>[] = [];
    let staleRef = false;
    let missingBaseline = false;
    for (const l of input.lines) {
      if (!l.model || l.quantity == null || l.quantity <= 0n) continue;
      if ((input.observedByModel.get(l.model) ?? 0n) === 0n) continue; // untracked, handled above
      if (!l.expectedRate) {
        missingBaseline = true;
        perModel.push({ model: l.model, unit: l.unit, baseline: "MISSING", note: "no rate snapshot covers this period" });
        continue;
      }
      if (!rateRefAsOf || l.expectedRate.effectiveFrom < rateRefAsOf) rateRefAsOf = l.expectedRate.effectiveFrom;
      if (l.expectedRate.effectiveFrom < input.periodStart) staleRef = true; // baseline predates period
      const expectedCost = (l.expectedRate.rate * l.quantity) / PER_MILLION;
      const impact = l.amount - expectedCost;
      if (impact !== 0n) {
        priceChange += impact;
        perModel.push({
          model: l.model,
          unit: l.unit,
          billed: l.amount.toString(),
          expectedCost: expectedCost.toString(),
          impact: impact.toString(),
          effectiveFrom: l.expectedRate.effectiveFrom,
        });
      }
    }
    if (priceChange !== 0n) {
      const lowConfidence = staleRef || missingBaseline;
      add({
        type: "price_change",
        amount: priceChange,
        detail: { perModel, lowConfidence, staleRef, missingBaseline, rateRefAsOf },
        suggestedAction: staleRef
          ? "Verify against current published rates — baseline may be stale (low confidence)."
          : "Verify the pricing change with the provider.",
      });
    } else if (missingBaseline) {
      // No price impact computed but a baseline was missing — record it (not in conservation).
      // (Handled via the unknown bucket's detail below if a residual remains.)
    }
  }

  // rounding — only a residual within the explicit threshold may be rounding.
  const threshold = input.billedTotal / 1000n > PER_MILLION ? input.billedTotal / 1000n : PER_MILLION; // max($1, 0.1% billed)
  if (remaining !== 0n && babs(remaining) <= threshold) {
    add({
      type: "rounding",
      amount: remaining,
      detail: { thresholdMicros: threshold.toString() },
      suggestedAction: null,
    });
  }

  // unknown — whatever's left, never minimized.
  if (remaining !== 0n) {
    add({
      type: "unknown",
      amount: remaining,
      detail: {
        note: "Unexplained delta — investigate before accepting.",
        priceChangeUncomputable: !input.rateCheckable ? true : undefined,
      },
      suggestedAction: "Investigate; do not accept until explained.",
    });
  }

  // missing_credit — ADVISORY (owed-but-absent; not part of billed−observed,
  // so excluded from the conservation sum). expectedCredits null → skipped.
  if (input.expectedCredits != null) {
    const shortfall = input.expectedCredits - input.creditsApplied;
    if (shortfall > 0n) {
      discrepancies.push({
        type: "missing_credit",
        amount: shortfall,
        detail: {
          advisory: true,
          expectedCredits: input.expectedCredits.toString(),
          creditsApplied: input.creditsApplied.toString(),
          shortfall: shortfall.toString(),
          note: "A credit we were promised did not appear on the invoice.",
        },
        suggestedAction: "Dispute / follow up with the provider for the missing credit.",
      });
    }
  }

  const hasUnknown = discrepancies.some((d) => d.type === "unknown" && d.amount !== 0n);
  return { delta, discrepancies, rateRefAsOf, hasUnknown };
}

/** Conservation invariant: non-advisory discrepancies sum exactly to delta. */
export function conservationSum(discrepancies: Discrepancy[]): bigint {
  return discrepancies
    .filter((d) => !(d.detail as { advisory?: boolean })?.advisory)
    .reduce((a, d) => a + d.amount, 0n);
}

/** Gather inputs, classify, and persist. Explicit (user-initiated) compute —
 * may overwrite open/explained. Late-usage auto-refresh is in refreshReconciliation. */
export async function reconcileInvoice(orgId: string, invoiceId: string) {
  const [invoice] = await db
    .select()
    .from(providerInvoices)
    .where(and(eq(providerInvoices.orgId, orgId), eq(providerInvoices.id, invoiceId)))
    .limit(1);
  if (!invoice) throw new Error("Invoice not found.");

  const [prov] = await db
    .select({ id: providers.id })
    .from(providers)
    .where(eq(providers.key, invoice.provider))
    .limit(1);

  const periodStart = invoice.billingPeriodStart;
  const periodEnd = invoice.billingPeriodEnd;

  // Observed usage for the period — by PROVIDER USAGE TIMESTAMP (time_bucket),
  // not ingest time. observed_through watermark = latest ingest (updatedAt).
  const observedByModel = new Map<string, bigint>();
  let observedTotal = 0n;
  let observedThrough: Date | null = null;
  if (prov) {
    const rows = await db
      .select({
        model: usageEvents.model,
        cost: sql<string>`coalesce(sum(${usageEvents.costUsdMicros}), 0)`,
        maxUpdated: sql<string | null>`max(${usageEvents.updatedAt})`,
      })
      .from(usageEvents)
      .where(
        and(
          eq(usageEvents.orgId, orgId),
          eq(usageEvents.providerId, prov.id),
          between(usageEvents.timeBucket, periodStart, periodEnd)
        )
      )
      .groupBy(usageEvents.model);
    for (const r of rows) {
      const c = BigInt(r.cost);
      observedByModel.set(r.model, c);
      observedTotal += c;
      if (r.maxUpdated) {
        const d = new Date(r.maxUpdated);
        if (!observedThrough || d > observedThrough) observedThrough = d;
      }
    }
  }

  const lineRows = await db
    .select()
    .from(invoiceLineItems)
    .where(and(eq(invoiceLineItems.orgId, orgId), eq(invoiceLineItems.invoiceId, invoiceId)));

  const lines: ReconLine[] = [];
  for (const l of lineRows) {
    let expectedRate: { rate: bigint; effectiveFrom: string } | null = null;
    if (l.model && l.unit && (observedByModel.get(l.model) ?? 0n) > 0n) {
      const r = await resolveRateAsOf(orgId, invoice.provider, l.model, l.unit, periodStart);
      if (r) expectedRate = { rate: r.rate, effectiveFrom: r.effectiveFrom };
    }
    lines.push({
      model: l.model,
      quantity: l.quantity ?? null,
      unit: l.unit,
      amount: l.amount,
      observedCost: l.model ? observedByModel.get(l.model) ?? 0n : 0n,
      expectedRate,
    });
  }

  const result = computeReconciliation({
    currency: invoice.currency,
    billedTotal: invoice.total,
    creditsApplied: invoice.creditsApplied,
    tax: invoice.tax,
    expectedCredits: invoice.expectedCredits,
    rateCheckable: invoice.rateCheckable,
    periodStart,
    periodEnd,
    observedTotal,
    observedByModel,
    lines,
  });

  const status: "open" | "explained" = result.hasUnknown ? "open" : "explained";
  const now = new Date();

  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: reconciliations.id })
      .from(reconciliations)
      .where(and(eq(reconciliations.orgId, orgId), eq(reconciliations.invoiceId, invoiceId)))
      .limit(1);
    let reconId: string;
    const fields = {
      periodStart,
      periodEnd,
      billedTotal: invoice.total,
      observedTotal,
      delta: result.delta,
      status,
      observedThrough,
      rateRefAsOf: result.rateRefAsOf,
      computedAt: now,
    };
    if (existing) {
      await tx.update(reconciliations).set(fields).where(eq(reconciliations.id, existing.id));
      reconId = existing.id;
      await tx
        .delete(reconciliationDiscrepancies)
        .where(eq(reconciliationDiscrepancies.reconciliationId, reconId));
    } else {
      const [row] = await tx
        .insert(reconciliations)
        .values({ orgId, invoiceId, ...fields })
        .returning({ id: reconciliations.id });
      reconId = row.id;
    }
    if (result.discrepancies.length > 0) {
      await tx.insert(reconciliationDiscrepancies).values(
        result.discrepancies.map((d) => ({
          orgId,
          reconciliationId: reconId,
          type: d.type,
          amount: d.amount,
          detail: d.detail,
          suggestedAction: d.suggestedAction,
        }))
      );
    }
    return reconId;
  });

  return result;
}

/**
 * Late-usage handler. If in-period usage was ingested after computed_at:
 * open/explained → recompute in place; accepted/disputed → mark STALE for human
 * re-review (never silently overwrite a financial conclusion); stale stays stale.
 */
export async function refreshReconciliation(orgId: string, reconciliationId: string) {
  const [recon] = await db
    .select()
    .from(reconciliations)
    .where(and(eq(reconciliations.orgId, orgId), eq(reconciliations.id, reconciliationId)))
    .limit(1);
  if (!recon) throw new Error("Reconciliation not found.");

  const [prov] = await db
    .select({ id: providers.id })
    .from(providers)
    .where(
      eq(
        providers.key,
        (
          await db
            .select({ p: providerInvoices.provider })
            .from(providerInvoices)
            .where(eq(providerInvoices.id, recon.invoiceId))
            .limit(1)
        )[0]?.p ?? ""
      )
    )
    .limit(1);

  let latestIngest: Date | null = null;
  if (prov) {
    const [row] = await db
      .select({ maxUpdated: sql<string | null>`max(${usageEvents.updatedAt})` })
      .from(usageEvents)
      .where(
        and(
          eq(usageEvents.orgId, orgId),
          eq(usageEvents.providerId, prov.id),
          between(usageEvents.timeBucket, recon.periodStart, recon.periodEnd)
        )
      );
    latestIngest = row?.maxUpdated ? new Date(row.maxUpdated) : null;
  }

  const outOfDate = latestIngest != null && latestIngest > recon.computedAt;
  if (!outOfDate) return { status: recon.status, changed: false };

  if (recon.status === "open" || recon.status === "explained") {
    await reconcileInvoice(orgId, recon.invoiceId);
    return { status: "recomputed", changed: true };
  }
  if (recon.status === "accepted" || recon.status === "disputed") {
    await db
      .update(reconciliations)
      .set({ status: "stale" })
      .where(eq(reconciliations.id, reconciliationId));
    return { status: "stale", changed: true };
  }
  return { status: recon.status, changed: false };
}
