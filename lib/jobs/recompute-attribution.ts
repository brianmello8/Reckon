import { inngest } from "./client";
import { recomputeOrgKeyMappingAttribution } from "@/lib/attribution/key-mapping";

/**
 * Recompute key_mapping attribution for an org (Phase 8.2). Fired when an
 * identity→agent or developer→agent mapping is created/changed, and from the
 * manual "Recompute attribution" action. Idempotent (delete + reinsert).
 */
export const recomputeAttribution = inngest.createFunction(
  {
    id: "recompute-attribution",
    retries: 3,
    triggers: [{ event: "attribution/recompute.requested" }],
  },
  async ({ event, step }) => {
    const { org_id } = event.data as { org_id: string };

    const result = await step.run("recompute-key-mapping", async () => {
      return recomputeOrgKeyMappingAttribution(org_id);
    });

    return { status: "ok", ...result };
  }
);
