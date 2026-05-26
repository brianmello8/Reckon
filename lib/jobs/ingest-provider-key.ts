import { inngest } from "./client";
import { db } from "@/lib/db/client";
import { providerKeys, providers, usageEvents } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { decryptSecret } from "@/lib/encryption/envelope";
import { getProviderClient } from "@/lib/providers/registry";
import { ProviderAuthError, ProviderTransientError } from "@/lib/providers/errors";
import { subHours, parseISO } from "date-fns";

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
    // Uses a privileged query (no RLS) because this is a system job
    // that runs across orgs. The org_id is taken from the row itself,
    // never from user input.
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
        // Serialize buffers for step serialization
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

    // Step 3: Decrypt and fetch usage
    const rows = await step.run("fetch-usage", async () => {
      const plaintext = await decryptSecret({
        ciphertext: Buffer.from(keyRow.encryptedKey, "base64"),
        encryptedDek: Buffer.from(keyRow.encryptedDek, "base64"),
        iv: Buffer.from(keyRow.iv, "base64"),
        authTag: Buffer.from(keyRow.authTag, "base64"),
      });

      const client = getProviderClient(providerSlug);
      const sinceDate = since ? parseISO(since) : subHours(new Date(), 48);
      const untilDate = new Date();

      try {
        return await client.fetchUsage({
          apiKey: plaintext,
          since: sinceDate,
          until: untilDate,
        });
      } catch (err) {
        if (err instanceof ProviderAuthError) {
          // Mark key as errored — don't retry
          await db
            .update(providerKeys)
            .set({
              status: "errored",
              lastError: err.message,
              updatedAt: new Date(),
            })
            .where(eq(providerKeys.id, provider_key_id));

          // Return empty — non-retryable
          return "AUTH_ERROR" as const;
        }
        if (err instanceof ProviderTransientError) {
          // Throw to let Inngest retry
          throw err;
        }
        throw err;
      }
    });

    if (rows === "AUTH_ERROR") {
      return { status: "errored", reason: "auth_error" };
    }

    // Step 4: Upsert usage events
    const upsertCount = await step.run("upsert-usage", async () => {
      if (rows.length === 0) return 0;

      let count = 0;
      for (const row of rows) {
        await db
          .insert(usageEvents)
          .values({
            orgId: keyRow.orgId,
            providerKeyId: keyRow.id,
            providerId: keyRow.providerId,
            developerId: keyRow.developerId,
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
              usageEvents.timeBucket,
              usageEvents.model,
            ],
            set: {
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
    });

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

    return { status: "ok", upserted: upsertCount };
  }
);
