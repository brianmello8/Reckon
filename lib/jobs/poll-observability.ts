import { inngest } from "./client";
import { db } from "@/lib/db/client";
import { observabilityConnections } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { syncObservabilityConnection } from "@/lib/observability/sync";
import {
  ProviderAuthError,
  ProviderTransientError,
} from "@/lib/providers/errors";

/**
 * Poll one observability connection (Phase 8.3). Reads metadata only, joins to
 * usage_events at the (model, day) grain, and logs the match rate. Auth errors
 * disable the connection (status=error); transient errors retry.
 */
export const pollObservabilityConnection = inngest.createFunction(
  {
    id: "poll-observability-connection",
    retries: 3,
    triggers: [{ event: "observability/poll.requested" }],
  },
  async ({ event, step }) => {
    const { connection_id } = event.data as { connection_id: string };

    // Load + sync in ONE step so the bytea credential Buffers stay live (a
    // step boundary would JSON-serialize them). Error handling lives here too.
    return step.run("sync", async () => {
      const [conn] = await db
        .select()
        .from(observabilityConnections)
        .where(eq(observabilityConnections.id, connection_id))
        .limit(1);
      if (!conn) throw new Error(`Connection ${connection_id} not found`);
      if (conn.status === "disabled") {
        return { status: "skipped", reason: "disabled" };
      }

      try {
        const stats = await syncObservabilityConnection(conn);
        return { status: "ok", ...stats };
      } catch (err) {
        if (err instanceof ProviderTransientError) throw err; // retry
        const msg = err instanceof Error ? err.message.slice(0, 500) : "unknown";
        await db
          .update(observabilityConnections)
          .set({ status: "error", lastError: msg, updatedAt: new Date() })
          .where(eq(observabilityConnections.id, connection_id));
        if (err instanceof ProviderAuthError) {
          return { status: "errored", reason: "auth_error" };
        }
        throw err;
      }
    });
  }
);

/**
 * Hourly cron: fan out a poll per active observability connection. Offset from
 * the ingestion cron so usage_events for the window are likely already present.
 */
import { CRON_HOURLY_OBSERVABILITY } from "./schedule";

export const cronObservabilityPoll = inngest.createFunction(
  {
    id: "cron-observability-poll",
    triggers: [{ cron: CRON_HOURLY_OBSERVABILITY }],
  },
  async ({ step }) => {
    const conns = await step.run("list-active-connections", async () =>
      db
        .select({ id: observabilityConnections.id })
        .from(observabilityConnections)
        .where(eq(observabilityConnections.status, "active"))
    );

    if (conns.length === 0) {
      return { status: "skipped", reason: "no_active_connections" };
    }

    await step.run("fan-out", async () => {
      await inngest.send(
        conns.map((c) => ({
          name: "observability/poll.requested" as const,
          data: { connection_id: c.id },
        }))
      );
    });

    return { status: "ok", connections_triggered: conns.length };
  }
);
