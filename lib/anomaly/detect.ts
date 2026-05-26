import { db } from "@/lib/db/client";
import {
  usageEvents,
  developers,
  providers,
  anomalies,
} from "@/lib/db/schema";
import { eq, and, isNull, sql, gte } from "drizzle-orm";
import { getRollingStats } from "@/lib/queries/usage";
import {
  SPIKE_STDDEV_MULTIPLIER,
  SUDDEN_INCREASE_MULTIPLIER,
  MIN_ABSOLUTE_CHANGE_MICROS,
  MIN_HISTORY_DAYS,
  DEDUP_WINDOW_HOURS,
  SEVERITY_INFO_MAX,
  SEVERITY_WARN_MAX,
} from "./config";
import { subHours, subDays, format } from "date-fns";

export type NewAnomaly = {
  orgId: string;
  developerId: string;
  kind: "spike" | "sudden_increase" | "sustained_increase";
  severity: "info" | "warn" | "critical";
  details: Record<string, unknown>;
};

function computeSeverity(multiple: number): "info" | "warn" | "critical" {
  if (multiple >= SEVERITY_WARN_MAX) return "critical";
  if (multiple >= SEVERITY_INFO_MAX) return "warn";
  return "info";
}

export async function detectAnomaliesForOrg(
  orgId: string
): Promise<NewAnomaly[]> {
  const yesterday = format(subDays(new Date(), 1), "yyyy-MM-dd");

  // Find all (developer, provider) pairs with usage in this org
  const devProviderPairs = await db
    .select({
      developerId: usageEvents.developerId,
      providerId: usageEvents.providerId,
      developerName: developers.displayName,
      providerKey: providers.key,
    })
    .from(usageEvents)
    .innerJoin(developers, eq(usageEvents.developerId, developers.id))
    .innerJoin(providers, eq(usageEvents.providerId, providers.id))
    .where(
      and(eq(usageEvents.orgId, orgId), isNull(developers.deletedAt))
    )
    .groupBy(
      usageEvents.developerId,
      usageEvents.providerId,
      developers.displayName,
      providers.key
    );

  const newAnomalies: NewAnomaly[] = [];

  for (const pair of devProviderPairs) {
    const stats = await getRollingStats(pair.developerId, pair.providerId, 28);

    // Skip if insufficient history
    if (stats.dayCount < MIN_HISTORY_DAYS) continue;

    // Get yesterday's total for this dev+provider
    const [yesterdayRow] = await db
      .select({
        dailyCost: sql<bigint>`coalesce(sum(${usageEvents.costUsdMicros}), 0)`.as(
          "daily_cost"
        ),
      })
      .from(usageEvents)
      .where(
        and(
          eq(usageEvents.developerId, pair.developerId),
          eq(usageEvents.providerId, pair.providerId),
          eq(usageEvents.timeBucket, yesterday)
        )
      );

    const dailyCost = Number(yesterdayRow?.dailyCost ?? 0);
    if (dailyCost === 0) continue;

    // Check spike: daily > mean + 3*stddev
    const spikeThreshold =
      stats.meanDaily + SPIKE_STDDEV_MULTIPLIER * stats.stddevDaily;
    const isSpike =
      dailyCost > spikeThreshold &&
      dailyCost - stats.meanDaily > MIN_ABSOLUTE_CHANGE_MICROS;

    // Check sudden_increase: daily > 3x trailing 7-day avg
    const suddenThreshold =
      stats.trailing7dayAvg * SUDDEN_INCREASE_MULTIPLIER;
    const isSuddenIncrease =
      stats.trailing7dayAvg > 0 &&
      dailyCost > suddenThreshold &&
      dailyCost - stats.trailing7dayAvg > MIN_ABSOLUTE_CHANGE_MICROS;

    // Dedupe: check existing anomalies within the window
    const dedupeAfter = subHours(new Date(), DEDUP_WINDOW_HOURS);

    if (isSpike) {
      const multiple =
        stats.trailing7dayAvg > 0
          ? dailyCost / stats.trailing7dayAvg
          : SEVERITY_WARN_MAX;
      const severity = computeSeverity(multiple);

      const existing = await checkExistingAnomaly(
        pair.developerId,
        "spike",
        dedupeAfter
      );

      if (!existing) {
        newAnomalies.push({
          orgId,
          developerId: pair.developerId,
          kind: "spike",
          severity,
          details: {
            developerName: pair.developerName,
            provider: pair.providerKey,
            dailyCostMicros: dailyCost,
            meanDailyMicros: Math.round(stats.meanDaily),
            stddevMicros: Math.round(stats.stddevDaily),
            thresholdMicros: Math.round(spikeThreshold),
            multiple: Math.round(multiple * 10) / 10,
          },
        });
      } else if (severityRank(severity) > severityRank(existing.severity)) {
        // Escalate existing anomaly
        await db
          .update(anomalies)
          .set({ severity, details: { ...(existing.details as Record<string, unknown>), escalated: true } })
          .where(eq(anomalies.id, existing.id));
      }
    }

    if (isSuddenIncrease && !isSpike) {
      const multiple = dailyCost / stats.trailing7dayAvg;
      const severity = computeSeverity(multiple);

      const existing = await checkExistingAnomaly(
        pair.developerId,
        "sudden_increase",
        dedupeAfter
      );

      if (!existing) {
        newAnomalies.push({
          orgId,
          developerId: pair.developerId,
          kind: "sudden_increase",
          severity,
          details: {
            developerName: pair.developerName,
            provider: pair.providerKey,
            dailyCostMicros: dailyCost,
            trailing7dayAvgMicros: Math.round(stats.trailing7dayAvg),
            multiple: Math.round(multiple * 10) / 10,
          },
        });
      } else if (severityRank(severity) > severityRank(existing.severity)) {
        await db
          .update(anomalies)
          .set({ severity, details: { ...(existing.details as Record<string, unknown>), escalated: true } })
          .where(eq(anomalies.id, existing.id));
      }
    }
  }

  return newAnomalies;
}

async function checkExistingAnomaly(
  developerId: string,
  kind: string,
  after: Date
) {
  const [existing] = await db
    .select({
      id: anomalies.id,
      severity: anomalies.severity,
      details: anomalies.details,
    })
    .from(anomalies)
    .where(
      and(
        eq(anomalies.developerId, developerId),
        eq(anomalies.kind, kind as "spike" | "sudden_increase" | "sustained_increase"),
        gte(anomalies.detectedAt, after)
      )
    )
    .limit(1);

  return existing ?? null;
}

function severityRank(s: string): number {
  if (s === "critical") return 3;
  if (s === "warn") return 2;
  return 1;
}
