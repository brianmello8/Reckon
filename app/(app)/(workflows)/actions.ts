"use server";

import { requireSurface } from "@/lib/auth";
import { getRunEvents } from "./queries";

/** Run-explorer drill-down: usage_events linked to one run. */
export async function getRunEventsAction(runId: string) {
  const user = await requireSurface("workflows");
  const rows = await getRunEvents(user.orgId, runId);
  return rows.map((r) => ({
    id: r.id,
    day: r.day,
    model: r.model,
    providerName: r.providerName,
    inputTokens: r.inputTokens.toString(),
    outputTokens: r.outputTokens.toString(),
    costMicros: Number(r.costMicros),
  }));
}
