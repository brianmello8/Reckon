"use server";

import { requireAdmin } from "@/lib/auth";
import { withOrgContext } from "@/lib/db/rls";
import { organizations, developers, providerKeys } from "@/lib/db/schema";
import { eq, and, isNull, count, countDistinct } from "drizzle-orm";
import { stripe } from "@/lib/stripe/client";
import { entryPrice, proPrice, financePrice, entryPriceIds, proPriceIds, financePriceIds, MIN_SEATS } from "@/lib/stripe/config";
import { redirect } from "next/navigation";

export async function getBillingData() {
  const user = await requireAdmin();

  const [org] = await withOrgContext(user.orgId, async (tx) =>
    tx.select().from(organizations).where(eq(organizations.id, user.orgId)).limit(1)
  );
  if (!org) throw new Error("Org not found");

  const [devCount] = await withOrgContext(user.orgId, async (tx) =>
    tx
      .select({ count: count(developers.id) })
      .from(developers)
      .where(and(eq(developers.orgId, user.orgId), isNull(developers.deletedAt)))
  );
  const developerCount = Number(devCount?.count ?? 0);

  const [provCount] = await withOrgContext(user.orgId, async (tx) =>
    tx
      .select({ count: countDistinct(providerKeys.providerId) })
      .from(providerKeys)
      .where(eq(providerKeys.orgId, user.orgId))
  );
  const providerCount = Number(provCount?.count ?? 0);

  // Live subscription breakdown (seat line + optional finance add-on line).
  let subscription = null;
  if (org.stripeSubscriptionId) {
    try {
      const sub = (await stripe.subscriptions.retrieve(org.stripeSubscriptionId)) as unknown as {
        status: string;
        current_period_end?: number;
        items: { data: Array<{ quantity?: number; current_period_end?: number; price?: { id: string; recurring?: { interval?: string }; unit_amount?: number } }> };
      };
      const entryIds = entryPriceIds();
      const seatIds = proPriceIds();
      const finIds = financePriceIds();
      const entryItem = sub.items.data.find((i) => i.price && entryIds.includes(i.price.id));
      const seatItem = sub.items.data.find((i) => i.price && seatIds.includes(i.price.id));
      const finItem = sub.items.data.find((i) => i.price && finIds.includes(i.price.id));
      const seatUnit = seatItem?.price?.unit_amount ?? 0;
      const seats = seatItem?.quantity ?? 0;
      const finAmount = finItem ? finItem.price?.unit_amount ?? 0 : 0;
      const entryAmount = entryItem ? entryItem.price?.unit_amount ?? 0 : 0;
      const tier: "entry" | "pro" = seatItem ? "pro" : "entry";
      // Stripe moved current_period_end onto the subscription item in newer API
      // versions — read it from either location, and guard against a bad value.
      const periodEndTs = sub.current_period_end ?? sub.items.data[0]?.current_period_end;
      const currentPeriodEnd =
        periodEndTs && Number.isFinite(periodEndTs)
          ? new Date(periodEndTs * 1000).toISOString()
          : null;
      subscription = {
        status: sub.status,
        tier,
        currentPeriodEnd,
        interval: (seatItem ?? entryItem)?.price?.recurring?.interval ?? "month",
        seats,
        seatUnitAmount: seatUnit,
        financeAmount: finAmount,
        totalAmount: tier === "pro" ? seatUnit * seats + finAmount : entryAmount,
      };
    } catch {
      // Subscription may have been deleted.
    }
  }

  return {
    plan: org.plan,
    paymentStatus: org.paymentStatus,
    developerCount,
    providerCount,
    seatCount: org.seatCount ?? null,
    financeEnabled: org.financeEnabled,
    minSeats: MIN_SEATS,
    subscription,
  };
}

export async function createCheckoutSession(input: {
  tier: "entry" | "pro" | "pro_finance";
  interval: "month" | "year";
  seats?: number;
}) {
  const user = await requireAdmin();

  const [org] = await withOrgContext(user.orgId, async (tx) =>
    tx.select().from(organizations).where(eq(organizations.id, user.orgId)).limit(1)
  );
  if (!org) throw new Error("Org not found");

  // Create or reuse the Stripe customer.
  let customerId = org.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({ name: org.name, metadata: { org_id: org.id } });
    customerId = customer.id;
    await withOrgContext(user.orgId, async (tx) => {
      await tx.update(organizations).set({ stripeCustomerId: customerId, updatedAt: new Date() }).where(eq(organizations.id, user.orgId));
    });
  }

  type Line = { price: string; quantity: number; adjustable_quantity?: { enabled: boolean; minimum: number } };
  const lineItems: Line[] = [];
  if (input.tier === "entry") {
    // Flat $5/mo entry tier — single line item, fixed quantity.
    const p = entryPrice(input.interval);
    if (!p) throw new Error("Entry price not configured. Set STRIPE_PRICE_ENTRY_* env vars.");
    lineItems.push({ price: p, quantity: 1 });
  } else {
    // Pro (and Pro Finance) — per-seat, buyer picks the count.
    const seatPrice = proPrice(input.interval);
    if (!seatPrice) throw new Error("Pro price not configured. Set STRIPE_PRICE_PRO_* env vars.");
    const seats = Math.max(MIN_SEATS, Math.floor(input.seats || 0));
    lineItems.push({ price: seatPrice, quantity: seats, adjustable_quantity: { enabled: true, minimum: MIN_SEATS } });
    if (input.tier === "pro_finance") {
      const finId = financePrice(input.interval);
      if (!finId) throw new Error("Finance price not configured. Set STRIPE_PRICE_FINANCE_* env vars.");
      lineItems.push({ price: finId, quantity: 1 });
    }
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: lineItems,
    client_reference_id: org.id,
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/billing?success=true`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/billing?canceled=true`,
  });

  if (session.url) redirect(session.url);
}

export async function createPortalSession() {
  const user = await requireAdmin();

  const [org] = await withOrgContext(user.orgId, async (tx) =>
    tx.select({ stripeCustomerId: organizations.stripeCustomerId }).from(organizations).where(eq(organizations.id, user.orgId)).limit(1)
  );
  if (!org?.stripeCustomerId) throw new Error("No Stripe customer");

  const session = await stripe.billingPortal.sessions.create({
    customer: org.stripeCustomerId,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/billing`,
  });
  redirect(session.url);
}
