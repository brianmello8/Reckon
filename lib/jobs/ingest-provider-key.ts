import { inngest } from "./client";
import { db } from "@/lib/db/client";
import { providerKeys, providers, usageEvents } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { decryptSecret } from "@/lib/encryption/envelope";
import { getProviderClient } from "@/lib/providers/registry";
import { resolveDeveloperForIdentity } from "@/lib/providers/identities";
import { ProviderAuthError, ProviderTransientError } from "@/lib/providers/errors";
import { subHours, subDays, addDays, parseISO, differenceInDays, min } from "date-fns";
import type { UsageRow } from "@/lib/providers/types";

const CHUNK_DAYS = 7;

export const ingestProviderKey = inngest.createFunction(
  {
    id: "ingest-provider-key",
    retries: 5,
    triggers: [{ event: "ingestion/provider-key.requested" }],
  },
  async ({ event, step }) => {
    const { provider_key_id, since } = event.data as {
      provider_key_id: string;
      since?: string; // ISO date string, optional — used for backfill
    };

    // Step 1: Load the provider key row.
    // Uses a privileged query (no RLS) because this is a system job.
    const keyRow = await step.run("load-key", async () => {
      const [row] = await db
        .select({
          id: providerKeys.id,
          orgId: providerKeys.orgId,
          developerId: providerKeys.developerId,
          providerId: providerKeys.providerId,
          encryptedKey: providerKeys.encryptedKey,
          encryptedDek: providerKeys.encryptedDek,
          iv: providerKeys.iv,
          authTag: providerKeys.authTag,
          status: providerKeys.status,
        })
        .from(providerKeys)
        .where(eq(providerKeys.id, provider_key_id))
        .limit(1);

      if (!row) throw new Error(`Provider key ${provider_key_id} not found`);
      if (row.status === "revoked") throw new Error("Key is revoked, skipping");

      return {
        ...row,
        encryptedKey: row.encryptedKey.toString("base64"),
        encryptedDek: row.encryptedDek.toString("base64"),
        iv: row.iv.toString("base64"),
        authTag: row.authTag.toString("base64"),
      };
    });

    // Step 2: Look up the provider slug
    const providerSlug = await step.run("lookup-provider", async () => {
      const [p] = await db
        .select({ key: providers.key })
        .from(providers)
        .where(eq(providers.id, keyRow.providerId))
        .limit(1);

      if (!p) throw new Error(`Provider ${keyRow.providerId} not found`);
      return p.key;
    });

    // Step 3: Decrypt the key (once, reuse across chunks)
    const plaintext = await step.run("decrypt-key", async () => {
      return decryptSecret({
        ciphertext: Buffer.from(keyRow.encryptedKey, "base64"),
        encryptedDek: Buffer.from(keyRow.encryptedDek, "base64"),
        iv: Buffer.from(keyRow.iv, "base64"),
        authTag: Buffer.from(keyRow.authTag, "base64"),
      });
    });

    // Step 4: Fetch usage in chunks
    const sinceDate = since ? parseISO(since) : subHours(new Date(), 48);
    const untilDate = new Date();
    const totalDays = differenceInDays(untilDate, sinceDate);
    const numChunks = Math.max(1, Math.ceil(totalDays / CHUNK_DAYS));

    let totalUpserted = 0;

    for (let i = 0; i < numChunks; i++) {
      const chunkStart = addDays(sinceDate, i * CHUNK_DAYS);
      const chunkEnd = min([addDays(chunkStart, CHUNK_DAYS), untilDate]);

      const rows = await step.run(`fetch-chunk-${i}`, async () => {
        const client = getProviderClient(providerSlug);
        try {
          return await client.fetchUsage({
            apiKey: plaintext,
            since: chunkStart,
            until: chunkEnd,
          });
        } catch (err) {
          if (err instanceof ProviderAuthError) {
            await db
              .update(providerKeys)
              .set({
                status: "errored",
                lastError: err.message,
                updatedAt: new Date(),
              })
              .where(eq(providerKeys.id, provider_key_id));
            return "AUTH_ERROR" as const;
          }
          if (err instanceof ProviderTransientError) {
            throw err;
          }
          throw err;
        }
      });

      if (rows === "AUTH_ERROR") {
        return { status: "errored", reason: "auth_error" };
      }

      const upserted = await step.run(`upsert-chunk-${i}`, async () => {
        return upsertRows(rows, keyRow);
      });

      totalUpserted += upserted;
    }

    // Step 5: Update last_polled_at
    await step.run("update-polled", async () => {
      await db
        .update(providerKeys)
        .set({
          lastPolledAt: new Date(),
          lastError: null,
          updatedAt: new Date(),
        })
        .where(eq(providerKeys.id, provider_key_id));
    });

    return { status: "ok", upserted: totalUpserted, chunks: numChunks };
  }
);

async function upsertRows(
  rows: UsageRow[],
  keyRow: { id: string; orgId: string; providerId: string; developerId: string | null }
): Promise<number> {
  if (rows.length === 0) return 0;

  // Resolve each distinct provider identity to a developer once per chunk
  // (upserts provider_identities + auto-creates developers where labelled).
  const identityToDev = new Map<string, string | null>();
  for (const row of rows) {
    if (identityToDev.has(row.external_identity)) continue;
    const developerId = row.external_identity
      ? await resolveDeveloperForIdentity({
          orgId: keyRow.orgId,
          providerId: keyRow.providerId,
          externalId: row.external_identity,
          label: row.identity_label,
        })
      : keyRow.developerId; // legacy/aggregate rows fall back to the key's owner
    identityToDev.set(row.external_identity, developerId ?? null);
  }

  let count = 0;
  for (const row of rows) {
    const developerId = identityToDev.get(row.external_identity) ?? null;
    await db
      .insert(usageEvents)
      .values({
        orgId: keyRow.orgId,
        providerKeyId: keyRow.id,
        providerId: keyRow.providerId,
        developerId,
        externalIdentity: row.external_identity,
        timeBucket: row.time_bucket,
        model: row.model,
        inputTokens: BigInt(row.input_tokens),
        outputTokens: BigInt(row.output_tokens),
        cachedInputTokens: BigInt(row.cached_input_tokens),
        costUsdMicros: BigInt(row.cost_usd_micros),
        raw: row.raw,
      })
      .onConflictDoUpdate({
        target: [
          usageEvents.providerKeyId,
          usageEvents.externalIdentity,
          usageEvents.timeBucket,
          usageEvents.model,
        ],
        set: {
          developerId,
          inputTokens: BigInt(row.input_tokens),
          outputTokens: BigInt(row.output_tokens),
          cachedInputTokens: BigInt(row.cached_input_tokens),
          costUsdMicros: BigInt(row.cost_usd_micros),
          raw: row.raw,
          updatedAt: new Date(),
        },
      });
    count++;
  }
  return count;
}
