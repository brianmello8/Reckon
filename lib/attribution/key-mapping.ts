import { db } from "@/lib/db/client";
import {
  attributionSources,
  developers,
  providerIdentities,
  usageAttribution,
} from "@/lib/db/schema";
import { and, eq, sql } from "drizzle-orm";

/**
 * Approach A attribution (Phase 8.2): map a provider identity (each API key /
 * user / seat) — or a developer — to an agent, and derive usage_attribution
 * from that mapping. This NEVER touches usage_events; attribution is derived
 * and recomputable (architecture §3a).
 *
 * Resolution precedence for a usage_event: the identity mapping wins; if the
 * identity is unmapped, the event's developer mapping applies; otherwise the
 * event is left unattributed (no row).
 *
 * These functions run in system/worker contexts (no RLS) and are always scoped
 * explicitly by orgId, matching the ingestion worker convention.
 */

const KEY_MAPPING_LABEL = "Key & developer → agent mapping";

/**
 * The single key_mapping attribution_source for an org. Created on first use.
 * (attribution_sources allows many rows per type in general — e.g. multiple
 * observability connections — but key_mapping is a single org-level source.)
 */
export async function getOrCreateKeyMappingSource(
  orgId: string
): Promise<string> {
  const existing = await db
    .select({ id: attributionSources.id })
    .from(attributionSources)
    .where(
      and(
        eq(attributionSources.orgId, orgId),
        eq(attributionSources.sourceType, "key_mapping")
      )
    )
    .orderBy(attributionSources.createdAt)
    .limit(1);
  if (existing[0]) return existing[0].id;

  const [created] = await db
    .insert(attributionSources)
    .values({ orgId, sourceType: "key_mapping", label: KEY_MAPPING_LABEL })
    .returning({ id: attributionSources.id });
  return created.id;
}

/**
 * Resolve the agent for a single ingested event from its identity/developer
 * mappings. Identity mapping wins; developer mapping is the fallback.
 */
export async function resolveAgentIdForEvent(params: {
  orgId: string;
  providerId: string;
  externalIdentity: string;
  developerId: string | null;
}): Promise<string | null> {
  const { orgId, providerId, externalIdentity, developerId } = params;

  if (externalIdentity) {
    const [identity] = await db
      .select({ agentId: providerIdentities.agentId })
      .from(providerIdentities)
      .where(
        and(
          eq(providerIdentities.orgId, orgId),
          eq(providerIdentities.providerId, providerId),
          eq(providerIdentities.externalId, externalIdentity)
        )
      )
      .limit(1);
    if (identity?.agentId) return identity.agentId;
  }

  if (developerId) {
    const [dev] = await db
      .select({ agentId: developers.agentId })
      .from(developers)
      .where(eq(developers.id, developerId))
      .limit(1);
    if (dev?.agentId) return dev.agentId;
  }

  return null;
}

/**
 * Write (or replace) the key_mapping attribution row for one usage_event.
 * Idempotent via the unique (org_id, usage_event_id) index. Used inline at
 * ingest when a mapping exists.
 */
export async function upsertEventAttribution(params: {
  orgId: string;
  usageEventId: string;
  agentId: string;
  sourceId: string;
}): Promise<void> {
  const { orgId, usageEventId, agentId, sourceId } = params;
  await db
    .insert(usageAttribution)
    .values({
      orgId,
      usageEventId,
      agentId,
      attributionSourceId: sourceId,
      confidence: "exact",
    })
    .onConflictDoUpdate({
      target: [usageAttribution.orgId, usageAttribution.usageEventId],
      set: {
        agentId,
        workflowId: null,
        workflowRunId: null,
        customerRef: null,
        attributionSourceId: sourceId,
        confidence: "exact",
        computedAt: new Date(),
      },
    });
}

/**
 * Recompute ALL key_mapping attribution for an org: delete the org's existing
 * key_mapping rows, then reinsert one per usage_event that resolves to an agent
 * (identity mapping first, developer mapping as fallback). Fully idempotent —
 * re-running yields identical row counts — and consistent with the §3a
 * delete+reinsert recompute strategy. Returns the number of attributed events.
 */
export async function recomputeOrgKeyMappingAttribution(
  orgId: string
): Promise<{ attributed: number }> {
  const sourceId = await getOrCreateKeyMappingSource(orgId);

  // Delete every key_mapping-sourced row for the org (any key_mapping source,
  // in case duplicates ever exist), leaving observability/sdk rows untouched.
  await db.execute(sql`
    DELETE FROM usage_attribution ua
    WHERE ua.org_id = ${orgId}
      AND ua.attribution_source_id IN (
        SELECT id FROM attribution_sources
        WHERE org_id = ${orgId} AND source_type = 'key_mapping'
      )
  `);

  // Reinsert for all events that now resolve to an agent.
  // COALESCE(identity.agent_id, developer.agent_id) encodes the precedence.
  await db.execute(sql`
    INSERT INTO usage_attribution
      (org_id, usage_event_id, agent_id, attribution_source_id, confidence)
    SELECT ue.org_id, ue.id, COALESCE(pi.agent_id, dev.agent_id), ${sourceId}, 'exact'
    FROM usage_events ue
    LEFT JOIN provider_identities pi
      ON pi.org_id = ue.org_id
      AND pi.provider_id = ue.provider_id
      AND pi.external_id = ue.external_identity
    LEFT JOIN developers dev ON dev.id = ue.developer_id
    WHERE ue.org_id = ${orgId}
      AND COALESCE(pi.agent_id, dev.agent_id) IS NOT NULL
    ON CONFLICT (org_id, usage_event_id) DO UPDATE SET
      agent_id = EXCLUDED.agent_id,
      workflow_id = NULL,
      workflow_run_id = NULL,
      customer_ref = NULL,
      attribution_source_id = EXCLUDED.attribution_source_id,
      confidence = EXCLUDED.confidence,
      computed_at = now()
  `);

  const [{ count }] = (await db.execute(sql`
    SELECT count(*)::int AS count FROM usage_attribution
    WHERE org_id = ${orgId} AND attribution_source_id = ${sourceId}
  `)) as unknown as Array<{ count: number }>;

  return { attributed: count };
}
