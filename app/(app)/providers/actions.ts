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
} from "@/lib/db/schema";
import { eq, and, count } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { encryptSecret, keyFingerprint } from "@/lib/encryption/envelope";
import { getProviderClient } from "@/lib/providers/registry";
import { ProviderAuthError } from "@/lib/providers/errors";
import { subDays } from "date-fns";
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
  providerKey: z.string().min(1), // provider slug: "anthropic" | "openai" | ...
  apiKey: z.string().min(1),
  developerId: z.string().uuid().optional().or(z.literal("")),
  newDeveloperName: z.string().optional(),
  newDeveloperEmail: z.string().email().optional().or(z.literal("")),
});

/**
 * Connect a provider key from the Providers page. Unlike the developer-detail
 * flow, this lets you pick an existing developer OR create one inline — so a
 * solo admin can add their own key without first hunting through Developers.
 */
export async function connectProviderKey(formData: FormData) {
  const user = await requireUser();

  const parsed = connectSchema.parse({
    providerKey: formData.get("providerKey"),
    apiKey: formData.get("apiKey"),
    developerId: formData.get("developerId") ?? "",
    newDeveloperName: formData.get("newDeveloperName") ?? "",
    newDeveloperEmail: formData.get("newDeveloperEmail") ?? "",
  });

  const [provider] = await db
    .select()
    .from(providers)
    .where(eq(providers.key, parsed.providerKey))
    .limit(1);
  if (!provider) throw new Error("Unknown provider");

  const [org] = await withOrgContext(user.orgId, async (tx) =>
    tx
      .select({ plan: organizations.plan })
      .from(organizations)
      .where(eq(organizations.id, user.orgId))
      .limit(1)
  );
  const limits = PLAN_LIMITS[org?.plan ?? "free"];

  // Enforce the provider cap (free = 1 provider).
  if (limits.maxProviders < Infinity) {
    const existing = await withOrgContext(user.orgId, async (tx) =>
      tx
        .selectDistinct({ providerId: providerKeys.providerId })
        .from(providerKeys)
        .where(eq(providerKeys.orgId, user.orgId))
    );
    const ids = existing.map((p) => p.providerId);
    if (ids.length >= limits.maxProviders && !ids.includes(provider.id)) {
      throw new PlanLimitError(
        "Free plan supports 1 provider only. Upgrade to Pro for all providers.",
        "maxProviders"
      );
    }
  }

  // Resolve the developer this key belongs to: an existing one, or a new one.
  let developerId: string | null =
    parsed.developerId && parsed.developerId !== "" ? parsed.developerId : null;

  if (!developerId) {
    const name = (parsed.newDeveloperName ?? "").trim();
    const email = (parsed.newDeveloperEmail ?? "").trim();
    if (!name || !email) {
      throw new Error(
        "Pick a developer, or enter a name and email to create one."
      );
    }

    // Enforce the developer cap before creating a new one.
    if (limits.maxDevelopers < Infinity) {
      const [{ value: devCount } = { value: 0 }] = await withOrgContext(
        user.orgId,
        async (tx) =>
          tx
            .select({ value: count(developers.id) })
            .from(developers)
            .where(eq(developers.orgId, user.orgId))
      );
      if (Number(devCount) >= limits.maxDevelopers) {
        throw new PlanLimitError(
          `Free plan supports up to ${limits.maxDevelopers} developers. Upgrade to Pro for unlimited.`,
          "maxDevelopers"
        );
      }
    }

    const created = await withOrgContext(user.orgId, async (tx) =>
      tx
        .insert(developers)
        .values({ orgId: user.orgId, displayName: name, email })
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
                eq(developers.email, email)
              )
            )
            .limit(1)
        )
      )[0]?.id ??
      null;
    if (!developerId) throw new Error("Could not create developer.");
  } else {
    // Verify the chosen developer belongs to this org.
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
        "Invalid API key — authentication failed with the provider."
      );
    }
    // Transient errors are fine — ingestion will retry.
  }

  const encrypted = await encryptSecret(parsed.apiKey);
  const fingerprint = keyFingerprint(parsed.apiKey);

  const [newKey] = await withOrgContext(user.orgId, async (tx) =>
    tx
      .insert(providerKeys)
      .values({
        orgId: user.orgId,
        developerId,
        providerId: provider.id,
        encryptedKey: encrypted.ciphertext,
        encryptedDek: encrypted.encryptedDek,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        keyFingerprint: fingerprint,
      })
      .returning({ id: providerKeys.id })
  );

  // Kick off an immediate 30-day backfill.
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
