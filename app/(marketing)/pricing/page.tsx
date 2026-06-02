import { PricingClient } from "./pricing-client";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Pricing",
  description:
    "Free for up to 3 developers. Pro is $8 per tracked-developer seat / month — pick any number of seats. Pro Finance adds the finance suite for a flat fee. No per-event fees, no overages. Cancel anytime.",
  path: "/pricing",
});

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-20">
      <div className="text-center">
        <h1 className="text-4xl font-semibold tracking-tight">Pricing</h1>
        <p className="mt-4 text-lg text-ink-2">
          No per-event fees. No surprise overages. Cancel anytime.
        </p>
      </div>

      <PricingClient />

      {/* FAQ */}
      <div className="mt-20">
        <h2 className="text-2xl font-semibold tracking-tight">Pricing FAQ</h2>
        <div className="mt-8 space-y-6">
          <div>
            <h3 className="font-medium text-ink">
              How is the price calculated?
            </h3>
            <p className="mt-1 text-ink-2">
              Pro is $8 per seat per month (a seat = one tracked developer), or
              $80/seat/year. You choose the number of seats at checkout (minimum
              3) and change it anytime. Pro Finance adds the full finance suite
              for a flat $499/mo ($4,990/yr), org-wide — not per seat.
            </p>
          </div>
          <div>
            <h3 className="font-medium text-ink">
              What counts as a tracked developer?
            </h3>
            <p className="mt-1 text-ink-2">
              A person whose AI spend Reckon attributes from your org&apos;s
              provider usage. You buy seats to cover them; the billing page shows
              seats used vs purchased so you can add seats when you grow.
            </p>
          </div>
          <div>
            <h3 className="font-medium text-ink">Are there usage fees?</h3>
            <p className="mt-1 text-ink-2">
              No. We charge a flat per-seat rate regardless of how much AI spend
              we observe. No per-event fees, no overages.
            </p>
          </div>
          <div>
            <h3 className="font-medium text-ink">Can I cancel anytime?</h3>
            <p className="mt-1 text-ink-2">
              Yes. Cancel from the billing portal and you keep Pro through the
              end of your billing period.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
