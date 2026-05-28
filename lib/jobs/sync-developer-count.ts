import { inngest } from "./client";
import { db } from "@/lib/db/client";
import { organizations, developers } from "@/lib/db/schema";
import { eq, and, isNull, count } from "drizzle-orm";
import { stripe } from "@/lib/stripe/client";
import { MIN_DEVELOPER_QUANTITY } from "@/lib/stripe/config";

/**
 * Syncs the Stripe subscription quantity to match the current
 * developer count. Fired when developers are added or removed.
 */
export const syncDeveloperCount = inngest.createFunction(
  {
    id: "sync-developer-count",
    triggers: [{ event: "billing/developer-count.changed" }],
  },
  async ({ event, step }) => {
    const { org_id } = event.data as { org_id: string };

    const result = await step.run("sync-quantity", async () => {
      const [org] = await db
        .select({
          stripeSubscriptionId: organizations.stripeSubscriptionId,
          plan: organizations.plan,
        })
        .from(organizations)
        .where(eq(organizations.id, org_id))
        .limit(1);

      if (!org?.stripeSubscriptionId || org.plan !== "pro") {
        return { skipped: true, reason: "not_pro" };
      }

      const [devCount] = await db
        .select({ count: count(developers.id) })
        .from(developers)
        .where(
          and(eq(developers.orgId, org_id), isNull(developers.deletedAt))
        );

      const quantity = Math.max(
        MIN_DEVELOPER_QUANTITY,
        Number(devCount?.count ?? 0)
      );

      const subscription = await stripe.subscriptions.retrieve(
        org.stripeSubscriptionId
      );
      const itemId = subscription.items.data[0]?.id;
      if (!itemId) return { skipped: true, reason: "no_subscription_item" };

      await stripe.subscriptionItems.update(itemId, { quantity });

      return { updated: true, quantity };
    });

    return result;
  }
);
