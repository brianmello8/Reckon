import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — Reckon",
  description:
    "The terms governing your use of Reckon, the read-only AI spend observability service.",
};

// NOTE: Thorough Reckon-specific template. Have counsel review and set the
// governing-law jurisdiction before relying on it.
const EFFECTIVE = "May 29, 2026";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-[18px] font-semibold text-ink">{title}</h2>
      <div className="mt-2 space-y-3 text-[14px] leading-relaxed text-ink-2">
        {children}
      </div>
    </section>
  );
}

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-20">
      <h1 className="text-[clamp(30px,5vw,42px)] font-semibold tracking-[-0.025em] text-ink">
        Terms of Service
      </h1>
      <p className="mt-3 text-[13px] text-ink-3">Last updated: {EFFECTIVE}</p>

      <div className="mt-10 space-y-10">
        <Section title="1. Agreement">
          <p>
            These Terms of Service (&quot;Terms&quot;) govern your access to and
            use of Reckon (the &quot;Service&quot;), operated by Reckon
            (&quot;we,&quot; &quot;us&quot;). By creating an account or using the
            Service, you agree to these Terms on behalf of yourself and the
            organization you represent. If you do not agree, do not use the
            Service.
          </p>
        </Section>

        <Section title="2. The Service">
          <p>
            Reckon provides read-only observability and anomaly detection for AI
            provider spend. We poll the usage APIs you connect (Anthropic,
            OpenAI, GitHub Copilot, and others we may add) and surface
            per-developer spend, trends, and anomalies, with optional Slack and
            Linear notifications.
          </p>
          <p>
            <span className="font-medium text-ink">Read-only by design.</span>{" "}
            Reckon does not proxy, intercept, modify, route, or throttle your AI
            traffic, and does not enforce budgets or block requests. It observes
            and reports; it does not control spend.
          </p>
        </Section>

        <Section title="3. Accounts &amp; organizations">
          <p>
            You must provide accurate information and keep your credentials
            secure. You are responsible for activity under your account and for
            your organization&apos;s users. Roles (admin and member) determine
            access within your organization. You must be at least 16 and able to
            form a binding contract.
          </p>
        </Section>

        <Section title="4. Your provider keys &amp; responsibilities">
          <p>
            You represent that you are authorized to connect the API keys you
            add and to track usage for the developers in your organization, and
            that doing so complies with the applicable provider&apos;s terms and
            any internal policies or consents required. You are responsible for
            obtaining any necessary permission from the developers whose usage
            you track. You may remove keys and developers at any time.
          </p>
        </Section>

        <Section title="5. Acceptable use">
          <p>You agree not to:</p>
          <ul className="ml-5 list-disc space-y-1">
            <li>access data belonging to another organization or attempt to bypass tenant isolation;</li>
            <li>reverse engineer, disrupt, or overload the Service;</li>
            <li>use the Service unlawfully or to infringe others&apos; rights;</li>
            <li>resell or provide the Service to third parties except as permitted.</li>
          </ul>
        </Section>

        <Section title="6. Billing &amp; subscriptions">
          <p>
            Reckon offers a Free tier and a paid Pro plan. Pro is billed per
            tracked developer with a monthly minimum, through Stripe, in advance
            on a recurring basis. Adding or removing developers adjusts your
            quantity. You authorize us and Stripe to charge your payment method
            for all fees. Fees are non-refundable except where required by law.
            You may cancel at any time and retain Pro access through the end of
            the current billing period. We may change pricing with reasonable
            notice; changes apply to the next billing cycle.
          </p>
        </Section>

        <Section title="7. Plan limits">
          <p>
            Free-tier limits (e.g., up to 3 developers, one provider, 30-day
            retention, daily digest only) are described at sign-up and in the
            app. Exceeding a limit may require an upgrade. Downgrading does not
            delete data automatically, but may restrict new additions until you
            are within plan limits.
          </p>
        </Section>

        <Section title="8. Data accuracy disclaimer">
          <p>
            Spend and usage figures are derived from data reported by third-party
            provider APIs and from our own price tables, and may be delayed,
            revised by the provider, or differ from your official provider
            invoices. Reckon is an observability tool, not a system of record for
            billing or a substitute for your provider&apos;s invoice. Do not rely
            on Reckon figures as the authoritative source for amounts owed to any
            provider.
          </p>
        </Section>

        <Section title="9. Intellectual property">
          <p>
            We own the Service and all related software, designs, and content
            (excluding your data). You retain all rights to your data; you grant
            us a limited license to process it solely to provide and improve the
            Service as described in our{" "}
            <a href="/privacy" className="text-brand-ink underline">
              Privacy Policy
            </a>
            .
          </p>
        </Section>

        <Section title="10. Confidentiality &amp; security">
          <p>
            We protect your provider keys and data using the measures described
            in our{" "}
            <a href="/security" className="text-brand-ink underline">
              security overview
            </a>{" "}
            and Privacy Policy, including envelope encryption and tenant
            isolation. You agree to keep any non-public information about the
            Service confidential.
          </p>
        </Section>

        <Section title="11. Third-party services">
          <p>
            The Service integrates with third parties (AI providers, Slack,
            Linear, Stripe, and others). Your use of those services is governed
            by their own terms, and we are not responsible for their
            availability, accuracy, or actions.
          </p>
        </Section>

        <Section title="12. Disclaimer of warranties">
          <p>
            The Service is provided &quot;as is&quot; and &quot;as
            available,&quot; without warranties of any kind, express or implied,
            including merchantability, fitness for a particular purpose, and
            non-infringement. We do not warrant that the Service will be
            uninterrupted, error-free, or that figures will be accurate or
            complete.
          </p>
        </Section>

        <Section title="13. Limitation of liability">
          <p>
            To the maximum extent permitted by law, Reckon will not be liable for
            any indirect, incidental, special, consequential, or punitive
            damages, or for lost profits, revenues, data, or AI spend overruns.
            Our total liability for any claim arising out of or relating to the
            Service will not exceed the amount you paid us in the twelve months
            before the event giving rise to the claim (or USD $100 if you are on
            the Free tier).
          </p>
        </Section>

        <Section title="14. Indemnification">
          <p>
            You agree to indemnify and hold us harmless from claims arising out
            of your use of the Service, your data, or your breach of these Terms,
            including your connection of provider keys or tracking of developers
            without proper authorization.
          </p>
        </Section>

        <Section title="15. Termination">
          <p>
            You may stop using the Service and delete your account at any time.
            We may suspend or terminate access if you breach these Terms or to
            protect the Service. On termination, your right to use the Service
            ends and we will delete your data as described in the Privacy Policy.
          </p>
        </Section>

        <Section title="16. Governing law">
          <p>
            These Terms are governed by the laws of the United States and the
            state in which Reckon is established, without regard to conflict-of-law
            rules. Disputes will be resolved in the courts located there, unless
            applicable law requires otherwise.
          </p>
        </Section>

        <Section title="17. Changes to these Terms">
          <p>
            We may update these Terms from time to time. Material changes will be
            reflected by the &quot;Last updated&quot; date above and, where
            appropriate, communicated by email or in-app notice. Continued use
            after changes take effect constitutes acceptance.
          </p>
        </Section>

        <Section title="18. Contact">
          <p>
            Questions about these Terms? Email{" "}
            <a href="mailto:hello@getreckon.dev" className="text-brand-ink underline">
              hello@getreckon.dev
            </a>
            .
          </p>
        </Section>
      </div>
    </div>
  );
}
