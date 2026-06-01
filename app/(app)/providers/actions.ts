"use server";

import { requireAdmin, requireUser } from "@/lib/auth";
import { inngest } from "@/lib/jobs/client";
import { withOrgContext } from "@/lib/db/rls";
import { db } from "@/lib/db/client";
import {
  developers,
  providerKeys,
  providers,
  organizations,
  providerIdentities,
  usageEvents,
  agents,
} from "@/lib/db/schema";
import { eq, and, sql, gte } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { encryptSecret, keyFingerprint } from "@/lib/encryption/envelope";
import { getProviderClient } from "@/lib/providers/registry";
import { ProviderAuthError } from "@/lib/providers/errors";
import { assignIdentityToDeveloper } from "@/lib/providers/identities";
import { subDays, format } from "date-fns";
import { PLAN_LIMITS, PlanLimitError } from "@/lib/plans/limits";

export async function triggerOrgIngestion() {
  const user = await requireAdmin();
  await inngest.send({
    name: "ingestion/org.requested",
    data: { org_id: user.orgId },
  });
  return { success: true };
}

const connectSchema = z.object({
  providerKey: z.string().min(1), // provider slug
  apiKey: z.string().min(1),
});

/**
 * Connect ONE org-wide admin key for a provider. Replaces any existing active
 * key for that provider in the org. Usage is broken down per provider-side
 * identity and attributed to developers downstream — no developer is chosen here.
 */
export async function connectOrgKey(formData: FormData) {
  const user = await requireAdmin();

  const parsed = connectSchema.parse({
    providerKey: formData.get("providerKey"),
    apiKey: formData.get("apiKey"),
  });

  const [provider] = await db
    .select()
    .from(providers)
    .where(eq(providers.key, parsed.providerKey))
    .limit(1);
  if (!provider) throw new Error("Unknown provider");

  // Plan limit: free = 1 provider.
  const [org] = await withOrgContext(user.orgId, async (tx) =>
    tx
      .select({ plan: organizations.plan })
      .from(organizations)
      .where(eq(organizations.id, user.orgId))
      .limit(1)
  );
  const limits = PLAN_LIMITS[org?.plan ?? "free"];
  if (limits.maxProviders < Infinity) {
    const existing = await withOrgContext(user.orgId, async (tx) =>
      tx
        .selectDistinct({ providerId: providerKeys.providerId })
        .from(providerKeys)
        .where(
          and(
            eq(providerKeys.orgId, user.orgId),
            eq(providerKeys.status, "active")
          )
        )
    );
    const ids = existing.map((p) => p.providerId);
    if (ids.length >= limits.maxProviders && !ids.includes(provider.id)) {
      throw new PlanLimitError(
        "Free plan supports 1 provider only. Upgrade to Pro for all providers.",
        "maxProviders"
      );
    }
  }

  // Validate the key against the provider before storing.
  const client = getProviderClient(parsed.providerKey);
  try {
    await client.fetchUsage({
      apiKey: parsed.apiKey,
      since: subDays(new Date(), 1),
      until: new Date(),
    });
  } catch (err) {
    if (err instanceof ProviderAuthError) {
      throw new Error(
        "Invalid key — the provider rejected it. Make sure it's an org Admin/usage key."
      );
    }
    // Transient errors are fine — ingestion will retry.
  }

  const encrypted = await encryptSecret(parsed.apiKey);
  const fingerprint = keyFingerprint(parsed.apiKey);

  // Replace any existing active key for this provider (one org key per provider).
  await db
    .update(providerKeys)
    .set({ status: "revoked", updatedAt: new Date() })
    .where(
      and(
        eq(providerKeys.orgId, user.orgId),
        eq(providerKeys.providerId, provider.id),
        eq(providerKeys.status, "active")
      )
    );

  const [newKey] = await db
    .insert(providerKeys)
    .values({
      orgId: user.orgId,
      developerId: null, // org-level key
      providerId: provider.id,
      encryptedKey: encrypted.ciphertext,
      encryptedDek: encrypted.encryptedDek,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      keyFingerprint: fingerprint,
    })
    .returning({ id: providerKeys.id });

  await inngest.send({
    name: "ingestion/provider-key.requested",
    data: {
      provider_key_id: newKey.id,
      since: subDays(new Date(), 30).toISOString(),
    },
  });

  revalidatePath("/providers");
  return { success: true };
}

export async function disconnectProvider(providerId: string) {
  const user = await requireAdmin();
  await db
    .update(providerKeys)
    .set({ status: "revoked", updatedAt: new Date() })
    .where(
      and(
        eq(providerKeys.orgId, user.orgId),
        eq(providerKeys.providerId, providerId),
        eq(providerKeys.status, "active")
      )
    );
  revalidatePath("/providers");
  return { success: true };
}

/** Discovered provider identities + their 30-day spend, for the mapping UI. */
export async function getProviderIdentities() {
  const user = await requireUser();
  const since = format(subDays(new Date(), 30), "yyyy-MM-dd");

  return withOrgContext(user.orgId, async (tx) => {
    const rows = await tx
      .select({
        id: providerIdentities.id,
        providerId: providerIdentities.providerId,
        providerName: providers.displayName,
        externalId: providerIdentities.externalId,
        label: providerIdentities.label,
        developerId: providerIdentities.developerId,
        agentId: providerIdentities.agentId,
      })
      .from(providerIdentities)
      .innerJoin(providers, eq(providerIdentities.providerId, providers.id))
      .where(eq(providerIdentities.orgId, user.orgId));

    const spend = await tx
      .select({
        providerId: usageEvents.providerId,
        externalIdentity: usageEvents.externalIdentity,
        cost: sql<bigint>`sum(${usageEvents.costUsdMicros})`.as("cost"),
      })
      .from(usageEvents)
      .where(
        and(
          eq(usageEvents.orgId, user.orgId),
          gte(usageEvents.timeBucket, since)
        )
      )
      .groupBy(usageEvents.providerId, usageEvents.externalIdentity);

    const costMap = new Map(
      spend.map((s) => [`${s.providerId}:${s.externalIdentity}`, String(s.cost)])
    );

    return rows
      .map((r) => ({
        ...r,
        cost30d: costMap.get(`${r.providerId}:${r.externalId}`) ?? "0",
      }))
      .sort((a, b) => Number(BigInt(b.cost30d) - BigInt(a.cost30d)));
  });
}

const assignSchema = z.object({
  providerId: z.string().uuid(),
  externalId: z.string().min(1),
  developerId: z.string().uuid().optional().or(z.literal("")),
  newDeveloperName: z.string().optional(),
  newDeveloperEmail: z.string().email().optional().or(z.literal("")),
});

/** Assign a provider identity to a developer (existing, new, or unassign). */
export async function assignIdentity(formData: FormData) {
  const user = await requireAdmin();
  const parsed = assignSchema.parse({
    providerId: formData.get("providerId"),
    externalId: formData.get("externalId"),
    developerId: formData.get("developerId") ?? "",
    newDeveloperName: formData.get("newDeveloperName") ?? "",
    newDeveloperEmail: formData.get("newDeveloperEmail") ?? "",
  });

  let developerId: string | null =
    parsed.developerId && parsed.developerId !== "" ? parsed.developerId : null;

  // Create a developer inline if requested.
  if (!developerId && parsed.newDeveloperName && parsed.newDeveloperEmail) {
    const created = await withOrgContext(user.orgId, async (tx) =>
      tx
        .insert(developers)
        .values({
          orgId: user.orgId,
          displayName: parsed.newDeveloperName!.trim(),
          email: parsed.newDeveloperEmail!.trim(),
        })
        .onConflictDoNothing()
        .returning({ id: developers.id })
    );
    developerId =
      created[0]?.id ??
      (
        await withOrgContext(user.orgId, async (tx) =>
          tx
            .select({ id: developers.id })
            .from(developers)
            .where(
              and(
                eq(developers.orgId, user.orgId),
                eq(developers.email, parsed.newDeveloperEmail!.trim())
              )
            )
            .limit(1)
        )
      )[0]?.id ??
      null;
  } else if (developerId) {
    // Verify ownership.
    const [owned] = await withOrgContext(user.orgId, async (tx) =>
      tx
        .select({ id: developers.id })
        .from(developers)
        .where(
          and(eq(developers.id, developerId!), eq(developers.orgId, user.orgId))
        )
        .limit(1)
    );
    if (!owned) throw new Error("Developer not found.");
  }

  await assignIdentityToDeveloper({
    orgId: user.orgId,
    providerId: parsed.providerId,
    externalId: parsed.externalId,
    developerId,
  });

  revalidatePath("/providers");
  revalidatePath("/dashboard");
  return { success: true };
}

// --- Agent mapping (Phase 8.2, Approach A) ---

/** Agents for the org, for the mapping dropdowns. */
export async function getAgents() {
  const user = await requireUser();
  return withOrgContext(user.orgId, async (tx) =>
    tx
      .select({ id: agents.id, name: agents.name, status: agents.status })
      .from(agents)
      .where(eq(agents.orgId, user.orgId))
      .orderBy(agents.name)
  );
}

/** Resolve an agentId from an existing id or an inline new-agent name. */
async function resolveAgentId(
  orgId: string,
  agentId: string,
  newAgentName: string
): Promise<string | null> {
  if (agentId && agentId !== "") {
    const [owned] = await withOrgContext(orgId, async (tx) =>
      tx
        .select({ id: agents.id })
        .from(agents)
        .where(and(eq(agents.id, agentId), eq(agents.orgId, orgId)))
        .limit(1)
    );
    if (!owned) throw new Error("Agent not found.");
    return owned.id;
  }
  if (newAgentName && newAgentName.trim()) {
    const [created] = await withOrgContext(orgId, async (tx) =>
      tx
        .insert(agents)
        .values({ orgId, name: newAgentName.trim() })
        .returning({ id: agents.id })
    );
    return created.id;
  }
  return null; // unassign
}

const assignAgentToIdentitySchema = z.object({
  identityId: z.string().uuid(),
  agentId: z.string().uuid().optional().or(z.literal("")),
  newAgentName: z.string().optional(),
});

/** Map a provider identity (a key/user/seat) to an agent, then recompute. */
export async function assignIdentityToAgent(formData: FormData) {
  const user = await requireAdmin();
  const parsed = assignAgentToIdentitySchema.parse({
    identityId: formData.get("identityId"),
    agentId: formData.get("agentId") ?? "",
    newAgentName: formData.get("newAgentName") ?? "",
  });

  const agentId = await resolveAgentId(
    user.orgId,
    parsed.agentId ?? "",
    parsed.newAgentName ?? ""
  );

  const updated = await withOrgContext(user.orgId, async (tx) =>
    tx
      .update(providerIdentities)
      .set({ agentId, updatedAt: new Date() })
      .where(
        and(
          eq(providerIdentities.id, parsed.identityId),
          eq(providerIdentities.orgId, user.orgId)
        )
      )
      .returning({ id: providerIdentities.id })
  );
  if (updated.length === 0) throw new Error("Identity not found.");

  await inngest.send({
    name: "attribution/recompute.requested",
    data: { org_id: user.orgId },
  });

  revalidatePath("/providers");
  return { success: true };
}

const assignAgentToDeveloperSchema = z.object({
  developerId: z.string().uuid(),
  agentId: z.string().uuid().optional().or(z.literal("")),
  newAgentName: z.string().optional(),
});

/** Map a developer to an agent, then recompute. */
export async function assignDeveloperToAgent(formData: FormData) {
  const user = await requireAdmin();
  const parsed = assignAgentToDeveloperSchema.parse({
    developerId: formData.get("developerId"),
    agentId: formData.get("agentId") ?? "",
    newAgentName: formData.get("newAgentName") ?? "",
  });

  const agentId = await resolveAgentId(
    user.orgId,
    parsed.agentId ?? "",
    parsed.newAgentName ?? ""
  );

  const updated = await withOrgContext(user.orgId, async (tx) =>
    tx
      .update(developers)
      .set({ agentId, updatedAt: new Date() })
      .where(
        and(
          eq(developers.id, parsed.developerId),
          eq(developers.orgId, user.orgId)
        )
      )
      .returning({ id: developers.id })
  );
  if (updated.length === 0) throw new Error("Developer not found.");

  await inngest.send({
    name: "attribution/recompute.requested",
    data: { org_id: user.orgId },
  });

  revalidatePath(`/developers/${parsed.developerId}`);
  revalidatePath("/providers");
  return { success: true };
}

/** Manual "recompute attribution" action for the whole org. */
export async function recomputeAttributionAction() {
  const user = await requireAdmin();
  await inngest.send({
    name: "attribution/recompute.requested",
    data: { org_id: user.orgId },
  });
  return { success: true };
}
