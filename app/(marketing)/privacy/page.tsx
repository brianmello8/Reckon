import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Reckon",
};

// NOTE: Boilerplate for legal review before launch. Not legal advice.
export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-20">
      <h1 className="text-4xl font-semibold tracking-tight">Privacy Policy</h1>
      <p className="mt-2 text-sm text-zinc-500">
        Last updated: {new Date().getFullYear()}. This is a placeholder pending
        legal review.
      </p>

      <div className="mt-10 space-y-8 text-zinc-600">
        <section>
          <h2 className="text-lg font-medium text-zinc-900">What we collect</h2>
          <p className="mt-2">
            We collect account information (name, email, organization) via our
            authentication provider, and AI usage data (token counts, costs,
            models) polled from the provider APIs you connect. We do not collect
            the content of your AI prompts or responses.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-medium text-zinc-900">
            How we use provider keys
          </h2>
          <p className="mt-2">
            The API keys you provide are encrypted at rest and used solely to
            poll usage data from the corresponding provider. They are never
            shared, sold, or used for any other purpose.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-medium text-zinc-900">Data sharing</h2>
          <p className="mt-2">
            We do not sell your data. We share data only with the
            sub-processors required to operate the service (hosting, database,
            authentication, billing, error monitoring, and the AI providers you
            connect).
          </p>
        </section>

        <section>
          <h2 className="text-lg font-medium text-zinc-900">Data retention</h2>
          <p className="mt-2">
            Usage data is retained according to your plan (30 days on Free, 365
            days on Pro). You may request deletion of your organization&apos;s
            data at any time.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-medium text-zinc-900">Contact</h2>
          <p className="mt-2">
            Questions about privacy? Email{" "}
            <a href="mailto:privacy@getreckon.dev" className="underline">
              privacy@getreckon.dev
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
