import { db } from "@/lib/db/client";
import { attributionSources } from "@/lib/db/schema";
import { and, eq, sql } from "drizzle-orm";

/**
 * One attribution_sources row per observability connection (source_type =
 * observability), so each derived row is traceable to the connection that
 * produced it (architecture §3b). config carries the connectionId + provider.
 */
export async function getOrCreateObservabilitySource(
  orgId: string,
  connectionId: string,
  provider: string
): Promise<string> {
  const existing = await db
    .select({ id: attributionSources.id })
    .from(attributionSources)
    .where(
      and(
        eq(attributionSources.orgId, orgId),
        eq(attributionSources.sourceType, "observability"),
        sql`${attributionSources.config}->>'connectionId' = ${connectionId}`
      )
    )
    .orderBy(attributionSources.createdAt)
    .limit(1);
  if (existing[0]) return existing[0].id;

  const [created] = await db
    .insert(attributionSources)
    .values({
      orgId,
      sourceType: "observability",
      label: `Observability — ${provider}`,
      config: { connectionId, provider },
    })
    .returning({ id: attributionSources.id });
  return created.id;
}
