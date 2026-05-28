"use server";

import { verifyInviteToken } from "@/lib/invite-token";
import { db } from "@/lib/db/client";
import {
  developerInvites,
  developers,
  organizations,
  providers,
  providerKeys,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { encryptSecret, keyFingerprint } from "@/lib/encryption/envelope";
import { getProviderClient } from "@/lib/providers/registry";
import { ProviderAuthError } from "@/lib/providers/errors";
import { subDays } from "date-fns";

export async function getInviteData(token: string) {
  const payload = await verifyInviteToken(token);
  if (!payload) return { error: "invalid" as const };

  const [invite] = await db
    .select()
    .from(developerInvites)
    .where(eq(developerInvites.token, token))
    .limit(1);

  if (!invite) return { error: "not_found" as const };
  if (invite.claimedAt) return { error: "claimed" as const };
  if (invite.expiresAt < new Date()) return { error: "expired" as const };

  const [dev] = await db
    .select({ displayName: developers.displayName })
    .from(developers)
    .where(eq(developers.id, payload.developerId))
    .limit(1);

  const [org] = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, payload.orgId))
    .limit(1);

  const allProviders = await db
    .select()
    .from(providers)
    .orderBy(providers.displayName);

  return {
    developerName: dev?.displayName ?? "Developer",
    orgName: org?.name ?? "Your team",
    providers: allProviders.map((p) => ({ key: p.key, name: p.displayName, id: p.id })),
  };
}

export async function claimInvite(
  token: string,
  keys: Array<{ providerKey: string; apiKey: string }>
) {
  const payload = await verifyInviteToken(token);
  if (!payload) throw new Error("Invalid or expired invite link.");

  const [invite] = await db
    .select()
    .from(developerInvites)
    .where(eq(developerInvites.token, token))
    .limit(1);

  if (!invite) throw new Error("Invite not found.");
  if (invite.claimedAt) throw new Error("This invite has already been claimed.");
  if (invite.expiresAt < new Date()) throw new Error("This invite has expired.");

  for (const key of keys) {
    if (!key.apiKey.trim()) continue;

    const [provider] = await db
      .select()
      .from(providers)
      .where(eq(providers.key, key.providerKey))
      .limit(1);

    if (!provider) continue;

    // Validate the key
    const client = getProviderClient(key.providerKey);
    try {
      await client.fetchUsage({
        apiKey: key.apiKey,
        since: subDays(new Date(), 1),
        until: new Date(),
      });
    } catch (err) {
      if (err instanceof ProviderAuthError) {
        throw new Error(`Invalid ${provider.displayName} key — authentication failed.`);
      }
    }

    // Encrypt and store
    const encrypted = await encryptSecret(key.apiKey);
    const fingerprint = keyFingerprint(key.apiKey);

    await db.insert(providerKeys).values({
      orgId: payload.orgId,
      developerId: payload.developerId,
      providerId: provider.id,
      encryptedKey: encrypted.ciphertext,
      encryptedDek: encrypted.encryptedDek,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      keyFingerprint: fingerprint,
    });

    // Trigger backfill
    const { inngest } = await import("@/lib/jobs/client");
    const since = subDays(new Date(), 30).toISOString();
    const [newKey] = await db
      .select({ id: providerKeys.id })
      .from(providerKeys)
      .where(
        and(
          eq(providerKeys.developerId, payload.developerId),
          eq(providerKeys.providerId, provider.id),
          eq(providerKeys.keyFingerprint, fingerprint)
        )
      )
      .limit(1);

    if (newKey) {
      await inngest.send({
        name: "ingestion/provider-key.requested",
        data: { provider_key_id: newKey.id, since },
      });
    }
  }

  // Mark invite as claimed
  await db
    .update(developerInvites)
    .set({ claimedAt: new Date() })
    .where(eq(developerInvites.id, invite.id));

  return { success: true };
}
