import { db } from "@/lib/db/client";
import { usageEvents, providers, commitments } from "@/lib/db/schema";
import { and, eq, between, sql, lte } from "drizzle-orm";

/**
 * Commitment drawdown + alerts (Phase 10.4, architecture §4b). Project the
 * end-of-term position from the term-to-date run-rate (the same simple,
 * explainable method as the invoice forecast) and flag money at risk:
 * under-utilization (committed spend left unused), overage (will exceed the
 * commitment — unplanned cash at list rate), and expiry (prepaid credit with a
 * remaining balance nearing its end date). Alerting only — no money moves.
 */

const EXPIRY_WINDOW_DAYS = 30;
const MIN_AT_RISK = 1_000_000n; // $1 — don't alert on noise

export type CommitmentInput = {
  type: "committed_use" | "prepaid_credit" | "enterprise_agreement";
  amount: bigint;
  startDate: string;
  endDate: string;
};

export type DrawdownPoint = { date: string; cumulativeMicros: string };

export type CommitmentAlert = {
  kind: "under_utilization" | "overage" | "expiry";
  amountAtRiskMicros: bigint;
  date: string; // the relevant date (end of term / expiry)
  message: string;
};

export type CommitmentStatus = {
  consumedMicros: bigint;
  remainingMicros: bigint;
  pctConsumed: number;
  dailyRunRateMicros: bigint;
  projectedEndConsumedMicros: bigint;
  projectedRemainingMicros: bigint;
  termDays: number;
  daysElapsed: number;
  daysRemaining: number;
  derivedStatus: "active" | "expired" | "exhausted";
  curve: DrawdownPoint[];
  alerts: CommitmentAlert[];
};

const dayDiff = (a: string, b: string) =>
  Math.round(
    (new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) /
      86400000
  );
const usd = (micros: bigint) => `$${(Number(micros) / 1_000_000).toFixed(2)}`;

/** Pure: classify a commitment from its observed consumption + a curve. */
export function computeCommitment(
  c: CommitmentInput,
  consumedMicros: bigint,
  curve: DrawdownPoint[],
  today: string
): CommitmentStatus {
  // Inclusive day counts within the term, bounded by today.
  const termDays = dayDiff(c.startDate, c.endDate) + 1;
  const effectiveToday = today < c.startDate ? c.startDate : today > c.endDate ? c.endDate : today;
  const daysElapsed = Math.max(1, dayDiff(c.startDate, effectiveToday) + 1);
  const daysRemaining = Math.max(0, termDays - daysElapsed);

  const dailyRunRate = consumedMicros / BigInt(daysElapsed);
  const projectedEndConsumed =
    daysRemaining > 0 ? consumedMicros + dailyRunRate * BigInt(daysRemaining) : consumedMicros;
  const remaining = c.amount - consumedMicros;
  const projectedRemaining = c.amount - projectedEndConsumed;

  const past = today > c.endDate;
  const derivedStatus: CommitmentStatus["derivedStatus"] =
    consumedMicros >= c.amount ? "exhausted" : past ? "expired" : "active";

  const alerts: CommitmentAlert[] = [];
  // Overage: projected to exceed the commitment.
  if (projectedEndConsumed - c.amount > MIN_AT_RISK) {
    alerts.push({
      kind: "overage",
      amountAtRiskMicros: projectedEndConsumed - c.amount,
      date: c.endDate,
      message: `Projected to exceed ${c.type} by ${usd(projectedEndConsumed - c.amount)} by ${c.endDate} — unplanned cash at list rate.`,
    });
  } else if (!past && projectedRemaining > MIN_AT_RISK) {
    // Under-utilization: projected to leave committed spend unused at term end.
    alerts.push({
      kind: "under_utilization",
      amountAtRiskMicros: projectedRemaining,
      date: c.endDate,
      message: `Projected to leave ${usd(projectedRemaining)} of the commitment unused by ${c.endDate}.`,
    });
  }
  // Expiry: prepaid credit nearing end with a balance remaining.
  if (
    c.type === "prepaid_credit" &&
    remaining > MIN_AT_RISK &&
    daysRemaining >= 0 &&
    daysRemaining <= EXPIRY_WINDOW_DAYS
  ) {
    alerts.push({
      kind: "expiry",
      amountAtRiskMicros: remaining,
      date: c.endDate,
      message: `${usd(remaining)} of prepaid credit expires on ${c.endDate} (${daysRemaining} day${daysRemaining === 1 ? "" : "s"} left).`,
    });
  }

  return {
    consumedMicros,
    remainingMicros: remaining,
    pctConsumed: c.amount > 0n ? Number((consumedMicros * 10000n) / c.amount) / 100 : 0,
    dailyRunRateMicros: dailyRunRate,
    projectedEndConsumedMicros: projectedEndConsumed,
    projectedRemainingMicros: projectedRemaining,
    termDays,
    daysElapsed,
    daysRemaining,
    derivedStatus,
    curve,
    alerts,
  };
}

/** Load observed consumption for a commitment's provider/term and compute. */
export async function getCommitmentStatus(
  orgId: string,
  c: { id: string; provider: string; type: CommitmentInput["type"]; amount: bigint; startDate: string; endDate: string },
  today: string
): Promise<CommitmentStatus> {
  const [prov] = await db
    .select({ id: providers.id })
    .from(providers)
    .where(eq(providers.key, c.provider))
    .limit(1);

  const through = today > c.endDate ? c.endDate : today;
  let consumed = 0n;
  const curve: DrawdownPoint[] = [];
  if (prov) {
    const rows = await db
      .select({
        day: usageEvents.timeBucket,
        cost: sql<string>`coalesce(sum(${usageEvents.costUsdMicros}), 0)`,
      })
      .from(usageEvents)
      .where(
        and(
          eq(usageEvents.orgId, orgId),
          eq(usageEvents.providerId, prov.id),
          between(usageEvents.timeBucket, c.startDate, through)
        )
      )
      .groupBy(usageEvents.timeBucket)
      .orderBy(usageEvents.timeBucket);
    let cum = 0n;
    for (const r of rows) {
      cum += BigInt(r.cost);
      curve.push({ date: r.day, cumulativeMicros: cum.toString() });
    }
    consumed = cum;
  }
  return computeCommitment(
    { type: c.type, amount: c.amount, startDate: c.startDate, endDate: c.endDate },
    consumed,
    curve,
    today
  );
}

/** Active commitments for an org whose term covers today (for alert sweeps). */
export async function getActiveCommitments(orgId: string, today: string) {
  return db
    .select()
    .from(commitments)
    .where(
      and(
        eq(commitments.orgId, orgId),
        lte(commitments.startDate, today)
      )
    );
}
