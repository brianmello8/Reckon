"use server";

import { requireSurface } from "@/lib/auth";
import { getUnitEconomics } from "@/lib/unit-economics/compute";
import { detectMarginAlerts } from "@/lib/unit-economics/margin-alerts";
import { periodRange } from "../queries";

/** Last `n` calendar months as YYYY-MM, most recent first. */
function recentPeriods(n: number, today: Date): string[] {
  const out: string[] = [];
  let y = today.getUTCFullYear();
  let m = today.getUTCMonth(); // 0-indexed
  for (let i = 0; i < n; i++) {
    out.push(`${y}-${String(m + 1).padStart(2, "0")}`);
    m -= 1;
    if (m < 0) { m = 11; y -= 1; }
  }
  return out;
}

export async function getUnitEconomicsView(period?: string) {
  const user = await requireSurface("finance");
  const today = new Date();
  const periods = recentPeriods(12, today);
  const p = period && /^\d{4}-\d{2}$/.test(period) ? period : periods[0];
  const { from, to } = periodRange(p);

  const [economics, alerts] = await Promise.all([
    getUnitEconomics(user.orgId, from, to),
    detectMarginAlerts(user.orgId, from, to),
  ]);

  return {
    period: p,
    periods,
    economics,
    alerts: alerts.map((a) => ({
      grain: a.grain,
      label: a.label,
      kind: a.kind,
      severity: a.severity,
      costMicros: a.costMicros.toString(),
      revenueMicros: a.revenueMicros.toString(),
      marginAtRiskMicros: a.marginAtRiskMicros.toString(),
    })),
  };
}
