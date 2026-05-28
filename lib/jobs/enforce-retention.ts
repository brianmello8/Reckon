import { inngest } from "./client";
import { db } from "@/lib/db/client";
import { organizations, usageEvents } from "@/lib/db/schema";
import { isNull, eq, and, lt, sql } from "drizzle-orm";
import { CRON_DAILY_RETENTION } from "./schedule";
import { PLAN_LIMITS } from "@/lib/plans/limits";

/**
 * Daily cron at 03:00 UTC. Deletes usage_events older than the
 * plan's retention window.
 */
export const enforceRetention = inngest.createFunction(
  {
    id: "enforce-retention",
    triggers: [{ cron: CRON_DAILY_RETENTION }],
  },
  async ({ step }) => {
    const orgs = await step.run("list-orgs", async () => {
      return db
        .select({ id: organizations.id, plan: organizations.plan })
        .from(organizations)
        .where(isNull(organizations.deletedAt));
    });

    let totalDeleted = 0;

    for (const org of orgs) {
      const deleted = await step.run(`retain-${org.id}`, async () => {
        const limits = PLAN_LIMITS[org.plan];
        const cutoffDate = sql`current_date - ${limits.retentionDays}`;

        const result = await db
          .delete(usageEvents)
          .where(
            and(
              eq(usageEvents.orgId, org.id),
              lt(usageEvents.timeBucket, cutoffDate)
            )
          )
          .returning({ id: usageEvents.id });

        return result.length;
      });

      totalDeleted += deleted;
    }

    return { status: "ok", orgs_processed: orgs.length, rows_deleted: totalDeleted };
  }
);
