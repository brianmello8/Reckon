import { NextResponse } from "next/server";
import { z } from "zod";
import { withOrgContext } from "@/lib/db/rls";
import { authenticateIngestToken } from "@/lib/tokens/ingest-token";
import { parseScaledValue, upsertOutcomeValues, type OutcomeValueInput } from "@/lib/outcomes/ingest";
import { db } from "@/lib/db/client";
import { outcomeMetrics } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * Programmatic outcome-value ingest (Phase 12.1, §7).
 * Auth: `Authorization: Bearer <token>` (or `x-ingest-token`). Org-scoped via
 * the token. Values upsert idempotently with source = "api".
 *
 * Body: { values: [{ metricKey, grainRef?, periodStart, periodEnd, value }] }
 * `value` may be a number or a decimal string; stored scaled ×1e6.
 */

const valueDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected yyyy-mm-dd");
const itemSchema = z.object({
  metricKey: z.string().min(1),
  grainRef: z.string().optional(),
  periodStart: valueDate,
  periodEnd: valueDate,
  value: z.union([z.string(), z.number()]),
});
const bodySchema = z.object({ values: z.array(itemSchema).min(1).max(1000) });

export async function POST(req: Request) {
  const auth = await authenticateIngestToken(req);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (auth.scope !== "outcomes") {
    return NextResponse.json({ error: "Token scope does not permit outcomes ingest" }, { status: 403 });
  }

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: "Invalid body", detail: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }

  // Resolve metrics by key for this org (the app role bypasses RLS; we still
  // scope explicitly by org_id).
  const metrics = await db
    .select({ id: outcomeMetrics.id, key: outcomeMetrics.key, grain: outcomeMetrics.grain })
    .from(outcomeMetrics)
    .where(eq(outcomeMetrics.orgId, auth.orgId));
  const byKey = new Map(metrics.map((m) => [m.key, m]));

  const rows: OutcomeValueInput[] = [];
  const errors: { index: number; error: string }[] = [];
  parsed.values.forEach((v, i) => {
    const metric = byKey.get(v.metricKey);
    if (!metric) {
      errors.push({ index: i, error: `Unknown metric key "${v.metricKey}"` });
      return;
    }
    const isOrg = metric.grain === "org";
    const grainRef = (v.grainRef ?? "").trim();
    if (isOrg && grainRef) {
      errors.push({ index: i, error: `Metric "${v.metricKey}" is org-grain; omit grainRef` });
      return;
    }
    if (!isOrg && !grainRef) {
      errors.push({ index: i, error: `Metric "${v.metricKey}" requires grainRef (${metric.grain})` });
      return;
    }
    if (v.periodEnd < v.periodStart) {
      errors.push({ index: i, error: "periodEnd before periodStart" });
      return;
    }
    try {
      rows.push({
        metricId: metric.id,
        grainRef,
        periodStart: v.periodStart,
        periodEnd: v.periodEnd,
        value: parseScaledValue(String(v.value)),
        source: "api",
      });
    } catch (e) {
      errors.push({ index: i, error: e instanceof Error ? e.message : String(e) });
    }
  });

  if (errors.length > 0) {
    return NextResponse.json({ error: "Validation failed", errors, accepted: 0 }, { status: 422 });
  }

  const written = await withOrgContext(auth.orgId, async (tx) => upsertOutcomeValues(tx, auth.orgId, rows));
  return NextResponse.json({ accepted: written });
}
