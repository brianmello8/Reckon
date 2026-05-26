"use server";

import { requireUser } from "@/lib/auth";
import { withOrgContext } from "@/lib/db/rls";
import { developers, providerKeys, providers } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import {
  encryptSecret,
  keyFingerprint,
} from "@/lib/encryption/envelope";
import { getProviderClient } from "@/lib/providers/registry";
import { ProviderAuthError } from "@/lib/providers/errors";
import { subDays } from "date-fns";
import { db } from "@/lib/db/client";

const addKeySchema = z.object({
  developerId: z.string().uuid(),
  providerKey: z.string().min(1), // the provider's slug: "anthropic", "openai", etc.
  apiKey: z.string().min(1),
});

export async function getDeveloperDetail(developerId: string) {
  const user = await requireUser();

  return withOrgContext(user.orgId, async (tx) => {
    const [dev] = await tx
      .select()
      .from(developers)
      .where(
        and(
          eq(developers.id, developerId),
          eq(developers.orgId, user.orgId)
        )
      )
      .limit(1);

    if (!dev) return null;

    const keys = await tx
      .select({
        id: providerKeys.id,
        providerDisplayName: providers.displayName,
        providerSlug: providers.key,
        keyFingerprint: providerKeys.keyFingerprint,
        status: providerKeys.status,
        lastPolledAt: providerKeys.lastPolledAt,
        lastError: providerKeys.lastError,
        createdAt: providerKeys.createdAt,
      })
      .from(providerKeys)
      .innerJoin(providers, eq(providerKeys.providerId, providers.id))
      .where(
        and(
          eq(providerKeys.developerId, developerId),
          eq(providerKeys.orgId, user.orgId)
        )
      )
      .orderBy(providerKeys.createdAt);

    return { developer: dev, keys };
  });
}

export async function getProvidersList() {
  // Providers table is not org-scoped, query directly
  return db.select().from(providers).orderBy(providers.displayName);
}

export async function addProviderKey(formData: FormData) {
  const user = await requireUser();

  const parsed = addKeySchema.parse({
    developerId: formData.get("developerId"),
    providerKey: formData.get("providerKey"),
    apiKey: formData.get("apiKey"),
  });

  // Look up the provider row
  const [provider] = await db
    .select()
    .from(providers)
    .where(eq(providers.key, parsed.providerKey))
    .limit(1);

  if (!provider) throw new Error("Unknown provider");

  // Validate the key by making a test API call
  const client = getProviderClient(parsed.providerKey);
  try {
    await client.fetchUsage({
      apiKey: parsed.apiKey,
      since: subDays(new Date(), 1),
      until: new Date(),
    });
  } catch (err) {
    if (err instanceof ProviderAuthError) {
      throw new Error("Invalid API key — authentication failed with the provider.");
    }
    // Transient errors are okay — the key might be valid but the API is having issues.
    // We'll allow saving and let the ingestion worker handle retries.
  }

  // Encrypt the key
  const encrypted = await encryptSecret(parsed.apiKey);
  const fingerprint = keyFingerprint(parsed.apiKey);

  // Store in DB
  const [newKey] = await withOrgContext(user.orgId, async (tx) => {
    return tx.insert(providerKeys).values({
      orgId: user.orgId,
      developerId: parsed.developerId,
      providerId: provider.id,
      encryptedKey: encrypted.ciphertext,
      encryptedDek: encrypted.encryptedDek,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      keyFingerprint: fingerprint,
    }).returning({ id: providerKeys.id });
  });

  // Trigger immediate backfill of last 30 days
  const { inngest } = await import("@/lib/jobs/client");
  const since = subDays(new Date(), 30).toISOString();
  await inngest.send({
    name: "ingestion/provider-key.requested",
    data: { provider_key_id: newKey.id, since },
  });

  revalidatePath(`/developers/${parsed.developerId}`);
  return { success: true };
}

export async function revokeProviderKey(keyId: string) {
  const user = await requireUser();

  await withOrgContext(user.orgId, async (tx) => {
    await tx
      .update(providerKeys)
      .set({ status: "revoked", updatedAt: new Date() })
      .where(
        and(
          eq(providerKeys.id, keyId),
          eq(providerKeys.orgId, user.orgId)
        )
      );
  });

  revalidatePath("/developers");
  return { success: true };
}

export async function repollKey(keyId: string) {
  const user = await requireUser();

  // Verify the key belongs to this org
  const [key] = await withOrgContext(user.orgId, async (tx) => {
    return tx
      .select({ id: providerKeys.id })
      .from(providerKeys)
      .where(
        and(
          eq(providerKeys.id, keyId),
          eq(providerKeys.orgId, user.orgId)
        )
      )
      .limit(1);
  });

  if (!key) throw new Error("Key not found");

  const { inngest } = await import("@/lib/jobs/client");
  await inngest.send({
    name: "ingestion/provider-key.requested",
    data: { provider_key_id: keyId },
  });

  return { success: true };
}
