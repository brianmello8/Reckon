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
import { organizations } from "@/lib/db/schema";
import { PLAN_LIMITS, PlanLimitError } from "@/lib/plans/limits";

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

  // Check plan limits — free orgs can only use 1 provider
  const [org] = await withOrgContext(user.orgId, async (tx) => {
    return tx
      .select({ plan: organizations.plan })
      .from(organizations)
      .where(eq(organizations.id, user.orgId))
      .limit(1);
  });

  const limits = PLAN_LIMITS[org?.plan ?? "free"];
  if (limits.maxProviders < Infinity) {
    // Check which providers already have keys in this org
    const existingProviders = await withOrgContext(user.orgId, async (tx) => {
      return tx
        .selectDistinct({ providerId: providerKeys.providerId })
        .from(providerKeys)
        .where(eq(providerKeys.orgId, user.orgId));
    });

    const existingProviderIds = existingProviders.map((p) => p.providerId);
    if (
      existingProviderIds.length >= limits.maxProviders &&
      !existingProviderIds.includes(provider.id)
    ) {
      throw new PlanLimitError(
        "Free plan supports 1 provider only. Upgrade to Pro for all providers.",
        "maxProviders"
      );
    }
  }

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

export async function sendInvite(developerId: string) {
  const user = await requireUser();

  const [dev] = await withOrgContext(user.orgId, async (tx) => {
    return tx
      .select()
      .from(developers)
      .where(
        and(eq(developers.id, developerId), eq(developers.orgId, user.orgId))
      )
      .limit(1);
  });

  if (!dev) throw new Error("Developer not found");

  const [org] = await withOrgContext(user.orgId, async (tx) => {
    return tx
      .select({ name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, user.orgId))
      .limit(1);
  });

  const { signInviteToken } = await import("@/lib/invite-token");
  const { developerInvites } = await import("@/lib/db/schema");
  const { addDays } = await import("date-fns");

  const expiresAt = addDays(new Date(), 7);

  const [invite] = await db
    .insert(developerInvites)
    .values({
      orgId: user.orgId,
      developerId,
      email: dev.email,
      token: "pending",
      expiresAt,
    })
    .returning();

  const token = await signInviteToken({
    inviteId: invite.id,
    orgId: user.orgId,
    developerId,
    email: dev.email,
  });

  await db
    .update(developerInvites)
    .set({ token })
    .where(eq(developerInvites.id, invite.id));

  const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL}/invite/${token}`;

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);

    await resend.emails.send({
      from: "Reckon <noreply@getreckon.dev>",
      to: dev.email,
      subject: `Set up your AI spend tracking for ${org?.name ?? "your team"}`,
      html: `
        <h2>Hi ${dev.displayName},</h2>
        <p>${org?.name ?? "Your team"} is using Reckon to track AI spend per developer.</p>
        <p>To get set up, you'll need to add your Anthropic and/or OpenAI API keys. It takes about 5 minutes.</p>
        <p><a href="${inviteUrl}" style="display:inline-block;padding:12px 24px;background:#18181b;color:white;text-decoration:none;border-radius:6px;font-weight:500;">Set up your keys</a></p>
        <p style="color:#71717a;font-size:14px;">This link expires in 7 days.</p>
      `,
    });
  } catch {
    // Email failure is non-fatal — admin can copy the link
  }

  return { inviteUrl };
}
