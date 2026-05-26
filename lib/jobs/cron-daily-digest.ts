import { inngest } from "./client";
import { db } from "@/lib/db/client";
import { organizations, digestLogs } from "@/lib/db/schema";
import { isNull, and, isNotNull, eq, sql } from "drizzle-orm";
import { CRON_DAILY_DIGEST } from "./schedule";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";

/**
 * Runs every 15 minutes. For each org, checks if the current local time
 * matches their configured digest_time_local within the last 15 minutes
 * AND no digest has been sent today. If so, fires the digest event.
 */
export const cronDailyDigest = inngest.createFunction(
  {
    id: "cron-daily-digest",
    triggers: [{ cron: CRON_DAILY_DIGEST }],
  },
  async ({ step }) => {
    const orgs = await step.run("find-due-orgs", async () => {
      // Get all orgs with a Slack channel configured and not deleted
      const allOrgs = await db
        .select({
          id: organizations.id,
          digestTimeLocal: organizations.digestTimeLocal,
          digestTimezone: organizations.digestTimezone,
          digestSlackChannelId: organizations.digestSlackChannelId,
        })
        .from(organizations)
        .where(
          and(
            isNull(organizations.deletedAt),
            isNotNull(organizations.digestSlackChannelId)
          )
        );

      const now = new Date();
      const today = format(now, "yyyy-MM-dd");
      const dueOrgs: string[] = [];

      for (const org of allOrgs) {
        if (!org.digestSlackChannelId) continue;

        // Get current time in org's timezone
        let localTime: string;
        try {
          const zonedNow = toZonedTime(now, org.digestTimezone);
          localTime = format(zonedNow, "HH:mm");
        } catch {
          // Invalid timezone, skip
          continue;
        }

        // Check if within 15-minute window of digest time
        const [digestH, digestM] = org.digestTimeLocal.split(":").map(Number);
        const [nowH, nowM] = localTime.split(":").map(Number);

        const digestMinutes = digestH * 60 + digestM;
        const nowMinutes = nowH * 60 + nowM;
        const diff = nowMinutes - digestMinutes;

        // Due if within 0-14 minutes past the configured time
        if (diff >= 0 && diff < 15) {
          // Check if already sent today
          const [existing] = await db
            .select({ id: digestLogs.id })
            .from(digestLogs)
            .where(
              and(
                eq(digestLogs.orgId, org.id),
                eq(digestLogs.kind, "daily"),
                sql`date(${digestLogs.sentAt}) = ${today}`
              )
            )
            .limit(1);

          if (!existing) {
            dueOrgs.push(org.id);
          }
        }
      }

      return dueOrgs;
    });

    if (orgs.length === 0) {
      return { status: "skipped", reason: "no_orgs_due" };
    }

    await step.run("fire-digest-events", async () => {
      const events = orgs.map((orgId) => ({
        name: "digest/daily.requested" as const,
        data: { org_id: orgId },
      }));
      await inngest.send(events);
    });

    return { status: "ok", orgs_triggered: orgs.length };
  }
);
