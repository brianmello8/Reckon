import { db } from "@/lib/db/client";
import {
  usageEvents,
  usageAttribution,
  workflows,
  workflowRuns,
  anomalies,
} from "@/lib/db/schema";
import { eq, and, between, sql, gte, lt, isNotNull } from "drizzle-orm";
import {
  SPIKE_STDDEV_MULTIPLIER,
  SUDDEN_INCREASE_MULTIPLIER,
  MIN_HISTORY_DAYS,
  DEDUP_WINDOW_HOURS,
  SEVERITY_INFO_MAX,
  SEVERITY_WARN_MAX,
  MIN_WORKFLOW_BASELINE_RUNS,
  MIN_WORKFLOW_RECENT_RUNS,
  MIN_WORKFLOW_ABS_CHANGE_MICROS,
} from "./config";
import { subHours, subDays, format } from "date-fns";
import type { NewAnomaly } from "./detect";

const BASELINE_DAYS = 28;

function computeSeverity(multiple: number): "info" | "warn" | "critical" {
  if (multiple >= SEVERITY_WARN_MAX) return "critical";
  if (multiple >= SEVERITY_INFO_MAX) return "warn";
  return "info";
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}
function stddev(xs: number[], m: number): number {
  if (xs.length < 2) return 0;
  return Math.sqrt(
    xs.reduce((a, b) => a + (b - m) * (b - m), 0) / (xs.length - 1)
  );
}
function argmax(byKey: Map<string, number>): string | null {
  let best: string | null = null;
  let bestV = -Infinity;
  for (const [k, v] of byKey) {
    if (v > bestV) {
      bestV = v;
      best = k;
    }
  }
  return best;
}

/**
 * Workflow cost-per-run anomaly detector (Phase 8.6). Reuses the per-developer
 * thresholding approach (spike: mean + N·stddev; sudden: N× baseline) applied
 * to each workflow's daily mean cost-per-run (= attributed daily cost / runs
 * started that day). Honors a baseline- and recent-runs floor so new/quiet
 * workflows don't alert on noise, and labels a likely cause from the data.
 */
export async function detectWorkflowAnomaliesForOrg(
  orgId: string
): Promise<NewAnomaly[]> {
  const now = new Date();
  const recentDay = format(subDays(now, 1), "yyyy-MM-dd");
  const baselineStart = format(subDays(now, 1 + BASELINE_DAYS), "yyyy-MM-dd");
  const runsFrom = new Date(`${baselineStart}T00:00:00.000Z`);
  const runsToExcl = new Date(`${recentDay}T00:00:00.000Z`);
  runsToExcl.setUTCDate(runsToExcl.getUTCDate() + 1);

  const wfRows = await db
    .select({ id: workflows.id, name: workflows.name })
    .from(workflows)
    .where(and(eq(workflows.orgId, orgId), eq(workflows.status, "active")));

  const dedupeAfter = subHours(now, DEDUP_WINDOW_HOURS);
  const out: NewAnomaly[] = [];

  for (const wf of wfRows) {
    // Per-(day, model) attributed cost + tokens for this workflow.
    const rows = await db
      .select({
        day: usageEvents.timeBucket,
        model: usageEvents.model,
        cost: sql<string>`coalesce(sum(${usageEvents.costUsdMicros}), 0)`,
        tokens: sql<string>`coalesce(sum(${usageEvents.inputTokens} + ${usageEvents.outputTokens}), 0)`,
      })
      .from(usageAttribution)
      .innerJoin(usageEvents, eq(usageEvents.id, usageAttribution.usageEventId))
      .where(
        and(
          eq(usageAttribution.orgId, orgId),
          eq(usageAttribution.workflowId, wf.id),
          between(usageEvents.timeBucket, baselineStart, recentDay)
        )
      )
      .groupBy(usageEvents.timeBucket, usageEvents.model);

    // Runs started per day.
    const runRows = await db
      .select({
        day: sql<string>`to_char(${workflowRuns.startedAt} at time zone 'UTC', 'YYYY-MM-DD')`,
        count: sql<number>`count(*)::int`,
      })
      .from(workflowRuns)
      .where(
        and(
          eq(workflowRuns.orgId, orgId),
          eq(workflowRuns.workflowId, wf.id),
          isNotNull(workflowRuns.startedAt),
          gte(workflowRuns.startedAt, runsFrom),
          lt(workflowRuns.startedAt, runsToExcl)
        )
      )
      .groupBy(sql`to_char(${workflowRuns.startedAt} at time zone 'UTC', 'YYYY-MM-DD')`);

    const runsByDay = new Map<string, number>();
    for (const r of runRows) runsByDay.set(r.day, Number(r.count));

    const costByDay = new Map<string, number>();
    const tokensByDay = new Map<string, number>();
    const recentModelCost = new Map<string, number>();
    const baselineModelCost = new Map<string, number>();
    for (const r of rows) {
      const c = Number(r.cost);
      const t = Number(r.tokens);
      costByDay.set(r.day, (costByDay.get(r.day) ?? 0) + c);
      tokensByDay.set(r.day, (tokensByDay.get(r.day) ?? 0) + t);
      if (r.day === recentDay) {
        recentModelCost.set(r.model, (recentModelCost.get(r.model) ?? 0) + c);
      } else {
        baselineModelCost.set(r.model, (baselineModelCost.get(r.model) ?? 0) + c);
      }
    }

    // Baseline: per-day mean cost-per-run over days (before recentDay) with runs.
    const baselineMeans: number[] = [];
    let baselineRunsTotal = 0;
    let baselineTokensTotal = 0;
    for (const [day, runs] of runsByDay) {
      if (day === recentDay || runs <= 0) continue;
      const cost = costByDay.get(day) ?? 0;
      baselineMeans.push(cost / runs);
      baselineRunsTotal += runs;
      baselineTokensTotal += tokensByDay.get(day) ?? 0;
    }

    const recentRuns = runsByDay.get(recentDay) ?? 0;

    // Floors: enough history and enough runs, recently and overall.
    if (
      baselineMeans.length < MIN_HISTORY_DAYS ||
      baselineRunsTotal < MIN_WORKFLOW_BASELINE_RUNS ||
      recentRuns < MIN_WORKFLOW_RECENT_RUNS
    ) {
      continue;
    }

    const recentMeanPerRun = (costByDay.get(recentDay) ?? 0) / recentRuns;
    const baselineMean = mean(baselineMeans);
    const baselineStd = stddev(baselineMeans, baselineMean);
    if (baselineMean <= 0 || recentMeanPerRun <= 0) continue;

    const spikeThreshold = baselineMean + SPIKE_STDDEV_MULTIPLIER * baselineStd;
    const isSpike =
      recentMeanPerRun > spikeThreshold &&
      recentMeanPerRun - baselineMean > MIN_WORKFLOW_ABS_CHANGE_MICROS;
    const isSudden =
      recentMeanPerRun > SUDDEN_INCREASE_MULTIPLIER * baselineMean &&
      recentMeanPerRun - baselineMean > MIN_WORKFLOW_ABS_CHANGE_MICROS;
    if (!isSpike && !isSudden) continue;

    // Dedup per workflow within the window.
    const [existing] = await db
      .select({ id: anomalies.id })
      .from(anomalies)
      .where(
        and(
          eq(anomalies.workflowId, wf.id),
          eq(anomalies.kind, "workflow_cost_per_run"),
          gte(anomalies.detectedAt, dedupeAfter)
        )
      )
      .limit(1);
    if (existing) continue;

    const multiple = recentMeanPerRun / baselineMean;

    // Likely cause from the data.
    const recentDominant = argmax(recentModelCost);
    const baselineDominant = argmax(baselineModelCost);
    const recentTokensPerRun = (tokensByDay.get(recentDay) ?? 0) / recentRuns;
    const baselineTokensPerRun =
      baselineRunsTotal > 0 ? baselineTokensTotal / baselineRunsTotal : 0;

    let likelyCause: string;
    if (recentDominant && baselineDominant && recentDominant !== baselineDominant) {
      likelyCause = "model_changed";
    } else if (
      baselineTokensPerRun > 0 &&
      recentTokensPerRun > 1.5 * baselineTokensPerRun
    ) {
      likelyCause = "run_length_grew";
    } else {
      likelyCause = "per_call_cost_grew";
    }

    out.push({
      orgId,
      workflowId: wf.id,
      kind: "workflow_cost_per_run",
      severity: computeSeverity(multiple),
      details: {
        workflowName: wf.name,
        baselineMeanCostPerRunMicros: Math.round(baselineMean),
        recentMeanCostPerRunMicros: Math.round(recentMeanPerRun),
        multiple: Math.round(multiple * 10) / 10,
        likelyCause,
        recentRunCount: recentRuns,
        recentDominantModel: recentDominant,
        baselineDominantModel: baselineDominant,
      },
    });
  }

  return out;
}
