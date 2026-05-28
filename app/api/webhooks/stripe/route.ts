import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/client";
import { db } from "@/lib/db/client";
import { organizations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";

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

      await db
        .update(organizations)
        .set({
          plan: "pro",
          stripeCustomerId:
            typeof session.customer === "string"
              ? session.customer
              : session.customer?.id ?? null,
          stripeSubscriptionId: subscriptionId ?? null,
          paymentStatus: null,
          updatedAt: new Date(),
        })
        .where(eq(organizations.id, orgId));
      break;
    }

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

      await db
        .update(organizations)
        .set({
          stripeSubscriptionId: subscription.id,
          plan: subscription.status === "active" ? "pro" : "free",
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
