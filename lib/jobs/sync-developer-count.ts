import { inngest } from "./client";

/**
 * Historically forced the Stripe quantity to max(6, developer-count). Under the
 * seat-based model (Phase: pricing rework) seats are BUYER-CHOSEN at checkout and
 * in the billing portal, and `organizations.seat_count` is set from the
 * subscription by the billing webhook — so auto-overriding the quantity would
 * fight the customer's choice. This is now a no-op; tracked-developer count vs
 * purchased seats is surfaced on the billing page (over-seat advisory), never
 * auto-billed. Kept registered so the existing event has a handler.
 */
export const syncDeveloperCount = inngest.createFunction(
  {
    id: "sync-developer-count",
    triggers: [{ event: "billing/developer-count.changed" }],
  },
  async () => {
    return { skipped: true, reason: "seats are buyer-managed (no auto-sync)" };
  }
);
