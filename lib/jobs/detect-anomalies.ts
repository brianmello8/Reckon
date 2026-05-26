import { inngest } from "./client";
import { db } from "@/lib/db/client";
import { anomalies } from "@/lib/db/schema";
import { detectAnomaliesForOrg } from "@/lib/anomaly/detect";

export const detectAnomaliesJob = inngest.createFunction(
  {
    id: "anomaly-detect",
    triggers: [{ event: "anomaly/detect.requested" }],
  },
  async ({ event, step }) => {
    const { org_id } = event.data as { org_id: string };

    // Step 1: Run detection
    const newAnomalies = await step.run("detect", async () => {
      return detectAnomaliesForOrg(org_id);
    });

    if (newAnomalies.length === 0) {
      return { status: "ok", anomalies_found: 0 };
    }

    // Step 2: Insert new anomalies
    const insertedIds = await step.run("insert-anomalies", async () => {
      const ids: string[] = [];
      for (const a of newAnomalies) {
        const [row] = await db
          .insert(anomalies)
          .values({
            orgId: a.orgId,
            developerId: a.developerId,
            kind: a.kind,
            severity: a.severity,
            details: a.details,
          })
          .returning({ id: anomalies.id });
        ids.push(row.id);
      }
      return ids;
    });

    // Step 3: Fire notification events for each anomaly
    await step.run("notify", async () => {
      const events = insertedIds.map((id) => ({
        name: "anomaly/notify.requested" as const,
        data: { anomaly_id: id },
      }));
      await inngest.send(events);
    });

    return { status: "ok", anomalies_found: insertedIds.length };
  }
);
