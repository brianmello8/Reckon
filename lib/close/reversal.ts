import { db } from "@/lib/db/client";
import {
  accruals,
  accountingPeriods,
  journalEntries,
  journalEntryLines,
  providerInvoices,
  reconciliations,
} from "@/lib/db/schema";
import { and, eq, gt, isNull, sql, asc, desc, inArray } from "drizzle-orm";
import { distribute } from "@/lib/finance/allocate";

/**
 * Accrual close loop (Phase 11.3, architecture §5f). Draft-first; nothing posts
 * externally. Every reversal/true-up links back to its accrual JE
 * (`source_journal_entry_id`) — never orphaned. A reversal exactly offsets the
 * accrual; a true-up books the reconciled variance by the same dimensions; and
 * accrual-vs-actual accuracy is tracked as auditor evidence.
 */

const usd = (m: bigint) => `$${(Number(m) / 1_000_000).toFixed(2)}`;

type JeLine = {
  glAccountId: string | null;
  costCenterId: string | null;
  entityId: string | null;
  projectId?: string | null;
  debit: bigint;
  credit: bigint;
};

/** Pure: a reversal swaps debit ↔ credit of every accrual line, so the reversal
 * combined with the accrual nets to exactly zero on every dimension. */
export function buildReversalLines(accrualLines: JeLine[]): JeLine[] {
  return accrualLines.map((l) => ({
    glAccountId: l.glAccountId,
    costCenterId: l.costCenterId,
    entityId: l.entityId,
    projectId: l.projectId ?? null,
    debit: l.credit,
    credit: l.debit,
  }));
}

/** Pure: book the variance (actual − accrual) across the accrual's expense lines
 * pro-rata, sign-aware, with one balancing accrued-liability line. variance > 0
 * → under-accrued → more expense (debit); < 0 → over-accrued → reverse. */
export function buildTrueUpLines(
  expenseLines: JeLine[],
  liabGl: string | null,
  variance: bigint
): { lines: JeLine[]; balanced: boolean } {
  const lines: JeLine[] = [];
  const amt = variance < 0n ? -variance : variance;
  if (amt > 0n && expenseLines.length > 0) {
    const split = distribute(
      expenseLines.map((l, i) => ({ key: String(i), weight: Number(l.debit) })),
      Number(amt),
      null
    );
    expenseLines.forEach((l, i) => {
      const share = BigInt(split.get(String(i)) ?? 0);
      if (share === 0n) return;
      lines.push({
        glAccountId: l.glAccountId,
        costCenterId: l.costCenterId,
        entityId: l.entityId,
        debit: variance > 0n ? share : 0n,
        credit: variance > 0n ? 0n : share,
      });
    });
    lines.push({
      glAccountId: liabGl,
      costCenterId: null,
      entityId: null,
      debit: variance > 0n ? 0n : amt,
      credit: variance > 0n ? amt : 0n,
    });
  }
  const totalDebit = lines.reduce((a, l) => a + l.debit, 0n);
  const totalCredit = lines.reduce((a, l) => a + l.credit, 0n);
  return { lines, balanced: totalDebit === totalCredit };
}

async function loadAccrual(orgId: string, accrualId: string) {
  const [a] = await db
    .select()
    .from(accruals)
    .where(and(eq(accruals.id, accrualId), eq(accruals.orgId, orgId)))
    .limit(1);
  if (!a) throw new Error("Accrual not found.");
  if (!a.journalEntryId) throw new Error("Accrual has no journal entry.");
  const [period] = await db
    .select()
    .from(accountingPeriods)
    .where(eq(accountingPeriods.id, a.periodId))
    .limit(1);
  const lines = await db
    .select()
    .from(journalEntryLines)
    .where(eq(journalEntryLines.journalEntryId, a.journalEntryId));
  return { accrual: a, period, jeId: a.journalEntryId, lines };
}

/** Replace a prior draft for an idempotency key, or block if it's been approved. */
async function prepareIdempotent(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  orgId: string,
  key: string,
  label: string
) {
  const [existing] = await tx
    .select({ id: journalEntries.id, status: journalEntries.status })
    .from(journalEntries)
    .where(and(eq(journalEntries.orgId, orgId), eq(journalEntries.idempotencyKey, key)))
    .limit(1);
  if (existing && existing.status !== "draft") {
    throw new Error(`An ${existing.status} ${label} already exists — regenerate is blocked.`);
  }
  if (existing) {
    await tx.delete(journalEntryLines).where(eq(journalEntryLines.journalEntryId, existing.id));
    await tx.delete(journalEntries).where(eq(journalEntries.id, existing.id));
  }
}

/** Draft reversing JE booked in the next period — exactly offsets the accrual. */
export async function generateReversal(orgId: string, accrualId: string) {
  const { accrual, period, jeId, lines } = await loadAccrual(orgId, accrualId);
  if (!period) throw new Error("Accrual period not found.");

  // Next period for the same scope (entity), starting after this period ends.
  const [next] = await db
    .select({ id: accountingPeriods.id })
    .from(accountingPeriods)
    .where(
      and(
        eq(accountingPeriods.orgId, orgId),
        period.entityId ? eq(accountingPeriods.entityId, period.entityId) : isNull(accountingPeriods.entityId),
        gt(accountingPeriods.periodStart, period.periodEnd)
      )
    )
    .orderBy(asc(accountingPeriods.periodStart))
    .limit(1);
  if (!next) throw new Error("Create the next accounting period before reversing.");

  const key = `reversal:${jeId}`;
  return db.transaction(async (tx) => {
    await prepareIdempotent(tx, orgId, key, "reversal");
    const [je] = await tx
      .insert(journalEntries)
      .values({
        orgId,
        periodId: next.id,
        type: "reversal",
        status: "draft",
        idempotencyKey: key,
        sourceJournalEntryId: jeId,
        memo: `Reversal of accrual ${period.periodStart}…${period.periodEnd}`,
      })
      .returning({ id: journalEntries.id });
    // Exactly offset: swap debit ↔ credit of every accrual line.
    const reversalLines = buildReversalLines(lines);
    if (reversalLines.length > 0) {
      await tx.insert(journalEntryLines).values(
        reversalLines.map((l) => ({ orgId, journalEntryId: je.id, ...l }))
      );
    }
    return { reversalJournalEntryId: je.id, reversalPeriodId: next.id };
  });
}

/** Draft true-up JE booking the reconciled variance (actual − accrual) by the
 * accrual's dimensions. Requires a reconciled actual invoice for the period. */
export async function generateTrueUp(orgId: string, accrualId: string) {
  const { accrual, period, jeId, lines } = await loadAccrual(orgId, accrualId);
  if (!period) throw new Error("Accrual period not found.");

  // Actual = total of reconciled invoices whose billing month matches the period.
  const month = period.periodStart.slice(0, 7);
  const invRows = await db
    .select({ total: providerInvoices.total })
    .from(providerInvoices)
    .innerJoin(reconciliations, eq(reconciliations.invoiceId, providerInvoices.id))
    .where(
      and(
        eq(providerInvoices.orgId, orgId),
        sql`substring(${providerInvoices.billingPeriodStart}::text, 1, 7) = ${month}`
      )
    );
  if (invRows.length === 0) {
    throw new Error("Reconcile the actual invoice for this period before truing up.");
  }
  const actual = invRows.reduce((a, r) => a + r.total, 0n);
  const variance = actual - accrual.estimatedAmount;

  // Expense lines from the accrual (the debit side) + the accrued-liability gl.
  const expense = lines.filter((l) => l.debit > 0n);
  const liabGl = lines.find((l) => l.credit > 0n)?.glAccountId ?? null;

  const { lines: trueUpLines, balanced } = buildTrueUpLines(expense, liabGl, variance);
  if (!balanced) throw new Error("Refusing to write an unbalanced true-up.");

  const key = `true_up:${jeId}`;
  return db.transaction(async (tx) => {
    await prepareIdempotent(tx, orgId, key, "true-up");
    const [je] = await tx
      .insert(journalEntries)
      .values({
        orgId,
        periodId: accrual.periodId,
        type: "true_up",
        status: "draft",
        idempotencyKey: key,
        sourceJournalEntryId: jeId,
        memo: `True-up: actual ${usd(actual)} − accrual ${usd(accrual.estimatedAmount)} = variance ${usd(variance)}`,
      })
      .returning({ id: journalEntries.id });
    if (trueUpLines.length > 0) {
      await tx.insert(journalEntryLines).values(trueUpLines.map((l) => ({ orgId, journalEntryId: je.id, ...l })));
    }
    await tx
      .update(accruals)
      .set({ actualAmount: actual, varianceAmount: variance, status: "trued_up", updatedAt: new Date() })
      .where(eq(accruals.id, accrualId));
    return { trueUpJournalEntryId: je.id, actual, variance };
  });
}

/** Per-period accrual-vs-actual accuracy (auditor evidence). */
export async function getAccrualAccuracy(orgId: string) {
  const rows = await db
    .select({
      periodStart: accountingPeriods.periodStart,
      periodEnd: accountingPeriods.periodEnd,
      estimated: accruals.estimatedAmount,
      actual: accruals.actualAmount,
      variance: accruals.varianceAmount,
    })
    .from(accruals)
    .innerJoin(accountingPeriods, eq(accountingPeriods.id, accruals.periodId))
    .where(eq(accruals.orgId, orgId))
    .orderBy(desc(accountingPeriods.periodStart));

  const out = rows
    .filter((r) => r.actual != null && r.actual !== 0n)
    .map((r) => ({
      period: `${r.periodStart}…${r.periodEnd}`,
      estimated: r.estimated.toString(),
      actual: r.actual!.toString(),
      variance: (r.variance ?? 0n).toString(),
      errorPct: Math.round((Math.abs(Number(r.variance ?? 0n)) / Number(r.actual!)) * 1000) / 10,
    }));

  const summary =
    out.length > 0
      ? `AI accrual within ±${Math.max(...out.map((r) => r.errorPct))}% across ${out.length} period${out.length > 1 ? "s" : ""}`
      : null;
  return { rows: out, summary };
}

/** All JEs linked to an accrual's JE (its reversal + true-up), for the history view. */
export async function getLinkedEntries(orgId: string, accrualJeIds: string[]) {
  if (accrualJeIds.length === 0) return [];
  return db
    .select({
      id: journalEntries.id,
      type: journalEntries.type,
      status: journalEntries.status,
      periodId: journalEntries.periodId,
      sourceJournalEntryId: journalEntries.sourceJournalEntryId,
    })
    .from(journalEntries)
    .where(and(eq(journalEntries.orgId, orgId), inArray(journalEntries.sourceJournalEntryId, accrualJeIds)));
}
