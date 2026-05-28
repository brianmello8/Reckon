import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — Reckon",
};

// NOTE: Boilerplate for legal review before launch. Not legal advice.
export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-20">
      <h1 className="text-4xl font-semibold tracking-tight">
        Terms of Service
      </h1>
      <p className="mt-2 text-sm text-zinc-500">
        Last updated: {new Date().getFullYear()}. This is a placeholder pending
        legal review.
      </p>

      <div className="mt-10 space-y-8 text-zinc-600">
        <section>
          <h2 className="text-lg font-medium text-zinc-900">The service</h2>
          <p className="mt-2">
            Reckon provides read-only observability and anomaly detection for
            AI provider spend. We poll the provider usage APIs you connect and
            surface per-developer spend, trends, and anomalies.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-medium text-zinc-900">
            Your responsibilities
          </h2>
          <p className="mt-2">
            You are responsible for the API keys you connect and for ensuring
            you have the right to track usage for the developers in your
            organization. You agree not to misuse the service or attempt to
            access data belonging to other organizations.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-medium text-zinc-900">Billing</h2>
          <p className="mt-2">
            Pro subscriptions are billed per tracked developer with a monthly
            minimum. You may cancel at any time and retain access through the
            end of your billing period. Fees are non-refundable except where
            required by law.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-medium text-zinc-900">
            Disclaimer of warranties
          </h2>
          <p className="mt-2">
            The service is provided &quot;as is.&quot; Spend figures are derived
            from provider-reported usage data and may differ from your official
            provider invoices. Reckon is an observability tool, not a system of
            record for billing.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-medium text-zinc-900">Contact</h2>
          <p className="mt-2">
            Questions about these terms? Email{" "}
            <a href="mailto:hello@getreckon.dev" className="underline">
              hello@getreckon.dev
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
