import type { Metadata } from "next";
import { PricingClient } from "./pricing-client";

export const metadata: Metadata = {
  title: "Pricing — Reckon",
  description:
    "Free for up to 3 developers. Pro is $19/developer/month with a $99/mo minimum. No per-event fees. No surprise overages. Cancel anytime.",
};

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-20">
      <div className="text-center">
        <h1 className="text-4xl font-semibold tracking-tight">Pricing</h1>
        <p className="mt-4 text-lg text-zinc-600">
          No per-event fees. No surprise overages. Cancel anytime.
        </p>
      </div>

      <PricingClient />

      {/* FAQ */}
      <div className="mt-20">
        <h2 className="text-2xl font-semibold tracking-tight">Pricing FAQ</h2>
        <div className="mt-8 space-y-6">
          <div>
            <h3 className="font-medium text-zinc-900">
              How is the price calculated?
            </h3>
            <p className="mt-1 text-zinc-600">
              Pro is $19 per tracked developer per month. We bill for the number
              of developers you&apos;re tracking, with a minimum charge equal to
              6 developers ($99/mo).
            </p>
          </div>
          <div>
            <h3 className="font-medium text-zinc-900">
              What counts as a tracked developer?
            </h3>
            <p className="mt-1 text-zinc-600">
              Anyone whose provider keys you&apos;ve added to Reckon. Remove a
              developer and your next invoice adjusts automatically.
            </p>
          </div>
          <div>
            <h3 className="font-medium text-zinc-900">Are there usage fees?</h3>
            <p className="mt-1 text-zinc-600">
              No. We charge a flat per-developer rate regardless of how much AI
              spend we observe. No per-event fees, no overages.
            </p>
          </div>
          <div>
            <h3 className="font-medium text-zinc-900">Can I cancel anytime?</h3>
            <p className="mt-1 text-zinc-600">
              Yes. Cancel from the billing portal and you keep Pro through the
              end of your billing period.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
