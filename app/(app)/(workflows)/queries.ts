import { withOrgContext } from "@/lib/db/rls";
import {
  usageEvents,
  usageAttribution,
  workflows,
  workflowRuns,
  agents,
  providers,
} from "@/lib/db/schema";
import { and, eq, between, sql, isNotNull, desc, gte, lt } from "drizzle-orm";

/**
 * Workflows surface queries (Phase 8.5). All cost comes from usage_events via
 * usage_attribution — usage_events is never mutated. Cost basis:
 *  - workflow TOTAL cost: usage_events attributed to the workflow (workflow_id),
 *    incl. (model,day) buckets shared across runs.
 *  - per-RUN cost: only usage_events linked to a single run (workflow_run_id) —
 *    available when a run uniquely owned a (model,day). Runs without a unique
 *    bucket count toward run totals but not the per-run cost distribution
 *    (a consequence of daily-aggregate usage; see architecture §3b).
 */

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function runEndExclusive(to: string): Date {
  const d = new Date(`${to}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

type RunCost = { workflowId: string | null; runId: string; cost: number };

async function perRunCosts(
  tx: Parameters<Parameters<typeof withOrgContext>[1]>[0],
  orgId: string,
  from: string,
  to: string,
  workflowId?: string
): Promise<RunCost[]> {
  const rows = await tx
    .select({
      workflowId: workflowRuns.workflowId,
      runId: workflowRuns.id,
      cost: sql<string>`coalesce(sum(${usageEvents.costUsdMicros}), 0)`,
    })
    .from(workflowRuns)
    .leftJoin(
      usageAttribution,
      eq(usageAttribution.workflowRunId, workflowRuns.id)
    )
    .leftJoin(
      usageEvents,
      and(
        eq(usageEvents.id, usageAttribution.usageEventId),
        between(usageEvents.timeBucket, from, to)
      )
    )
    .where(
      and(
        eq(workflowRuns.orgId, orgId),
        workflowId ? eq(workflowRuns.workflowId, workflowId) : undefined,
        gte(workflowRuns.startedAt, new Date(`${from}T00:00:00.000Z`)),
        lt(workflowRuns.startedAt, runEndExclusive(to))
      )
    )
    .groupBy(workflowRuns.workflowId, workflowRuns.id);
  return rows.map((r) => ({
    workflowId: r.workflowId,
    runId: r.runId,
    cost: Number(r.cost ?? 0),
  }));
}

export async function getWorkflowsOverview(orgId: string, from: string, to: string) {
  return withOrgContext(orgId, async (tx) => {
    // Total attributed cost per workflow (by workflow_id).
    const costRows = await tx
      .select({
        workflowId: usageAttribution.workflowId,
        cost: sql<string>`coalesce(sum(${usageEvents.costUsdMicros}), 0)`,
      })
      .from(usageAttribution)
      .innerJoin(usageEvents, eq(usageEvents.id, usageAttribution.usageEventId))
      .where(
        and(
          eq(usageAttribution.orgId, orgId),
          isNotNull(usageAttribution.workflowId),
          between(usageEvents.timeBucket, from, to)
        )
      )
      .groupBy(usageAttribution.workflowId);
    const totalByWf = new Map(costRows.map((r) => [r.workflowId!, Number(r.cost)]));

    // Per-run costs in the period → run counts + per-run distributions.
    const runCosts = await perRunCosts(tx, orgId, from, to);
    const runsByWf = new Map<string, number[]>();
    for (const rc of runCosts) {
      if (!rc.workflowId) continue;
      (runsByWf.get(rc.workflowId) ?? runsByWf.set(rc.workflowId, []).get(rc.workflowId)!).push(rc.cost);
    }

    const wfRows = await tx
      .select({
        id: workflows.id,
        name: workflows.name,
        status: workflows.status,
        agentId: workflows.agentId,
        agentName: agents.name,
      })
      .from(workflows)
      .leftJoin(agents, eq(agents.id, workflows.agentId))
      .where(eq(workflows.orgId, orgId));

    return wfRows
      .map((w) => {
        const total = totalByWf.get(w.id) ?? 0;
        const costs = (runsByWf.get(w.id) ?? []).slice().sort((a, b) => a - b);
        const runCount = costs.length;
        const withCost = costs.filter((c) => c > 0).length;
        return {
          id: w.id,
          name: w.name,
          status: w.status,
          agentId: w.agentId,
          agentName: w.agentName,
          totalCostMicros: total,
          runCount,
          meanCostPerRun: runCount > 0 ? Math.round(total / runCount) : 0,
          p95CostPerRun: percentile(costs, 95),
          runsWithCost: withCost,
        };
      })
      .sort((a, b) => b.totalCostMicros - a.totalCostMicros);
  });
}

export async function getWorkflowDetail(
  orgId: string,
  workflowId: string,
  from: string,
  to: string
) {
  return withOrgContext(orgId, async (tx) => {
    const [wf] = await tx
      .select({
        id: workflows.id,
        name: workflows.name,
        status: workflows.status,
        agentId: workflows.agentId,
        agentName: agents.name,
      })
      .from(workflows)
      .leftJoin(agents, eq(agents.id, workflows.agentId))
      .where(and(eq(workflows.id, workflowId), eq(workflows.orgId, orgId)))
      .limit(1);
    if (!wf) return null;

    const [{ total }] = await tx
      .select({ total: sql<string>`coalesce(sum(${usageEvents.costUsdMicros}), 0)` })
      .from(usageAttribution)
      .innerJoin(usageEvents, eq(usageEvents.id, usageAttribution.usageEventId))
      .where(
        and(
          eq(usageAttribution.orgId, orgId),
          eq(usageAttribution.workflowId, workflowId),
          between(usageEvents.timeBucket, from, to)
        )
      );
    const totalCostMicros = Number(total ?? 0);

    // Cost over time (by day).
    const costByDay = await tx
      .select({
        date: usageEvents.timeBucket,
        cost: sql<string>`coalesce(sum(${usageEvents.costUsdMicros}), 0)`,
      })
      .from(usageAttribution)
      .innerJoin(usageEvents, eq(usageEvents.id, usageAttribution.usageEventId))
      .where(
        and(
          eq(usageAttribution.orgId, orgId),
          eq(usageAttribution.workflowId, workflowId),
          between(usageEvents.timeBucket, from, to)
        )
      )
      .groupBy(usageEvents.timeBucket)
      .orderBy(usageEvents.timeBucket);

    // Model breakdown.
    const byModel = await tx
      .select({
        model: usageEvents.model,
        cost: sql<string>`coalesce(sum(${usageEvents.costUsdMicros}), 0)`,
      })
      .from(usageAttribution)
      .innerJoin(usageEvents, eq(usageEvents.id, usageAttribution.usageEventId))
      .where(
        and(
          eq(usageAttribution.orgId, orgId),
          eq(usageAttribution.workflowId, workflowId),
          between(usageEvents.timeBucket, from, to)
        )
      )
      .groupBy(usageEvents.model)
      .orderBy(desc(sql`sum(${usageEvents.costUsdMicros})`));

    // Run explorer (with per-run cost) + per-run distribution.
    const runCosts = await perRunCosts(tx, orgId, from, to, workflowId);
    const costById = new Map(runCosts.map((r) => [r.runId, r.cost]));
    const sorted = runCosts.map((r) => r.cost).sort((a, b) => a - b);

    const runRows = await tx
      .select({
        id: workflowRuns.id,
        externalRunId: workflowRuns.externalRunId,
        startedAt: workflowRuns.startedAt,
        status: workflowRuns.status,
        customerRef: workflowRuns.customerRef,
      })
      .from(workflowRuns)
      .where(
        and(
          eq(workflowRuns.orgId, orgId),
          eq(workflowRuns.workflowId, workflowId),
          gte(workflowRuns.startedAt, new Date(`${from}T00:00:00.000Z`)),
          lt(workflowRuns.startedAt, runEndExclusive(to))
        )
      )
      .orderBy(desc(workflowRuns.startedAt))
      .limit(100);

    return {
      workflow: wf,
      totalCostMicros,
      runCount: runCosts.length,
      meanCostPerRun:
        runCosts.length > 0 ? Math.round(totalCostMicros / runCosts.length) : 0,
      p50: percentile(sorted, 50),
      p95: percentile(sorted, 95),
      max: sorted.length ? sorted[sorted.length - 1] : 0,
      runsWithCost: sorted.filter((c) => c > 0).length,
      costByDay: costByDay.map((r) => ({ date: r.date, cost: Number(r.cost) })),
      byModel: byModel.map((r) => ({ model: r.model, cost: Number(r.cost) })),
      perRunCosts: sorted,
      runs: runRows.map((r) => ({
        id: r.id,
        externalRunId: r.externalRunId,
        startedAt: r.startedAt ? r.startedAt.toISOString() : null,
        status: r.status,
        customerRef: r.customerRef,
        costMicros: costById.get(r.id) ?? 0,
      })),
    };
  });
}

/** usage_events linked to one run (for the run-explorer drill-down). */
export async function getRunEvents(orgId: string, runId: string) {
  return withOrgContext(orgId, async (tx) => {
    return tx
      .select({
        id: usageEvents.id,
        day: usageEvents.timeBucket,
        model: usageEvents.model,
        providerName: providers.displayName,
        inputTokens: usageEvents.inputTokens,
        outputTokens: usageEvents.outputTokens,
        costMicros: usageEvents.costUsdMicros,
      })
      .from(usageAttribution)
      .innerJoin(usageEvents, eq(usageEvents.id, usageAttribution.usageEventId))
      .innerJoin(providers, eq(providers.id, usageEvents.providerId))
      .where(
        and(
          eq(usageAttribution.orgId, orgId),
          eq(usageAttribution.workflowRunId, runId)
        )
      )
      .orderBy(desc(usageEvents.timeBucket));
  });
}

/** Roll workflows up by agent. */
export async function getAgentsOverview(orgId: string, from: string, to: string) {
  return withOrgContext(orgId, async (tx) => {
    const rows = await tx
      .select({
        agentId: agents.id,
        agentName: agents.name,
        cost: sql<string>`coalesce(sum(${usageEvents.costUsdMicros}), 0)`,
        workflowCount: sql<number>`count(distinct ${usageAttribution.workflowId})`,
      })
      .from(usageAttribution)
      .innerJoin(usageEvents, eq(usageEvents.id, usageAttribution.usageEventId))
      .innerJoin(agents, eq(agents.id, usageAttribution.agentId))
      .where(
        and(
          eq(usageAttribution.orgId, orgId),
          between(usageEvents.timeBucket, from, to)
        )
      )
      .groupBy(agents.id, agents.name)
      .orderBy(desc(sql`sum(${usageEvents.costUsdMicros})`));
    return rows.map((r) => ({
      agentId: r.agentId,
      agentName: r.agentName,
      costMicros: Number(r.cost),
      workflowCount: Number(r.workflowCount),
    }));
  });
}

/** Cost per end-customer (customer_ref). */
export async function getCustomerCosts(orgId: string, from: string, to: string) {
  return withOrgContext(orgId, async (tx) => {
    const rows = await tx
      .select({
        customerRef: usageAttribution.customerRef,
        cost: sql<string>`coalesce(sum(${usageEvents.costUsdMicros}), 0)`,
      })
      .from(usageAttribution)
      .innerJoin(usageEvents, eq(usageEvents.id, usageAttribution.usageEventId))
      .where(
        and(
          eq(usageAttribution.orgId, orgId),
          isNotNull(usageAttribution.customerRef),
          between(usageEvents.timeBucket, from, to)
        )
      )
      .groupBy(usageAttribution.customerRef)
      .orderBy(desc(sql`sum(${usageEvents.costUsdMicros})`));
    return rows.map((r) => ({
      customerRef: r.customerRef!,
      costMicros: Number(r.cost),
    }));
  });
}
