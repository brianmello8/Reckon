"use server";

import { requireSurface } from "@/lib/auth";
import { withOrgContext } from "@/lib/db/rls";
import {
  accruals,
  journalEntries,
  journalEntryLines,
  accountingPeriods,
  entities,
  glAccounts,
  costCenters,
} from "@/lib/db/schema";
import { and, eq, inArray, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { generateAccrual } from "@/lib/close/accrual";
import {
  generateReversal,
  generateTrueUp,
  getAccrualAccuracy,
  getLinkedEntries,
} from "@/lib/close/reversal";

export async function getAccrualsView() {
  const user = await requireSurface("finance");
  return withOrgContext(user.orgId, async (tx) => {
    const ents = new Map(
      (await tx.select({ id: entities.id, code: entities.code, name: entities.name }).from(entities).where(eq(entities.orgId, user.orgId))).map(
        (e) => [e.id, `${e.code} · ${e.name}`]
      )
    );
    const periods = await tx
      .select()
      .from(accountingPeriods)
      .where(eq(accountingPeriods.orgId, user.orgId))
      .orderBy(desc(accountingPeriods.periodStart));

    const accrualRows = await tx
      .select({
        id: accruals.id,
        periodId: accruals.periodId,
        estimatedAmount: accruals.estimatedAmount,
        tailForecastAmount: accruals.tailForecastAmount,
        methodNote: accruals.methodNote,
        status: accruals.status,
        actualAmount: accruals.actualAmount,
        varianceAmount: accruals.varianceAmount,
        journalEntryId: accruals.journalEntryId,
        jeStatus: journalEntries.status,
        approvedAt: journalEntries.approvedAt,
      })
      .from(accruals)
      .leftJoin(journalEntries, eq(journalEntries.id, accruals.journalEntryId))
      .where(eq(accruals.orgId, user.orgId));

    const glMap = new Map(
      (await tx.select({ id: glAccounts.id, code: glAccounts.code, name: glAccounts.name }).from(glAccounts).where(eq(glAccounts.orgId, user.orgId))).map(
        (g) => [g.id, `${g.code} · ${g.name}`]
      )
    );
    const ccMap = new Map(
      (await tx.select({ id: costCenters.id, code: costCenters.code, name: costCenters.name }).from(costCenters).where(eq(costCenters.orgId, user.orgId))).map(
        (c) => [c.id, `${c.code} · ${c.name}`]
      )
    );

    const jeIds = accrualRows.map((a) => a.journalEntryId).filter((x): x is string => !!x);
    const lines = jeIds.length
      ? await tx
          .select()
          .from(journalEntryLines)
          .where(and(eq(journalEntryLines.orgId, user.orgId), inArray(journalEntryLines.journalEntryId, jeIds)))
      : [];
    const linesByJe = new Map<string, typeof lines>();
    for (const l of lines) {
      (linesByJe.get(l.journalEntryId) ?? linesByJe.set(l.journalEntryId, []).get(l.journalEntryId)!).push(l);
    }

    const accrualByPeriod = new Map(accrualRows.map((a) => [a.periodId, a]));

    // Linked reversal / true-up entries (traceable to each accrual JE).
    const linked = await getLinkedEntries(user.orgId, jeIds);
    const linkedBySource = new Map<string, { type: string; status: string }>();
    for (const e of linked) {
      if (e.sourceJournalEntryId) linkedBySource.set(`${e.sourceJournalEntryId}:${e.type}`, { type: e.type, status: e.status });
    }
    const accuracy = await getAccrualAccuracy(user.orgId);

    return {
      accuracy,
      periods: periods.map((p) => ({
        id: p.id,
        label: p.entityId ? ents.get(p.entityId) ?? "Entity" : "Org-wide",
        periodStart: p.periodStart,
        periodEnd: p.periodEnd,
        status: p.status,
        hasAccrual: accrualByPeriod.has(p.id),
      })),
      accruals: accrualRows.map((a) => {
        const ls = (a.journalEntryId ? linesByJe.get(a.journalEntryId) : []) ?? [];
        const totalDebit = ls.reduce((s, l) => s + l.debit, 0n);
        const totalCredit = ls.reduce((s, l) => s + l.credit, 0n);
        return {
          id: a.id,
          periodId: a.periodId,
          estimated: a.estimatedAmount.toString(),
          tail: a.tailForecastAmount.toString(),
          methodNote: a.methodNote,
          status: a.status,
          actual: a.actualAmount != null ? a.actualAmount.toString() : null,
          variance: a.varianceAmount != null ? a.varianceAmount.toString() : null,
          reversalStatus: a.journalEntryId ? linkedBySource.get(`${a.journalEntryId}:reversal`)?.status ?? null : null,
          trueUpStatus: a.journalEntryId ? linkedBySource.get(`${a.journalEntryId}:true_up`)?.status ?? null : null,
          journalEntryId: a.journalEntryId,
          jeStatus: a.jeStatus ?? "draft",
          approvedAt: a.approvedAt ? a.approvedAt.toISOString() : null,
          balanced: totalDebit === totalCredit,
          totalDebit: totalDebit.toString(),
          totalCredit: totalCredit.toString(),
          lines: ls.map((l) => ({
            label: l.glAccountId ? glMap.get(l.glAccountId) ?? "—" : "(accrued liability / uncoded)",
            costCenter: l.costCenterId ? ccMap.get(l.costCenterId) ?? "—" : "—",
            debit: l.debit.toString(),
            credit: l.credit.toString(),
          })),
        };
      }),
    };
  });
}

export async function generateAccrualAction(periodId: string) {
  const user = await requireSurface("finance");
  const today = new Date().toISOString().slice(0, 10);
  await generateAccrual(user.orgId, periodId, today);
  revalidatePath("/finance/accruals");
  return { success: true };
}

/** Human approval — the ONLY way an accrual JE becomes approved. Never automated. */
export async function approveAccrualJE(journalEntryId: string) {
  const user = await requireSurface("finance");
  const updated = await withOrgContext(user.orgId, async (tx) =>
    tx
      .update(journalEntries)
      .set({ status: "approved", approvedByUserId: user.userId, approvedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(journalEntries.id, journalEntryId),
          eq(journalEntries.orgId, user.orgId),
          eq(journalEntries.status, "draft")
        )
      )
      .returning({ id: journalEntries.id })
  );
  if (updated.length === 0) throw new Error("Only a draft entry can be approved.");
  revalidatePath("/finance/accruals");
  return { success: true };
}

export async function generateReversalAction(accrualId: string) {
  const user = await requireSurface("finance");
  await generateReversal(user.orgId, accrualId);
  revalidatePath("/finance/accruals");
  return { success: true };
}

export async function generateTrueUpAction(accrualId: string) {
  const user = await requireSurface("finance");
  await generateTrueUp(user.orgId, accrualId);
  revalidatePath("/finance/accruals");
  return { success: true };
}
