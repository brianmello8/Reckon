import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/client";
import { db } from "@/lib/db/client";
import { organizations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { proPriceIds, financePriceIds } from "@/lib/stripe/config";
import type Stripe from "stripe";

/** Derive seatCount + financeEnabled from a subscription's line items. */
function readEntitlements(sub: Stripe.Subscription): { seatCount: number | null; financeEnabled: boolean } {
  const seatIds = proPriceIds();
  const finIds = financePriceIds();
  let seatCount: number | null = null;
  let financeEnabled = false;
  for (const item of sub.items.data) {
    const priceId = item.price?.id;
    if (!priceId) continue;
    if (seatIds.includes(priceId)) seatCount = item.quantity ?? null;
    if (finIds.includes(priceId)) financeEnabled = true;
  }
  return { seatCount, financeEnabled };
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const orgId = session.client_reference_id;
      if (!orgId) break;

      const subscriptionId =
        typeof session.subscription === "string"
          ? session.subscription
          : session.subscription?.id;

      // Pull entitlements (seats + finance add-on) from the new subscription.
      let ent: { seatCount: number | null; financeEnabled: boolean } = { seatCount: null, financeEnabled: false };
      if (subscriptionId) {
        try {
          ent = readEntitlements(await stripe.subscriptions.retrieve(subscriptionId));
        } catch {
          // fall through with defaults; the subscription.* event will reconcile
        }
      }

      await db
        .update(organizations)
        .set({
          plan: "pro",
          stripeCustomerId:
            typeof session.customer === "string"
              ? session.customer
              : session.customer?.id ?? null,
          stripeSubscriptionId: subscriptionId ?? null,
          seatCount: ent.seatCount,
          financeEnabled: ent.financeEnabled,
          paymentStatus: null,
          updatedAt: new Date(),
        })
        .where(eq(organizations.id, orgId));
      break;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId =
        typeof subscription.customer === "string"
          ? subscription.customer
          : subscription.customer.id;

      const [org] = await db
        .select({ id: organizations.id })
        .from(organizations)
        .where(eq(organizations.stripeCustomerId, customerId))
        .limit(1);

      if (!org) break;

      const active = subscription.status === "active" || subscription.status === "trialing";
      const ent = readEntitlements(subscription);
      await db
        .update(organizations)
        .set({
          stripeSubscriptionId: subscription.id,
          plan: active ? "pro" : "free",
          // Entitlements only apply while active; clear them otherwise.
          seatCount: active ? ent.seatCount : null,
          financeEnabled: active ? ent.financeEnabled : false,
          updatedAt: new Date(),
        })
        .where(eq(organizations.id, org.id));
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId =
        typeof subscription.customer === "string"
          ? subscription.customer
          : subscription.customer.id;

      const [org] = await db
        .select({ id: organizations.id })
        .from(organizations)
        .where(eq(organizations.stripeCustomerId, customerId))
        .limit(1);

      if (!org) break;

      await db
        .update(organizations)
        .set({
          plan: "free",
          stripeSubscriptionId: null,
          seatCount: null,
          financeEnabled: false,
          paymentStatus: null,
          updatedAt: new Date(),
        })
        .where(eq(organizations.id, org.id));
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId =
        typeof invoice.customer === "string"
          ? invoice.customer
          : invoice.customer?.id;

      if (!customerId) break;

      const [org] = await db
        .select({ id: organizations.id })
        .from(organizations)
        .where(eq(organizations.stripeCustomerId, customerId))
        .limit(1);

      if (!org) break;

      // Don't downgrade immediately — mark as past_due
      await db
        .update(organizations)
        .set({
          paymentStatus: "past_due",
          updatedAt: new Date(),
        })
        .where(eq(organizations.id, org.id));
      break;
    }
  }

  return NextResponse.json({ received: true });
}
