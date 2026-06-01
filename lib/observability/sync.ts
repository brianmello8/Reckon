import { db } from "@/lib/db/client";
import {
  observabilityConnections,
  workflows,
  workflowRuns,
  usageEvents,
  usageAttribution,
} from "@/lib/db/schema";
import { and, eq, gte, lte } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { getObservabilityConnector } from "./registry";
import { decryptCredentials } from "./credentials";
import { getOrCreateObservabilitySource } from "@/lib/attribution/observability";
import type { ObservabilityRun } from "./types";

type ConnectionRow = typeof observabilityConnections.$inferSelect;

export interface SyncStats {
  runs: number;
  workflowsTouched: number;
  generations: number;
  usageEventsInWindow: number;
  usageEventsMatched: number;
  usageEventMatchPct: number;
  runsLinked: number;
}

/**
 * Sync one observability connection (Phase 8.3). Pulls run METADATA, upserts
 * workflows/workflow_runs, and joins generations to usage_events at the
 * (model, day) grain — because provider usage APIs report daily aggregates, a
 * generation cannot be matched to a per-call row. A usage_event (a model's
 * spend for one day) is attributed only when exactly one workflow claims that
 * (model, day); ambiguous days are left unattributed (no guessing) and surface
 * in attribution coverage. Idempotent; never mutates usage_events; reads
 * metadata only. Returns match-rate stats for logging.
 */
export async function syncObservabilityConnection(
  conn: ConnectionRow
): Promise<SyncStats> {
  const connector = getObservabilityConnector(conn.provider);
  const credentials = await decryptCredentials(conn);

  const since = conn.lastSyncedAt
    ? new Date(conn.lastSyncedAt)
    : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30-day backfill

  const runs = await connector.listRuns({
    baseUrl: conn.baseUrl,
    credentials,
    since,
  });

  const sourceId = await getOrCreateObservabilitySource(
    conn.orgId,
    conn.id,
    conn.provider
  );

  // 1) Upsert workflows (by name) and workflow_runs (by external_run_id).
  const workflowIdByName = new Map<string, string>();
  const runIdByExternal = new Map<string, string>();
  const workflowIdByRun = new Map<string, string>(); // external_run_id -> workflowId
  let generationCount = 0;

  for (const run of runs) {
    const workflowId = await upsertWorkflow(conn.orgId, run.workflow_name, workflowIdByName);
    const runId = await upsertRun(conn.orgId, workflowId, run);
    runIdByExternal.set(run.external_run_id, runId);
    workflowIdByRun.set(run.external_run_id, workflowId);
    generationCount += run.generations.length;
  }

  // 2) Build (model, day) -> claiming workflows/runs from generations.
  const wfClaims = new Map<string, Set<string>>(); // key -> workflowIds
  const runClaims = new Map<string, Set<string>>(); // key -> runIds
  const customerByRun = new Map<string, string | null>();

  for (const run of runs) {
    const runId = runIdByExternal.get(run.external_run_id)!;
    const workflowId = workflowIdByRun.get(run.external_run_id)!;
    customerByRun.set(runId, run.customer_ref ?? null);
    for (const gen of run.generations) {
      const day = (gen.timestamp || "").slice(0, 10);
      if (!day) continue;
      const key = `${gen.model}|${day}`;
      (wfClaims.get(key) ?? wfClaims.set(key, new Set()).get(key)!).add(workflowId);
      (runClaims.get(key) ?? runClaims.set(key, new Set()).get(key)!).add(runId);
    }
  }

  // 3) Attribute usage_events in the window, at (model, day) grain.
  const days = [...wfClaims.keys()].map((k) => k.split("|")[1]).sort();
  if (days.length === 0) {
    await markSynced(conn.id);
    return emptyStats(runs.length, workflowIdByName.size, generationCount);
  }
  const minDay = days[0];
  const maxDay = days[days.length - 1];

  const events = await db
    .select({
      id: usageEvents.id,
      model: usageEvents.model,
      day: usageEvents.timeBucket,
    })
    .from(usageEvents)
    .where(
      and(
        eq(usageEvents.orgId, conn.orgId),
        gte(usageEvents.timeBucket, minDay),
        lte(usageEvents.timeBucket, maxDay)
      )
    );

  // Workflow -> agent (so observability can also set agent when known).
  const wfAgent = new Map<string, string | null>();
  if (workflowIdByName.size > 0) {
    const wfRows = await db
      .select({ id: workflows.id, agentId: workflows.agentId })
      .from(workflows)
      .where(eq(workflows.orgId, conn.orgId));
    for (const w of wfRows) wfAgent.set(w.id, w.agentId);
  }

  let matched = 0;
  let runsLinked = 0;
  for (const ev of events) {
    const key = `${ev.model}|${ev.day}`;
    const wfSet = wfClaims.get(key);
    if (!wfSet || wfSet.size !== 1) continue; // unmatched or ambiguous → skip
    const workflowId = [...wfSet][0];
    const runSet = runClaims.get(key)!;
    const singleRunId = runSet.size === 1 ? [...runSet][0] : null;
    const agentId = wfAgent.get(workflowId) ?? null;
    const customerRef = singleRunId ? customerByRun.get(singleRunId) ?? null : null;

    await db
      .insert(usageAttribution)
      .values({
        orgId: conn.orgId,
        usageEventId: ev.id,
        agentId,
        workflowId,
        workflowRunId: singleRunId,
        customerRef,
        attributionSourceId: sourceId,
        confidence: "inferred",
      })
      .onConflictDoUpdate({
        target: [usageAttribution.orgId, usageAttribution.usageEventId],
        // Fill workflow info; preserve an existing (e.g. key_mapping) agent.
        set: {
          workflowId,
          workflowRunId: singleRunId,
          customerRef,
          agentId: sql`coalesce(${usageAttribution.agentId}, ${agentId})`,
          attributionSourceId: sourceId,
          confidence: "inferred",
          computedAt: new Date(),
        },
      });
    matched += 1;
    if (singleRunId) runsLinked += 1;
  }

  await markSynced(conn.id);

  const stats: SyncStats = {
    runs: runs.length,
    workflowsTouched: workflowIdByName.size,
    generations: generationCount,
    usageEventsInWindow: events.length,
    usageEventsMatched: matched,
    usageEventMatchPct:
      events.length > 0 ? Math.round((matched / events.length) * 1000) / 10 : 0,
    runsLinked,
  };
  console.log(
    `[observability:${conn.provider}] conn=${conn.id} runs=${stats.runs} ` +
      `usage matched=${stats.usageEventsMatched}/${stats.usageEventsInWindow} ` +
      `(${stats.usageEventMatchPct}%) runs linked=${stats.runsLinked}`
  );
  return stats;
}

// Workflow names come from a customer-controlled label (trace name / session
// id). Treat as a label only and clamp length so an accidental free-text value
// can't carry meaningful content (architecture §3b, metadata-only rule).
const MAX_WORKFLOW_NAME = 200;

async function upsertWorkflow(
  orgId: string,
  rawName: string,
  cache: Map<string, string>
): Promise<string> {
  const name = (rawName || "untitled").slice(0, MAX_WORKFLOW_NAME);
  const cached = cache.get(name);
  if (cached) return cached;

  const existing = await db
    .select({ id: workflows.id })
    .from(workflows)
    .where(and(eq(workflows.orgId, orgId), eq(workflows.name, name)))
    .limit(1);
  let id = existing[0]?.id;
  if (!id) {
    const [created] = await db
      .insert(workflows)
      .values({ orgId, name })
      .returning({ id: workflows.id });
    id = created.id;
  }
  cache.set(name, id);
  return id;
}

async function upsertRun(
  orgId: string,
  workflowId: string,
  run: ObservabilityRun
): Promise<string> {
  const existing = await db
    .select({ id: workflowRuns.id })
    .from(workflowRuns)
    .where(
      and(
        eq(workflowRuns.orgId, orgId),
        eq(workflowRuns.workflowId, workflowId),
        eq(workflowRuns.externalRunId, run.external_run_id)
      )
    )
    .limit(1);

  const values = {
    startedAt: run.started_at ? new Date(run.started_at) : null,
    endedAt: run.ended_at ? new Date(run.ended_at) : null,
    status: run.status,
    customerRef: run.customer_ref ?? null,
  };

  if (existing[0]) {
    await db
      .update(workflowRuns)
      .set(values)
      .where(eq(workflowRuns.id, existing[0].id));
    return existing[0].id;
  }
  const [created] = await db
    .insert(workflowRuns)
    .values({
      orgId,
      workflowId,
      externalRunId: run.external_run_id,
      ...values,
    })
    .returning({ id: workflowRuns.id });
  return created.id;
}

async function markSynced(connectionId: string) {
  await db
    .update(observabilityConnections)
    .set({ lastSyncedAt: new Date(), lastError: null, status: "active", updatedAt: new Date() })
    .where(eq(observabilityConnections.id, connectionId));
}

function emptyStats(
  runs: number,
  workflowsTouched: number,
  generations: number
): SyncStats {
  return {
    runs,
    workflowsTouched,
    generations,
    usageEventsInWindow: 0,
    usageEventsMatched: 0,
    usageEventMatchPct: 0,
    runsLinked: 0,
  };
}
