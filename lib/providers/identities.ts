import { db } from "@/lib/db/client";
import { providerIdentities, developers, usageEvents } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

function looksLikeEmail(s: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);
}

function emailForLabel(orgId: string, label: string): string {
  if (looksLikeEmail(label)) return label.toLowerCase();
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  // Deterministic placeholder that satisfies developers' UNIQUE(org_id, email).
  return `${slug || "identity"}@imported.reckon.local`;
}

async function ensureDeveloperByLabel(
  orgId: string,
  label: string
): Promise<string> {
  const email = emailForLabel(orgId, label);
  const created = (
    await db
      .insert(developers)
      .values({ orgId, displayName: label, email })
      .onConflictDoNothing()
      .returning({ id: developers.id })
  )[0];
  if (created) return created.id;
  const found = (
    await db
      .select({ id: developers.id })
      .from(developers)
      .where(and(eq(developers.orgId, orgId), eq(developers.email, email)))
      .limit(1)
  )[0];
  if (!found) throw new Error(`Could not resolve developer for "${label}"`);
  return found.id;
}

/**
 * Resolve (and lazily upsert) the provider_identities row for a provider-side
 * identity, returning the developer_id it maps to — or null if unassigned.
 *
 * New identities are auto-linked to a developer only when we have a human
 * label (e.g. a GitHub login or email); opaque IDs (api_key_id, user_id) are
 * left unassigned for the admin to map in the UI. System-job context: uses the
 * RLS-bypassing owner connection, scoped explicitly by orgId.
 */
export async function resolveDeveloperForIdentity(opts: {
  orgId: string;
  providerId: string;
  externalId: string;
  label?: string;
}): Promise<string | null> {
  const { orgId, providerId, externalId, label } = opts;
  if (!externalId) return null; // aggregate/legacy rows stay unassigned

  const existing = (
    await db
      .select({
        id: providerIdentities.id,
        label: providerIdentities.label,
        developerId: providerIdentities.developerId,
      })
      .from(providerIdentities)
      .where(
        and(
          eq(providerIdentities.orgId, orgId),
          eq(providerIdentities.providerId, providerId),
          eq(providerIdentities.externalId, externalId)
        )
      )
      .limit(1)
  )[0];

  if (existing) {
    if (label && !existing.label) {
      await db
        .update(providerIdentities)
        .set({ label, updatedAt: new Date() })
        .where(eq(providerIdentities.id, existing.id));
    }
    return existing.developerId ?? null;
  }

  const developerId = label ? await ensureDeveloperByLabel(orgId, label) : null;
  await db
    .insert(providerIdentities)
    .values({ orgId, providerId, externalId, label: label ?? null, developerId })
    .onConflictDoNothing();

  if (developerId !== null) return developerId;

  // Lost an insert race — re-read.
  const row = (
    await db
      .select({ developerId: providerIdentities.developerId })
      .from(providerIdentities)
      .where(
        and(
          eq(providerIdentities.orgId, orgId),
          eq(providerIdentities.providerId, providerId),
          eq(providerIdentities.externalId, externalId)
        )
      )
      .limit(1)
  )[0];
  return row?.developerId ?? null;
}

/**
 * Assign a provider identity to a developer and back-fill the denormalized
 * developer_id on all of that identity's usage_events. Called from the mapping
 * UI when an admin (re)assigns an identity.
 */
export async function assignIdentityToDeveloper(opts: {
  orgId: string;
  providerId: string;
  externalId: string;
  developerId: string | null;
}): Promise<void> {
  const { orgId, providerId, externalId, developerId } = opts;

  await db
    .update(providerIdentities)
    .set({ developerId, updatedAt: new Date() })
    .where(
      and(
        eq(providerIdentities.orgId, orgId),
        eq(providerIdentities.providerId, providerId),
        eq(providerIdentities.externalId, externalId)
      )
    );

  await db
    .update(usageEvents)
    .set({ developerId, updatedAt: new Date() })
    .where(
      and(
        eq(usageEvents.orgId, orgId),
        eq(usageEvents.providerId, providerId),
        eq(usageEvents.externalIdentity, externalId)
      )
    );
}
