"use server";

import { requireSurface } from "@/lib/auth";
import { withOrgContext } from "@/lib/db/rls";
import {
  outcomeMetrics,
  outcomeValues,
  ingestTokens,
  workflows,
  productLines,
  workflowRuns,
  usageAttribution,
} from "@/lib/db/schema";
import { and, eq, desc, sql, isNotNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  parseScaledValue,
  formatScaledValue,
  upsertOutcomeValues,
  type OutcomeValueInput,
} from "@/lib/outcomes/ingest";
import { generateIngestToken } from "@/lib/tokens/ingest-token";

const GRAINS = ["customer", "product_line", "workflow", "org"] as const;
const metricSchema = z.object({
  key: z.string().min(1).max(64).regex(/^[a-z0-9_]+$/, "lowercase letters, digits, underscore"),
  name: z.string().min(1).max(120),
  unit: z.string().min(1).max(64),
  grain: z.enum(GRAINS),
  direction: z.enum(["higher_is_better", "lower_is_better"]),
});

const dateRe = /^\d{4}-\d{2}-\d{2}$/;

export async function getOutcomesView() {
  const user = await requireSurface("finance");
  return withOrgContext(user.orgId, async (tx) => {
    const metrics = await tx
      .select()
      .from(outcomeMetrics)
      .where(eq(outcomeMetrics.orgId, user.orgId))
      .orderBy(desc(outcomeMetrics.createdAt));

    const valueCounts = await tx
      .select({ metricId: outcomeValues.metricId, n: sql<number>`count(*)`.as("n") })
      .from(outcomeValues)
      .where(eq(outcomeValues.orgId, user.orgId))
      .groupBy(outcomeValues.metricId);
    const countByMetric = new Map(valueCounts.map((c) => [c.metricId, Number(c.n)]));

    const recentValues = await tx
      .select()
      .from(outcomeValues)
      .where(eq(outcomeValues.orgId, user.orgId))
      .orderBy(desc(outcomeValues.periodStart))
      .limit(200);

    const tokens = await tx
      .select({
        id: ingestTokens.id,
        name: ingestTokens.name,
        tokenPrefix: ingestTokens.tokenPrefix,
        status: ingestTokens.status,
        lastUsedAt: ingestTokens.lastUsedAt,
        createdAt: ingestTokens.createdAt,
      })
      .from(ingestTokens)
      .where(eq(ingestTokens.orgId, user.orgId))
      .orderBy(desc(ingestTokens.createdAt));

    // Grain-ref pickers.
    const wfs = await tx
      .select({ id: workflows.id, name: workflows.name })
      .from(workflows)
      .where(eq(workflows.orgId, user.orgId));
    const pls = await tx
      .select({ id: productLines.id, code: productLines.code, name: productLines.name })
      .from(productLines)
      .where(eq(productLines.orgId, user.orgId));
    const custFromRuns = await tx
      .selectDistinct({ ref: workflowRuns.customerRef })
      .from(workflowRuns)
      .where(and(eq(workflowRuns.orgId, user.orgId), isNotNull(workflowRuns.customerRef)));
    const custFromAttr = await tx
      .selectDistinct({ ref: usageAttribution.customerRef })
      .from(usageAttribution)
      .where(and(eq(usageAttribution.orgId, user.orgId), isNotNull(usageAttribution.customerRef)));
    const customers = Array.from(
      new Set([...custFromRuns, ...custFromAttr].map((r) => r.ref).filter((r): r is string => !!r))
    ).sort();

    const metricById = new Map(metrics.map((m) => [m.id, m]));
    const grainLabel = (grain: string, ref: string) => {
      if (grain === "org") return "Org";
      if (grain === "workflow") return wfs.find((w) => w.id === ref)?.name ?? ref;
      if (grain === "product_line") {
        const p = pls.find((x) => x.id === ref);
        return p ? `${p.code} · ${p.name}` : ref;
      }
      return ref; // customer
    };

    return {
      metrics: metrics.map((m) => ({
        id: m.id,
        key: m.key,
        name: m.name,
        unit: m.unit,
        grain: m.grain,
        direction: m.direction,
        valueCount: countByMetric.get(m.id) ?? 0,
      })),
      values: recentValues.map((v) => {
        const m = metricById.get(v.metricId);
        return {
          id: v.id,
          metricId: v.metricId,
          metricName: m?.name ?? "—",
          unit: m?.unit ?? "",
          grain: m?.grain ?? "org",
          grainRef: v.grainRef,
          grainLabel: grainLabel(m?.grain ?? "org", v.grainRef),
          periodStart: v.periodStart,
          periodEnd: v.periodEnd,
          value: formatScaledValue(v.value),
          source: v.source,
        };
      }),
      tokens: tokens.map((t) => ({
        id: t.id,
        name: t.name,
        tokenPrefix: t.tokenPrefix,
        status: t.status,
        lastUsedAt: t.lastUsedAt ? t.lastUsedAt.toISOString() : null,
        createdAt: t.createdAt.toISOString(),
      })),
      pickers: {
        workflows: wfs,
        productLines: pls.map((p) => ({ id: p.id, label: `${p.code} · ${p.name}` })),
        customers,
      },
    };
  });
}

export async function createMetricAction(input: z.input<typeof metricSchema>) {
  const user = await requireSurface("finance");
  const m = metricSchema.parse(input);
  await withOrgContext(user.orgId, async (tx) => {
    await tx
      .insert(outcomeMetrics)
      .values({ orgId: user.orgId, ...m })
      .onConflictDoUpdate({
        target: [outcomeMetrics.orgId, outcomeMetrics.key],
        set: { name: m.name, unit: m.unit, grain: m.grain, direction: m.direction, updatedAt: new Date() },
      });
  });
  revalidatePath("/finance/outcomes");
  return { success: true };
}

export async function deleteMetricAction(metricId: string) {
  const user = await requireSurface("finance");
  await withOrgContext(user.orgId, async (tx) => {
    await tx
      .delete(outcomeValues)
      .where(and(eq(outcomeValues.orgId, user.orgId), eq(outcomeValues.metricId, metricId)));
    await tx
      .delete(outcomeMetrics)
      .where(and(eq(outcomeMetrics.orgId, user.orgId), eq(outcomeMetrics.id, metricId)));
  });
  revalidatePath("/finance/outcomes");
  return { success: true };
}

/** Build & validate value rows against the metric's grain, then upsert. Shared
 * by manual entry (one row) and CSV upload (many rows). */
async function ingestRows(
  orgId: string,
  metricId: string,
  raw: { grainRef: string; periodStart: string; periodEnd: string; value: string }[],
  source: "manual" | "csv"
) {
  return withOrgContext(orgId, async (tx) => {
    const [metric] = await tx
      .select({ id: outcomeMetrics.id, grain: outcomeMetrics.grain })
      .from(outcomeMetrics)
      .where(and(eq(outcomeMetrics.orgId, orgId), eq(outcomeMetrics.id, metricId)))
      .limit(1);
    if (!metric) throw new Error("Metric not found.");
    const isOrg = metric.grain === "org";

    const rows: OutcomeValueInput[] = raw.map((r, i) => {
      const grainRef = isOrg ? "" : (r.grainRef ?? "").trim();
      if (!isOrg && !grainRef) throw new Error(`Row ${i + 1}: ${metric.grain} grain requires a reference.`);
      if (!dateRe.test(r.periodStart) || !dateRe.test(r.periodEnd))
        throw new Error(`Row ${i + 1}: dates must be yyyy-mm-dd.`);
      if (r.periodEnd < r.periodStart) throw new Error(`Row ${i + 1}: period end before start.`);
      return {
        metricId,
        grainRef,
        periodStart: r.periodStart,
        periodEnd: r.periodEnd,
        value: parseScaledValue(r.value),
        source,
      };
    });
    return upsertOutcomeValues(tx, orgId, rows);
  });
}

export async function upsertManualValueAction(input: {
  metricId: string;
  grainRef: string;
  periodStart: string;
  periodEnd: string;
  value: string;
}) {
  const user = await requireSurface("finance");
  await ingestRows(user.orgId, input.metricId, [input], "manual");
  revalidatePath("/finance/outcomes");
  return { success: true };
}

export async function bulkUpsertValuesAction(input: {
  metricId: string;
  rows: { grainRef: string; periodStart: string; periodEnd: string; value: string }[];
}) {
  const user = await requireSurface("finance");
  if (input.rows.length === 0) throw new Error("No rows to import.");
  if (input.rows.length > 1000) throw new Error("Import at most 1000 rows at a time.");
  const n = await ingestRows(user.orgId, input.metricId, input.rows, "csv");
  revalidatePath("/finance/outcomes");
  return { success: true, count: n };
}

export async function createTokenAction(name: string) {
  const user = await requireSurface("finance");
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Token name required.");
  const { plaintext, tokenHash, tokenPrefix } = generateIngestToken();
  await withOrgContext(user.orgId, async (tx) => {
    await tx.insert(ingestTokens).values({
      orgId: user.orgId,
      name: trimmed,
      tokenHash,
      tokenPrefix,
      scope: "outcomes",
      createdByUserId: user.userId,
    });
  });
  revalidatePath("/finance/outcomes");
  // Plaintext returned ONCE — never stored, never shown again.
  return { success: true, plaintext };
}

export async function revokeTokenAction(tokenId: string) {
  const user = await requireSurface("finance");
  await withOrgContext(user.orgId, async (tx) => {
    await tx
      .update(ingestTokens)
      .set({ status: "revoked" })
      .where(and(eq(ingestTokens.orgId, user.orgId), eq(ingestTokens.id, tokenId)));
  });
  revalidatePath("/finance/outcomes");
  return { success: true };
}
