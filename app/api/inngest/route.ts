import { serve } from "inngest/next";
import { inngest } from "@/lib/jobs/client";
import { helloWorld } from "@/lib/jobs/hello";
import { ingestProviderKey } from "@/lib/jobs/ingest-provider-key";
import { orchestrateIngestion } from "@/lib/jobs/orchestrate-ingestion";
import { cronHourlyIngestion } from "@/lib/jobs/cron-hourly";
import { composeDailyDigest } from "@/lib/jobs/compose-daily-digest";
import { cronDailyDigest } from "@/lib/jobs/cron-daily-digest";
import { detectAnomaliesJob } from "@/lib/jobs/detect-anomalies";
import { notifyAnomaly } from "@/lib/jobs/notify-anomaly";
import { syncDeveloperCount } from "@/lib/jobs/sync-developer-count";
import { enforceRetention } from "@/lib/jobs/enforce-retention";
import { composeWeeklyDigest } from "@/lib/jobs/compose-weekly-digest";
import { recomputeAttribution } from "@/lib/jobs/recompute-attribution";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    recomputeAttribution,
    helloWorld,
    ingestProviderKey,
    orchestrateIngestion,
    cronHourlyIngestion,
    composeDailyDigest,
    cronDailyDigest,
    detectAnomaliesJob,
    notifyAnomaly,
    syncDeveloperCount,
    enforceRetention,
    composeWeeklyDigest,
  ],
});
