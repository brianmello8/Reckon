import { db } from "@/lib/db/client";
import {
  accountingPeriods,
  organizations,
  usageEvents,
  costAllocations,
  providers,
  journalEntries,
  journalEntryLines,
  accruals,
} from "@/lib/db/schema";
import { and, eq, between, sql } from "drizzle-orm";
import { getReportingTimezone, usageBucketRange } from "./cutoff";
import { distribute } from "@/lib/finance/allocate";
import { forecastNextInvoice } from "@/lib/forecast/forecast";

/**
 * Month-end accrual (Phase 11.2, architecture §5e). Sums the period's coded
 * usage (cost_allocations, tz-correct period) split by GL × cost center, adds
 * the not-yet-reported forecast tail, and produces a BALANCED draft journal
 * entry (expense debits by CC/GL, one accrued-liability credit). DRAFT-first:
 * nothing posts externally, and nothing is auto-approved — approval is a human
 * action in the UI. idempotency_key prevents a duplicate accrual per period.
 */

type ObservedLine = {
  glAccountId: string | null;
  costCenterId: string | null;
  entityId: string | null;
  micros: bigint;
};
export type DraftLine = {
  glAccountId: string | null;
  costCenterId: string | null;
  entityId: string | null;
  debit: bigint;
  credit: bigint;
};

/** Pure: build balanced JE lines from the observed split + the forecast tail. */
export function buildAccrualLines(
  observed: ObservedLine[],
  tailMicros: bigint,
  accruedLiabilityGlAccountId: string | null
): { lines: DraftLine[]; estimated: bigint; balanced: boolean } {
  const observedTotal = observed.reduce((a, o) => a + o.micros, 0n);
  const estimated = observedTotal + tailMicros;

  const debits: DraftLine[] = [];
  if (observed.length === 0) {
    // No coded usage — the whole accrual (tail only) is one uncoded debit.
    if (estimated > 0n)
      debits.push({ glAccountId: null, costCenterId: null, entityId: null, debit: estimated, credit: 0n });
  } else {
    // Split the tail across the observed (gl,cc) lines by their share
    // (largest-remainder → sums to exactly tailMicros), so the tail carries the
    // same coding as observed usage.
    const tailByKey =
      tailMicros > 0n
        ? distribute(
            observed.map((o, i) => ({ key: String(i), weight: Number(o.micros) })),
            Number(tailMicros),
            null
          )
        : new Map<string, number>();
    observed.forEach((o, i) => {
      const tailShare = BigInt(tailByKey.get(String(i)) ?? 0);
      const debit = o.micros + tailShare;
      if (debit > 0n)
        debits.push({ glAccountId: o.glAccountId, costCenterId: o.costCenterId, entityId: o.entityId, debit, credit: 0n });
    });
  }

  // One balancing accrued-liability credit.
  const credit: DraftLine = {
    glAccountId: accruedLiabilityGlAccountId,
    costCenterId: null,
    entityId: null,
    debit: 0n,
    credit: estimated,
  };
  const lines = estimated > 0n ? [...debits, credit] : debits;

  const totalDebit = lines.reduce((a, l) => a + l.debit, 0n);
  const totalCredit = lines.reduce((a, l) => a + l.credit, 0n);
  return { lines, estimated, balanced: totalDebit === totalCredit };
}

const usd = (m: bigint) => `$${(Number(m) / 1_000_000).toFixed(2)}`;

export async function generateAccrual(orgId: string, periodId: string, today: string) {
  const [period] = await db
    .select()
    .from(accountingPeriods)
    .where(and(eq(accountingPeriods.id, periodId), eq(accountingPeriods.orgId, orgId)))
    .limit(1);
  if (!period) throw new Error("Period not found.");

  const [org] = await db
    .select({ accrued: organizations.accruedLiabilityGlAccountId })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  const tz = await getReportingTimezone(orgId, period.entityId);
  const { fromDate, toDate } = usageBucketRange(period.periodStart, period.periodEnd, tz);

  // Observed coded usage split by GL × cost center (respecting allocation_pct).
  const rows = await db
    .select({
      glAccountId: costAllocations.glAccountId,
      costCenterId: costAllocations.costCenterId,
      entityId: costAllocations.entityId,
      weighted: sql<string>`coalesce(sum(${usageEvents.costUsdMicros} * coalesce(${costAllocations.allocationPct}, 10000)), 0)`,
    })
    .from(usageEvents)
    .leftJoin(
      costAllocations,
      and(
        eq(costAllocations.usageEventId, usageEvents.id),
        eq(costAllocations.orgId, usageEvents.orgId),
        period.entityId ? eq(costAllocations.entityId, period.entityId) : undefined
      )
    )
    .where(and(eq(usageEvents.orgId, orgId), between(usageEvents.timeBucket, fromDate, toDate)))
    .groupBy(costAllocations.glAccountId, costAllocations.costCenterId, costAllocations.entityId);

  const observed: ObservedLine[] = rows.map((r) => ({
    glAccountId: r.glAccountId,
    costCenterId: r.costCenterId,
    entityId: r.entityId,
    micros: BigInt(r.weighted) / 10000n,
  }));
  const observedTotal = observed.reduce((a, o) => a + o.micros, 0n);

  // Forecast tail: not-yet-reported usage for the period's month, per provider.
  const month = period.periodStart.slice(0, 7);
  const provRows = await db
    .selectDistinct({ key: providers.key })
    .from(usageEvents)
    .innerJoin(providers, eq(providers.id, usageEvents.providerId))
    .where(and(eq(usageEvents.orgId, orgId), between(usageEvents.timeBucket, fromDate, toDate)));
  let tail = 0n;
  const tailByProvider: { provider: string; tailMicros: string }[] = [];
  for (const p of provRows) {
    const proj = await forecastNextInvoice(orgId, p.key, month, today);
    if (!proj) continue;
    const t = proj.projectedTotalMicros - proj.mtdObservedMicros;
    if (t > 0n) {
      tail += t;
      tailByProvider.push({ provider: p.key, tailMicros: t.toString() });
    }
  }

  const { lines, estimated, balanced } = buildAccrualLines(observed, tail, org?.accrued ?? null);
  if (!balanced) throw new Error("Refusing to write an unbalanced journal entry.");

  const methodNote = [
    `Accrual for period ${period.periodStart}…${period.periodEnd} (reporting tz ${tz}).`,
    `Observed coded usage: ${usd(observedTotal)} across ${observed.length} GL×cost-center line(s).`,
    tailByProvider.length > 0
      ? `Forecast tail (not yet reported): ${usd(tail)} — ${tailByProvider.map((t) => `${t.provider} ${usd(BigInt(t.tailMicros))}`).join(", ")}.`
      : `Forecast tail: $0.00 (period fully reported or no open run-rate).`,
    `Estimated accrual = observed + tail = ${usd(estimated)}.`,
    `JE: expense debits by GL×cost center (tail split pro-rata to observed shares), one accrued-liability credit of ${usd(estimated)}. Debits == credits.`,
    org?.accrued ? "" : "NOTE: no accrued-liability GL account configured — credit line GL is unset.",
  ]
    .filter(Boolean)
    .join("\n");

  const idempotencyKey = `accrual:${periodId}:all`;

  return db.transaction(async (tx) => {
    const [existingJe] = await tx
      .select({ id: journalEntries.id, status: journalEntries.status })
      .from(journalEntries)
      .where(and(eq(journalEntries.orgId, orgId), eq(journalEntries.idempotencyKey, idempotencyKey)))
      .limit(1);
    if (existingJe && existingJe.status !== "draft") {
      throw new Error(`An ${existingJe.status} accrual already exists for this period — regenerate is blocked.`);
    }
    if (existingJe) {
      // Replace the draft in place (idempotent regenerate).
      await tx.delete(journalEntryLines).where(eq(journalEntryLines.journalEntryId, existingJe.id));
      await tx.delete(accruals).where(eq(accruals.journalEntryId, existingJe.id));
      await tx.delete(journalEntries).where(eq(journalEntries.id, existingJe.id));
    }

    const [je] = await tx
      .insert(journalEntries)
      .values({
        orgId,
        periodId,
        type: "accrual",
        status: "draft",
        idempotencyKey,
        memo: `Month-end accrual — ${period.periodStart}…${period.periodEnd}`,
      })
      .returning({ id: journalEntries.id });

    if (lines.length > 0) {
      await tx.insert(journalEntryLines).values(
        lines.map((l) => ({
          orgId,
          journalEntryId: je.id,
          glAccountId: l.glAccountId,
          costCenterId: l.costCenterId,
          entityId: l.entityId,
          debit: l.debit,
          credit: l.credit,
        }))
      );
    }

    await tx.insert(accruals).values({
      orgId,
      periodId,
      provider: null,
      estimatedAmount: estimated,
      tailForecastAmount: tail,
      methodNote,
      status: "draft",
      journalEntryId: je.id,
    });

    return { journalEntryId: je.id, estimated, tail, balanced, lineCount: lines.length };
  });
}
