import { serve } from "inngest/next";
import { inngest } from "@/lib/jobs/client";
import { helloWorld } from "@/lib/jobs/hello";
import { ingestProviderKey } from "@/lib/jobs/ingest-provider-key";
import { orchestrateIngestion } from "@/lib/jobs/orchestrate-ingestion";
import { cronHourlyIngestion } from "@/lib/jobs/cron-hourly";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    helloWorld,
    ingestProviderKey,
    orchestrateIngestion,
    cronHourlyIngestion,
  ],
});
