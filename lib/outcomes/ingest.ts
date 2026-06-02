import { db } from "@/lib/db/client";
import { outcomeValues, outcomeMetrics } from "@/lib/db/schema";
import { and, eq, sql } from "drizzle-orm";

/**
 * Outcome-metric ingestion (Phase 12.1, architecture §7). Reckon supplies the
 * cost (denominator); the customer supplies the outcome (numerator) here.
 *
 * Values are stored scaled ×1,000,000 (the micros convention) for ALL units, so
 * money is exact to the cent and unit-economics ratios self-normalize. Parsing
 * is integer-only (no float) so "1200.50" → 1_200_500_000n with no rounding drift.
 */

const SCALE = 1_000_000n;

/** Parse a human decimal string to a value scaled ×1e6 — exact, no float.
 * Accepts optional sign, thousands commas, and up to 6 fractional digits. */
export function parseScaledValue(raw: string): bigint {
  const s = raw.trim().replace(/,/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(s)) {
    throw new Error(`Invalid numeric value: "${raw}"`);
  }
  const neg = s.startsWith("-");
  const [intPart, fracPartRaw = ""] = (neg ? s.slice(1) : s).split(".");
  if (fracPartRaw.length > 6) {
    throw new Error(`At most 6 decimal places supported: "${raw}"`);
  }
  const frac = (fracPartRaw + "000000").slice(0, 6); // pad to micros
  const scaled = BigInt(intPart) * SCALE + BigInt(frac);
  return neg ? -scaled : scaled;
}

/** Inverse of parseScaledValue — for display/CSV export. */
export function formatScaledValue(value: bigint): string {
  const neg = value < 0n;
  const abs = neg ? -value : value;
  const whole = abs / SCALE;
  const frac = (abs % SCALE).toString().padStart(6, "0").replace(/0+$/, "");
  return (neg ? "-" : "") + whole.toString() + (frac ? "." + frac : "");
}

export type OutcomeValueInput = {
  metricId: string;
  grainRef: string; // "" for org grain
  periodStart: string; // yyyy-mm-dd
  periodEnd: string; // yyyy-mm-dd
  value: bigint; // already scaled ×1e6
  source: "manual" | "csv" | "api";
};

/** Idempotent upsert: one value per (metric, grainRef, period). Re-loading the
 * same period overwrites (last-write-wins), matching the ingestion invariant. */
export async function upsertOutcomeValues(
  tx: typeof db,
  orgId: string,
  rows: OutcomeValueInput[]
): Promise<number> {
  if (rows.length === 0) return 0;
  await tx
    .insert(outcomeValues)
    .values(
      rows.map((r) => ({
        orgId,
        metricId: r.metricId,
        grainRef: r.grainRef,
        periodStart: r.periodStart,
        periodEnd: r.periodEnd,
        value: r.value,
        source: r.source,
      }))
    )
    .onConflictDoUpdate({
      target: [
        outcomeValues.metricId,
        outcomeValues.grainRef,
        outcomeValues.periodStart,
        outcomeValues.periodEnd,
      ],
      set: {
        value: sqlExcluded("value"),
        source: sqlExcluded("source"),
        updatedAt: new Date(),
      },
    });
  return rows.length;
}

// Small helper so the ON CONFLICT set reads the incoming row (EXCLUDED.*).
function sqlExcluded(col: string) {
  return sql.raw(`excluded.${col}`);
}

/** Resolve a metric by its stable key within the org (for the API ingest path). */
export async function resolveMetricByKey(orgId: string, key: string) {
  const [m] = await db
    .select()
    .from(outcomeMetrics)
    .where(and(eq(outcomeMetrics.orgId, orgId), eq(outcomeMetrics.key, key)))
    .limit(1);
  return m ?? null;
}
