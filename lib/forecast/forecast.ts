import { db } from "@/lib/db/client";
import {
  usageEvents,
  providers,
  providerInvoices,
  forecastSnapshots,
} from "@/lib/db/schema";
import { and, eq, between, sql, desc } from "drizzle-orm";

/**
 * Next-invoice forecasting (Phase 10.3, architecture §5c). Deliberately SIMPLE
 * and explainable — no black box:
 *
 *   projected = MTD observed + (Σ over remaining days of that day's run-rate)
 *   band      = dailyStdDev × √(remaining days)   [std-error of the tail sum]
 *
 * Run-rate is per-day mean, optionally split weekday vs weekend when the two
 * differ meaningfully (a real signal, not curve-fitting). Reproducible by hand
 * on a small example.
 */

const isoSqrt = (n: number) => Math.sqrt(n);

export type Projection = {
  provider: string;
  period: string;
  throughDay: number;
  daysInMonth: number;
  remainingDays: number;
  snapshotDate: string;
  mtdObservedMicros: bigint;
  runRateDailyMicros: bigint;
  projectedTotalMicros: bigint;
  lowMicros: bigint;
  highMicros: bigint;
  bandPct: number;
  seasonality: boolean;
  formula: string;
};

function monthInfo(period: string) {
  const [y, m] = period.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { y, m, daysInMonth };
}

/** Forecast the provider's invoice for `period` (YYYY-MM), `asOf` (YYYY-MM-DD). */
export async function forecastNextInvoice(
  orgId: string,
  provider: string,
  period: string,
  asOf: string
): Promise<Projection | null> {
  const [prov] = await db
    .select({ id: providers.id })
    .from(providers)
    .where(eq(providers.key, provider))
    .limit(1);
  if (!prov) return null;

  const { y, m, daysInMonth } = monthInfo(period);
  const asOfDate = new Date(`${asOf}T00:00:00.000Z`);
  const currentPeriod = `${asOfDate.getUTCFullYear()}-${String(asOfDate.getUTCMonth() + 1).padStart(2, "0")}`;

  // How far through the period are we? Past months are fully observed; the
  // current month runs through today; future months can't be forecast.
  let throughDay: number;
  if (period < currentPeriod) throughDay = daysInMonth;
  else if (period === currentPeriod) throughDay = Math.min(asOfDate.getUTCDate(), daysInMonth);
  else return null;
  if (throughDay <= 0) return null;

  const from = `${period}-01`;
  const through = `${period}-${String(throughDay).padStart(2, "0")}`;
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
        between(usageEvents.timeBucket, from, through)
      )
    )
    .groupBy(usageEvents.timeBucket);

  const costByDay = new Map<number, number>();
  for (const r of rows) costByDay.set(Number(r.day.slice(8, 10)), Number(r.cost));

  // Daily series 1..throughDay (missing day = 0), tagged weekday/weekend.
  const daily: { day: number; cost: number; weekend: boolean }[] = [];
  for (let d = 1; d <= throughDay; d++) {
    const weekend = [0, 6].includes(new Date(Date.UTC(y, m - 1, d)).getUTCDay());
    daily.push({ day: d, cost: costByDay.get(d) ?? 0, weekend });
  }
  const mtd = daily.reduce((a, x) => a + x.cost, 0);
  if (mtd <= 0) return null; // nothing to forecast

  const mean = mtd / throughDay;
  const wkday = daily.filter((d) => !d.weekend).map((d) => d.cost);
  const wkend = daily.filter((d) => d.weekend).map((d) => d.cost);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : mean);
  const wkdayMean = avg(wkday);
  const wkendMean = avg(wkend);
  // Use seasonality only when both day-types have data and differ > 15% of mean.
  const seasonality = wkday.length > 0 && wkend.length > 0 && Math.abs(wkdayMean - wkendMean) > 0.15 * mean;

  // Project the tail day by day.
  let tail = 0;
  const remainingDays = daysInMonth - throughDay;
  for (let d = throughDay + 1; d <= daysInMonth; d++) {
    const weekend = [0, 6].includes(new Date(Date.UTC(y, m - 1, d)).getUTCDay());
    tail += seasonality ? (weekend ? wkendMean : wkdayMean) : mean;
  }
  const projected = mtd + tail;

  // Band = daily stddev × √(remaining days) — the std-error of the tail sum.
  const variance = daily.reduce((a, x) => a + (x.cost - mean) ** 2, 0) / Math.max(1, throughDay - 1);
  const std = isoSqrt(variance);
  const band = std * isoSqrt(remainingDays);
  const low = Math.max(mtd, projected - band); // never below what's already spent
  const high = projected + band;
  const bandPct = projected > 0 ? Math.round((band / projected) * 100) : 0;

  const r = (n: number) => BigInt(Math.round(n));
  return {
    provider,
    period,
    throughDay,
    daysInMonth,
    remainingDays,
    snapshotDate: asOf,
    mtdObservedMicros: r(mtd),
    runRateDailyMicros: r(mean),
    projectedTotalMicros: r(projected),
    lowMicros: r(low),
    highMicros: r(high),
    bandPct,
    seasonality,
    formula: seasonality
      ? "MTD + Σ(remaining days × weekday/weekend mean); band = dailyσ × √(remaining days)"
      : "MTD + (remaining days × daily mean); band = dailyσ × √(remaining days)",
  };
}

/** Persist a projection (one per provider/period/day) so accuracy is trackable. */
export async function saveForecastSnapshot(orgId: string, p: Projection) {
  await db
    .insert(forecastSnapshots)
    .values({
      orgId,
      provider: p.provider,
      period: p.period,
      snapshotDate: p.snapshotDate,
      mtdObserved: p.mtdObservedMicros,
      throughDay: p.throughDay,
      daysInMonth: p.daysInMonth,
      runRateDaily: p.runRateDailyMicros,
      projectedTotal: p.projectedTotalMicros,
      low: p.lowMicros,
      high: p.highMicros,
      bandPct: p.bandPct,
      method: { seasonality: p.seasonality, formula: p.formula },
    })
    .onConflictDoUpdate({
      target: [
        forecastSnapshots.orgId,
        forecastSnapshots.provider,
        forecastSnapshots.period,
        forecastSnapshots.snapshotDate,
      ],
      set: {
        mtdObserved: p.mtdObservedMicros,
        throughDay: p.throughDay,
        runRateDaily: p.runRateDailyMicros,
        projectedTotal: p.projectedTotalMicros,
        low: p.lowMicros,
        high: p.highMicros,
        bandPct: p.bandPct,
        method: { seasonality: p.seasonality, formula: p.formula },
      },
    });
}

/**
 * Forecast-vs-actual accuracy: for past periods with both a final forecast
 * (the latest snapshot for that period) and an actual invoice, the error %.
 */
export async function getForecastAccuracy(orgId: string, provider: string, limit = 6) {
  const invs = await db
    .select({
      period: sql<string>`substring(${providerInvoices.billingPeriodStart}::text, 1, 7)`,
      total: providerInvoices.total,
    })
    .from(providerInvoices)
    .where(and(eq(providerInvoices.orgId, orgId), eq(providerInvoices.provider, provider)));
  const actualByPeriod = new Map(invs.map((i) => [i.period, i.total]));
  if (actualByPeriod.size === 0) return { rows: [], summary: null as string | null };

  const out: { period: string; projected: string; actual: string; errorPct: number }[] = [];
  for (const [period, actual] of actualByPeriod) {
    const [snap] = await db
      .select({ projected: forecastSnapshots.projectedTotal })
      .from(forecastSnapshots)
      .where(
        and(
          eq(forecastSnapshots.orgId, orgId),
          eq(forecastSnapshots.provider, provider),
          eq(forecastSnapshots.period, period)
        )
      )
      .orderBy(desc(forecastSnapshots.snapshotDate))
      .limit(1);
    if (!snap || actual === 0n) continue;
    const projected = snap.projected;
    const errAbs = projected > actual ? projected - actual : actual - projected;
    const errorPct = Math.round((Number(errAbs) / Number(actual)) * 1000) / 10;
    out.push({ period, projected: projected.toString(), actual: actual.toString(), errorPct });
  }
  out.sort((a, b) => (a.period < b.period ? 1 : -1));
  const recent = out.slice(0, Math.min(3, out.length));
  const summary =
    recent.length > 0
      ? `Last ${recent.length} forecast${recent.length > 1 ? "s" : ""} within ±${Math.max(...recent.map((r) => r.errorPct))}%`
      : null;
  return { rows: out.slice(0, limit), summary };
}
