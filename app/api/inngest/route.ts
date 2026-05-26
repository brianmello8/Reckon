import { serve } from "inngest/next";
import { inngest } from "@/lib/jobs/client";
import { helloWorld } from "@/lib/jobs/hello";
import { ingestProviderKey } from "@/lib/jobs/ingest-provider-key";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [helloWorld, ingestProviderKey],
});
