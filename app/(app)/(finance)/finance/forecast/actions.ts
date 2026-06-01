"use server";

import { requireSurface } from "@/lib/auth";
import { withOrgContext } from "@/lib/db/rls";
import { usageEvents, providers } from "@/lib/db/schema";
import { and, eq, between } from "drizzle-orm";
import {
  forecastNextInvoice,
  saveForecastSnapshot,
  getForecastAccuracy,
  type Projection,
} from "@/lib/forecast/forecast";

function ser(p: Projection) {
  return {
    provider: p.provider,
    period: p.period,
    throughDay: p.throughDay,
    daysInMonth: p.daysInMonth,
    remainingDays: p.remainingDays,
    mtdObserved: p.mtdObservedMicros.toString(),
    runRateDaily: p.runRateDailyMicros.toString(),
    projectedTotal: p.projectedTotalMicros.toString(),
    low: p.lowMicros.toString(),
    high: p.highMicros.toString(),
    bandPct: p.bandPct,
    seasonality: p.seasonality,
    formula: p.formula,
  };
}

/** Compute + persist a forecast for each provider with usage this month, with
 * its historical accuracy. Computing on view stores a daily snapshot, building
 * the trajectory accuracy tracking needs. */
export async function getForecastView() {
  const user = await requireSurface("finance");
  const now = new Date();
  const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const asOf = now.toISOString().slice(0, 10);
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0))
    .toISOString()
    .slice(0, 10);

  const provRows = await withOrgContext(user.orgId, async (tx) =>
    tx
      .selectDistinct({ key: providers.key, name: providers.displayName })
      .from(usageEvents)
      .innerJoin(providers, eq(providers.id, usageEvents.providerId))
      .where(
        and(
          eq(usageEvents.orgId, user.orgId),
          between(usageEvents.timeBucket, `${period}-01`, monthEnd)
        )
      )
  );

  const out = [];
  for (const p of provRows) {
    const proj = await forecastNextInvoice(user.orgId, p.key, period, asOf);
    if (proj) await saveForecastSnapshot(user.orgId, proj);
    const accuracy = await getForecastAccuracy(user.orgId, p.key);
    out.push({
      provider: p.key,
      providerName: p.name,
      projection: proj ? ser(proj) : null,
      accuracy,
    });
  }

  return { period, monthEnd, providers: out };
}
