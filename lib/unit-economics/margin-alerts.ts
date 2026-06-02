import { getUnitEconomics } from "./compute";

/**
 * Margin alerts (Phase 12.2, §5h). Flags a customer, workflow, or product line
 * whose AI cost is eroding — or exceeding — its revenue beyond a threshold, and
 * states the dollar margin at risk. Read/compute only; dispatch is the Inngest
 * job in lib/jobs/margin-alerts.ts (Slack + Linear, reusing Phase 5).
 */

export type MarginVerdict = {
  kind: "negative_margin" | "erosion" | null;
  severity: "critical" | "warn" | null;
  marginAtRiskMicros: bigint;
};

/** Pure: classify one (cost, revenue) pair. `negative_margin` = AI cost exceeds
 * revenue (loss = the overage). `erosion` = AI cost is ≥ threshold of revenue
 * but still under it. No revenue → no verdict (never a fabricated ratio). */
export function evaluateMargin(
  costMicros: bigint,
  revenueMicros: bigint,
  erosionThresholdBps = 8000
): MarginVerdict {
  if (revenueMicros <= 0n) return { kind: null, severity: null, marginAtRiskMicros: 0n };
  if (costMicros > revenueMicros) {
    return { kind: "negative_margin", severity: "critical", marginAtRiskMicros: costMicros - revenueMicros };
  }
  const costShareBps = Number((costMicros * 10000n) / revenueMicros);
  if (costShareBps >= erosionThresholdBps) {
    // Margin at risk = the slice of margin AI cost is consuming past the threshold.
    const thresholdCost = (revenueMicros * BigInt(erosionThresholdBps)) / 10000n;
    return { kind: "erosion", severity: "warn", marginAtRiskMicros: costMicros - thresholdCost };
  }
  return { kind: null, severity: null, marginAtRiskMicros: 0n };
}

export type MarginAlert = {
  grain: "customer" | "workflow" | "product_line";
  ref: string;
  label: string;
  costMicros: bigint;
  revenueMicros: bigint;
  kind: "negative_margin" | "erosion";
  severity: "critical" | "warn";
  marginAtRiskMicros: bigint;
};

/** Evaluate margin alerts across customer, workflow, and product-line grains for
 * a window. A grain item is only considered when it has a revenue outcome. */
export async function detectMarginAlerts(
  orgId: string,
  from: string,
  to: string,
  erosionThresholdBps = 8000
): Promise<MarginAlert[]> {
  const ue = await getUnitEconomics(orgId, from, to);
  const alerts: MarginAlert[] = [];

  const consider = (
    grain: MarginAlert["grain"],
    ref: string,
    label: string,
    costMicros: bigint,
    revenueMicros: bigint
  ) => {
    const v = evaluateMargin(costMicros, revenueMicros, erosionThresholdBps);
    if (v.kind && v.severity) {
      alerts.push({ grain, ref, label, costMicros, revenueMicros, kind: v.kind, severity: v.severity, marginAtRiskMicros: v.marginAtRiskMicros });
    }
  };

  // Product lines carry revenue directly (cogs vs revenue).
  for (const pl of ue.byProductLine) {
    if (!pl.hasRevenue || pl.revenueMicros == null) continue;
    consider("product_line", pl.id, `${pl.code} · ${pl.name}`, BigInt(pl.costMicros), BigInt(pl.revenueMicros));
  }
  // Customers / workflows: revenue is the value of a revenue-unit metric on that grain.
  for (const c of ue.customers) {
    const rev = revenueOf(c.metrics);
    if (rev != null) consider("customer", c.ref, c.ref, BigInt(c.costMicros), rev);
  }
  for (const w of ue.workflows) {
    const rev = revenueOf(w.metrics);
    if (rev != null) consider("workflow", w.id, w.name, BigInt(w.costMicros), rev);
  }

  return alerts.sort((a, b) => Number(b.marginAtRiskMicros - a.marginAtRiskMicros));
}

// A grain's revenue = sum of its revenue-unit metric values (stored ×1e6 = micros).
function revenueOf(metrics: { unit: string; valueScaled: string }[]): bigint | null {
  let rev = 0n;
  let any = false;
  for (const m of metrics) {
    const u = m.unit.toLowerCase();
    if (u.startsWith("usd") || u.includes("revenue") || ["mrr", "arr", "gmv", "bookings"].includes(u)) {
      rev += BigInt(m.valueScaled);
      any = true;
    }
  }
  return any ? rev : null;
}
