import { inngest } from "./client";
import { recomputeOrgAllocations } from "@/lib/finance/allocate";

/**
 * Recompute cost_allocations for an org (Phase 9.2). Fired when an attribution
 * rule, override, or suspense account changes, and from the manual "recompute"
 * action. Idempotent drop-and-rebuild; overrides survive.
 */
export const recomputeAllocations = inngest.createFunction(
  {
    id: "recompute-allocations",
    retries: 3,
    triggers: [{ event: "allocation/recompute.requested" }],
  },
  async ({ event, step }) => {
    const { org_id } = event.data as { org_id: string };
    const result = await step.run("recompute", async () =>
      recomputeOrgAllocations(org_id)
    );
    return { status: "ok", ...result };
  }
);
