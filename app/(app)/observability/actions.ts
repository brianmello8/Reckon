"use server";

import { requireAdmin, requireUser } from "@/lib/auth";
import { withOrgContext } from "@/lib/db/rls";
import { db } from "@/lib/db/client";
import { observabilityConnections } from "@/lib/db/schema";
import { and, eq, desc } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { inngest } from "@/lib/jobs/client";
import {
  getObservabilityConnector,
  DEFAULT_BASE_URL,
} from "@/lib/observability/registry";
import { encryptCredentials, decryptCredentials } from "@/lib/observability/credentials";
import type { ObservabilityCredentials } from "@/lib/observability/types";
import { ProviderAuthError } from "@/lib/providers/errors";

/** Connections for the org — never returns credential bytes. */
export async function getObservabilityConnections() {
  const user = await requireUser();
  return withOrgContext(user.orgId, async (tx) =>
    tx
      .select({
        id: observabilityConnections.id,
        provider: observabilityConnections.provider,
        baseUrl: observabilityConnections.baseUrl,
        status: observabilityConnections.status,
        lastSyncedAt: observabilityConnections.lastSyncedAt,
        lastError: observabilityConnections.lastError,
        createdAt: observabilityConnections.createdAt,
      })
      .from(observabilityConnections)
      .where(eq(observabilityConnections.orgId, user.orgId))
      .orderBy(desc(observabilityConnections.createdAt))
  );
}

const addSchema = z.object({
  provider: z.enum(["langfuse", "helicone"]),
  baseUrl: z.string().url().optional().or(z.literal("")),
  publicKey: z.string().optional(),
  secretKey: z.string().optional(),
  apiKey: z.string().optional(),
});

function buildCredentials(
  provider: "langfuse" | "helicone",
  input: z.infer<typeof addSchema>
): ObservabilityCredentials {
  if (provider === "langfuse") {
    if (!input.publicKey || !input.secretKey) {
      throw new Error("Langfuse needs both a public key and a secret key.");
    }
    return { publicKey: input.publicKey.trim(), secretKey: input.secretKey.trim() };
  }
  if (!input.apiKey) throw new Error("Helicone needs an API key.");
  return { apiKey: input.apiKey.trim() };
}

/** Add a connection: validate credentials live, encrypt, store, poll once. */
export async function addObservabilityConnection(formData: FormData) {
  const user = await requireAdmin();
  const parsed = addSchema.parse({
    provider: formData.get("provider"),
    baseUrl: formData.get("baseUrl") ?? "",
    publicKey: formData.get("publicKey") ?? "",
    secretKey: formData.get("secretKey") ?? "",
    apiKey: formData.get("apiKey") ?? "",
  });

  const baseUrl =
    parsed.baseUrl && parsed.baseUrl !== ""
      ? parsed.baseUrl
      : DEFAULT_BASE_URL[parsed.provider];
  const credentials = buildCredentials(parsed.provider, parsed);

  // Validate before storing (auth errors surface to the admin immediately).
  const connector = getObservabilityConnector(parsed.provider);
  try {
    await connector.testConnection({ baseUrl, credentials });
  } catch (err) {
    if (err instanceof ProviderAuthError) {
      throw new Error("Invalid credentials — the provider rejected them.");
    }
    // Transient errors are fine; the poller will retry.
  }

  const enc = await encryptCredentials(credentials);
  const [created] = await db
    .insert(observabilityConnections)
    .values({
      orgId: user.orgId,
      provider: parsed.provider,
      baseUrl,
      encryptedCredentials: enc.encryptedCredentials,
      encryptedDek: enc.encryptedDek,
      iv: enc.iv,
      authTag: enc.authTag,
    })
    .returning({ id: observabilityConnections.id });

  await inngest.send({
    name: "observability/poll.requested",
    data: { connection_id: created.id },
  });

  revalidatePath("/observability");
  return { success: true };
}

async function loadOwned(orgId: string, connectionId: string) {
  const [row] = await withOrgContext(orgId, async (tx) =>
    tx
      .select()
      .from(observabilityConnections)
      .where(
        and(
          eq(observabilityConnections.id, connectionId),
          eq(observabilityConnections.orgId, orgId)
        )
      )
      .limit(1)
  );
  if (!row) throw new Error("Connection not found.");
  return row;
}

/** Re-validate stored credentials; updates status accordingly. */
export async function testObservabilityConnection(connectionId: string) {
  const user = await requireAdmin();
  const row = await loadOwned(user.orgId, connectionId);
  const connector = getObservabilityConnector(row.provider);
  const credentials = await decryptCredentials({
    encryptedCredentials: Buffer.from(row.encryptedCredentials),
    encryptedDek: Buffer.from(row.encryptedDek),
    iv: Buffer.from(row.iv),
    authTag: Buffer.from(row.authTag),
  });
  try {
    await connector.testConnection({ baseUrl: row.baseUrl, credentials });
  } catch (err) {
    const msg =
      err instanceof ProviderAuthError
        ? "Invalid credentials — the provider rejected them."
        : err instanceof Error
        ? err.message
        : "Test failed";
    await db
      .update(observabilityConnections)
      .set({ status: "error", lastError: msg.slice(0, 500), updatedAt: new Date() })
      .where(eq(observabilityConnections.id, connectionId));
    revalidatePath("/observability");
    throw new Error(msg);
  }
  await db
    .update(observabilityConnections)
    .set({ status: "active", lastError: null, updatedAt: new Date() })
    .where(eq(observabilityConnections.id, connectionId));
  revalidatePath("/observability");
  return { success: true };
}

export async function setObservabilityEnabled(
  connectionId: string,
  enabled: boolean
) {
  const user = await requireAdmin();
  await loadOwned(user.orgId, connectionId);
  await db
    .update(observabilityConnections)
    .set({ status: enabled ? "active" : "disabled", updatedAt: new Date() })
    .where(eq(observabilityConnections.id, connectionId));
  revalidatePath("/observability");
  return { success: true };
}

export async function pollObservabilityNow(connectionId: string) {
  const user = await requireAdmin();
  await loadOwned(user.orgId, connectionId);
  await inngest.send({
    name: "observability/poll.requested",
    data: { connection_id: connectionId },
  });
  return { success: true };
}

export async function removeObservabilityConnection(connectionId: string) {
  const user = await requireAdmin();
  await loadOwned(user.orgId, connectionId);
  await db
    .delete(observabilityConnections)
    .where(eq(observabilityConnections.id, connectionId));
  revalidatePath("/observability");
  return { success: true };
}
