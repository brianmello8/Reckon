import { inngest } from "./client";
import { db } from "@/lib/db/client";
import { organizations } from "@/lib/db/schema";
import { isNull, and, isNotNull } from "drizzle-orm";
import { CRON_HOURLY_INGESTION } from "./schedule";

/**
 * Hourly cron that triggers ingestion for all active orgs.
 * An org is active if it has a plan and is not soft-deleted.
 */
export const cronHourlyIngestion = inngest.createFunction(
  {
    id: "cron-hourly-ingestion",
    triggers: [{ cron: CRON_HOURLY_INGESTION }],
  },
  async ({ step }) => {
    const orgs = await step.run("list-active-orgs", async () => {
      return db
        .select({ id: organizations.id })
        .from(organizations)
        .where(
          and(
            isNotNull(organizations.plan),
            isNull(organizations.deletedAt)
          )
        );
    });

    if (orgs.length === 0) {
      return { status: "skipped", reason: "no_active_orgs" };
    }

    await step.run("fan-out-orgs", async () => {
      const events = orgs.map((org) => ({
        name: "ingestion/org.requested" as const,
        data: { org_id: org.id },
      }));
      await inngest.send(events);
    });

    return { status: "ok", orgs_triggered: orgs.length };
  }
);
