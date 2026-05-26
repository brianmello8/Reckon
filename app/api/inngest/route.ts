import { serve } from "inngest/next";
import { inngest } from "@/lib/jobs/client";
import { helloWorld } from "@/lib/jobs/hello";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [helloWorld],
});
