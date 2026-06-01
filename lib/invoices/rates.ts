import { db } from "@/lib/db/client";
import { providerRateSnapshots } from "@/lib/db/schema";
import { and, eq, lte, desc, sql } from "drizzle-orm";
import { anthropicRateRows } from "@/lib/providers/pricing/anthropic";
import { openaiRateRows } from "@/lib/providers/pricing/openai";

/**
 * Rate snapshots (Phase 10.1). The trustworthy point-in-time pricing baseline
 * 10.2 uses for the price_change discrepancy. APPEND-ONLY: a rate change is a
 * NEW row; historical rows are never edited (DB trigger enforces it). `rate` is
 * stored as **micros per 1,000,000 units** so sub-micro per-token prices stay
 * integers. Only token-priced providers (Anthropic, OpenAI) have rate rows;
 * seat/pass-through providers (Copilot, OpenRouter) have none — 10.2 reports a
 * missing baseline for those rather than guessing.
 */

const PER_MILLION = 1_000_000;

type RateRow = { provider: string; model: string; unit: string; rate: bigint };

/** Current effective rates from the MVP rate source (our pricing tables). */
export function currentRateRows(): RateRow[] {
  const toRows = (provider: string, rows: { model: string; unit: string; ratePerToken: number }[]) =>
    rows.map((r) => ({
      provider,
      model: r.model,
      unit: r.unit,
      // micros/token → micros per 1,000,000 units (integer).
      rate: BigInt(Math.round(r.ratePerToken * PER_MILLION)),
    }));
  return [
    ...toRows("anthropic", anthropicRateRows()),
    ...toRows("openai", openaiRateRows()),
  ];
}

/**
 * Append current rates for the org, deduped on change: a row is inserted only
 * when the rate for (provider, model, unit) differs from the latest snapshot.
 * `effectiveFrom` is the supplied date (defaults to today). Never edits rows.
 */
export async function captureRateSnapshots(
  orgId: string,
  effectiveFrom: string
): Promise<{ inserted: number; checked: number }> {
  const rows = currentRateRows();
  let inserted = 0;
  for (const r of rows) {
    const [latest] = await db
      .select({ rate: providerRateSnapshots.rate })
      .from(providerRateSnapshots)
      .where(
        and(
          eq(providerRateSnapshots.orgId, orgId),
          eq(providerRateSnapshots.provider, r.provider),
          eq(providerRateSnapshots.model, r.model),
          eq(providerRateSnapshots.unit, r.unit)
        )
      )
      .orderBy(desc(providerRateSnapshots.effectiveFrom), desc(providerRateSnapshots.capturedAt))
      .limit(1);
    if (latest && BigInt(latest.rate) === r.rate) continue; // unchanged → skip
    await db.insert(providerRateSnapshots).values({
      orgId,
      provider: r.provider,
      model: r.model,
      unit: r.unit,
      rate: r.rate,
      effectiveFrom,
      source: "mvp_rate_source",
    });
    inserted += 1;
  }
  return { inserted, checked: rows.length };
}

/**
 * Resolve the rate effective AS OF a billing period for one (provider, model,
 * unit): the snapshot whose [effective_from, effective_to] covers `periodStart`,
 * latest effective_from wins. Returns null (MISSING baseline) when no snapshot
 * covers the period — never falls back to the current rate.
 */
export async function resolveRateAsOf(
  orgId: string,
  provider: string,
  model: string,
  unit: string,
  periodStart: string
): Promise<{ rate: bigint; effectiveFrom: string; source: string } | null> {
  const [row] = await db
    .select({
      rate: providerRateSnapshots.rate,
      effectiveFrom: providerRateSnapshots.effectiveFrom,
      effectiveTo: providerRateSnapshots.effectiveTo,
      source: providerRateSnapshots.source,
    })
    .from(providerRateSnapshots)
    .where(
      and(
        eq(providerRateSnapshots.orgId, orgId),
        eq(providerRateSnapshots.provider, provider),
        eq(providerRateSnapshots.model, model),
        eq(providerRateSnapshots.unit, unit),
        lte(providerRateSnapshots.effectiveFrom, periodStart),
        sql`(${providerRateSnapshots.effectiveTo} is null or ${providerRateSnapshots.effectiveTo} >= ${periodStart})`
      )
    )
    .orderBy(desc(providerRateSnapshots.effectiveFrom))
    .limit(1);
  if (!row) return null;
  return { rate: BigInt(row.rate), effectiveFrom: row.effectiveFrom, source: row.source };
}

/**
 * On-ingest snapshot capture. Stamps current rates with the **observation date**
 * (today), never backdated to the billing period — so a past period with no
 * prior snapshot stays a MISSING baseline (10.2 reports low confidence) instead
 * of being silently backfilled with the current rate. Dedup-on-change keeps it
 * idempotent: calling it repeatedly only appends when a rate actually changed.
 */
export async function captureRatesNow(orgId: string, today: string) {
  return captureRateSnapshots(orgId, today);
}
