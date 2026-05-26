import { inngest } from "./client";
import { db } from "@/lib/db/client";
import { providerKeys } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

/**
 * Fans out ingestion for all active keys in an org, then triggers
 * anomaly detection. Fire-and-forget: each key ingestion runs as
 * its own function invocation with independent retries.
 */
export const orchestrateIngestion = inngest.createFunction(
  {
    id: "ingest-org",
    triggers: [{ event: "ingestion/org.requested" }],
  },
  async ({ event, step }) => {
    const { org_id } = event.data as { org_id: string };

    // Load all active keys for this org (privileged — system job)
    const activeKeys = await step.run("load-active-keys", async () => {
      return db
        .select({ id: providerKeys.id })
        .from(providerKeys)
        .where(
          and(
            eq(providerKeys.orgId, org_id),
            eq(providerKeys.status, "active")
          )
        );
    });

    if (activeKeys.length === 0) {
      return { status: "skipped", reason: "no_active_keys" };
    }

    // Fan out: send an ingestion event per key
    await step.run("fan-out-keys", async () => {
      const events = activeKeys.map((key) => ({
        name: "ingestion/provider-key.requested" as const,
        data: { provider_key_id: key.id },
      }));
      await inngest.send(events);
    });

    // Fire anomaly detection after a delay to let ingestion complete.
    // This is fire-and-forget — anomaly detection handles its own retries.
    await step.sleep("wait-for-ingestion", "2m");

    await step.run("trigger-anomaly-detection", async () => {
      await inngest.send({
        name: "anomaly/detect.requested",
        data: { org_id },
      });
    });

    return { status: "ok", keys_triggered: activeKeys.length };
  }
);
