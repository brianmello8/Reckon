"use server";

import { requireAdmin } from "@/lib/auth";
import { withOrgContext } from "@/lib/db/rls";
import { organizations, developers, providerKeys } from "@/lib/db/schema";
import { eq, and, isNull, count, countDistinct } from "drizzle-orm";
import { stripe } from "@/lib/stripe/client";
import {
  STRIPE_PRICE_MONTHLY,
  STRIPE_PRICE_ANNUAL,
  MIN_DEVELOPER_QUANTITY,
} from "@/lib/stripe/config";
import { redirect } from "next/navigation";

export async function getBillingData() {
  const user = await requireAdmin();

  const [org] = await withOrgContext(user.orgId, async (tx) => {
    return tx
      .select()
      .from(organizations)
      .where(eq(organizations.id, user.orgId))
      .limit(1);
  });

  if (!org) throw new Error("Org not found");

  // Count active developers
  const [devCount] = await withOrgContext(user.orgId, async (tx) => {
    return tx
      .select({ count: count(developers.id) })
      .from(developers)
      .where(
        and(eq(developers.orgId, user.orgId), isNull(developers.deletedAt))
      );
  });

  const developerCount = Number(devCount?.count ?? 0);

  // Count distinct providers used
  const [provCount] = await withOrgContext(user.orgId, async (tx) => {
    return tx
      .select({ count: countDistinct(providerKeys.providerId) })
      .from(providerKeys)
      .where(eq(providerKeys.orgId, user.orgId));
  });

  const providerCount = Number(provCount?.count ?? 0);

  // Get subscription details if Pro
  let subscription = null;
  if (org.stripeSubscriptionId) {
    try {
      const sub = await stripe.subscriptions.retrieve(org.stripeSubscriptionId) as unknown as {
        status: string;
        current_period_end: number;
        items: { data: Array<{ quantity?: number; price?: { recurring?: { interval?: string }; unit_amount?: number } }> };
      };
      const item = sub.items.data[0];
      subscription = {
        status: sub.status,
        currentPeriodEnd: new Date(sub.current_period_end * 1000).toISOString(),
        quantity: item?.quantity ?? 0,
        interval: item?.price?.recurring?.interval ?? "month",
        amount: (item?.price?.unit_amount ?? 0) * (item?.quantity ?? 0),
      };
    } catch {
      // Subscription may have been deleted
    }
  }

  return {
    plan: org.plan,
    paymentStatus: org.paymentStatus,
    developerCount,
    providerCount,
    subscription,
  };
}

export async function createCheckoutSession(interval: "month" | "year") {
  const user = await requireAdmin();

  const [org] = await withOrgContext(user.orgId, async (tx) => {
    return tx
      .select()
      .from(organizations)
      .where(eq(organizations.id, user.orgId))
      .limit(1);
  });

  if (!org) throw new Error("Org not found");

  // Count developers for quantity
  const [devCount] = await withOrgContext(user.orgId, async (tx) => {
    return tx
      .select({ count: count(developers.id) })
      .from(developers)
      .where(
        and(eq(developers.orgId, user.orgId), isNull(developers.deletedAt))
      );
  });

  const quantity = Math.max(MIN_DEVELOPER_QUANTITY, Number(devCount?.count ?? 0));
  const priceId = interval === "year" ? STRIPE_PRICE_ANNUAL : STRIPE_PRICE_MONTHLY;

  // Create or reuse Stripe customer
  let customerId = org.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      name: org.name,
      metadata: { org_id: org.id },
    });
    customerId = customer.id;
    await withOrgContext(user.orgId, async (tx) => {
      await tx
        .update(organizations)
        .set({ stripeCustomerId: customerId, updatedAt: new Date() })
        .where(eq(organizations.id, user.orgId));
    });
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity }],
    client_reference_id: org.id,
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/billing?success=true`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/billing?canceled=true`,
  });

  if (session.url) {
    redirect(session.url);
  }
}

export async function createPortalSession() {
  const user = await requireAdmin();

  const [org] = await withOrgContext(user.orgId, async (tx) => {
    return tx
      .select({ stripeCustomerId: organizations.stripeCustomerId })
      .from(organizations)
      .where(eq(organizations.id, user.orgId))
      .limit(1);
  });

  if (!org?.stripeCustomerId) throw new Error("No Stripe customer");

  const session = await stripe.billingPortal.sessions.create({
    customer: org.stripeCustomerId,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/billing`,
  });

  redirect(session.url);
}
