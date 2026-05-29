import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Reckon",
  description:
    "How Reckon collects, uses, and protects data. We are a read-only observer — we never see your AI prompts or responses.",
};

// NOTE: This is a thorough, Reckon-specific template. Have counsel review
// before relying on it, and confirm the sub-processor list stays current.
const EFFECTIVE = "May 29, 2026";

const SUBPROCESSORS = [
  ["Vercel", "Application hosting & CDN", "United States"],
  ["Supabase (Postgres)", "Primary database", "United States"],
  ["Clerk", "Authentication & user management", "United States"],
  ["Stripe", "Payments & subscription billing", "United States"],
  ["AWS KMS", "Encryption key management", "United States"],
  ["Inngest", "Background job processing", "United States"],
  ["Resend", "Transactional email", "United States"],
  ["Sentry", "Error monitoring", "United States"],
  ["Anthropic / OpenAI / GitHub", "AI usage data you connect", "United States"],
];

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

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-20">
      <h1 className="text-[clamp(30px,5vw,42px)] font-semibold tracking-[-0.025em] text-ink">
        Privacy Policy
      </h1>
      <p className="mt-3 text-[13px] text-ink-3">Last updated: {EFFECTIVE}</p>

      <div className="mt-10 space-y-10">
        <Section title="1. Overview">
          <p>
            Reckon (&quot;Reckon,&quot; &quot;we,&quot; &quot;us&quot;) provides
            read-only observability and anomaly detection for AI/LLM spend. This
            policy explains what we collect, how we use it, who we share it
            with, and the choices you have. It applies to{" "}
            <span className="font-medium text-ink">getreckon.dev</span> and the
            Reckon application.
          </p>
          <p>
            The most important thing to know:{" "}
            <span className="font-medium text-ink">
              Reckon is a passive observer.
            </span>{" "}
            We poll the usage APIs that AI providers already expose and read the
            numbers they report. We never sit in your request path to those
            providers, and{" "}
            <span className="font-medium text-ink">
              we never see, receive, or store the content of your AI prompts or
              responses.
            </span>
          </p>
        </Section>

        <Section title="2. Information we collect">
          <p>
            <span className="font-medium text-ink">Account &amp; organization data.</span>{" "}
            When you sign up, our authentication provider (Clerk) collects your
            name, email address, and authentication identifiers (including data
            from Google or GitHub if you use social sign-in). We store your
            organization name, role, and the developers you choose to track.
          </p>
          <p>
            <span className="font-medium text-ink">AI usage data.</span> For each
            provider API key you connect, we poll the provider&apos;s usage API
            and store aggregate usage records: date, model, token counts (input,
            output, cached), and computed cost. This data is reported at the API
            key level and attributed to the developer you associate with the key.
          </p>
          <p>
            <span className="font-medium text-ink">Provider API keys.</span> The
            keys you add are encrypted at rest (see Section 4).
          </p>
          <p>
            <span className="font-medium text-ink">Billing data.</span> Payments
            are processed by Stripe. We store a Stripe customer/subscription
            identifier and plan status; we do not store your card number.
          </p>
          <p>
            <span className="font-medium text-ink">Operational data.</span> We
            log errors and performance data (tagged with organization and user
            identifiers) to operate and secure the service, and we may set
            cookies required for authentication and session management.
          </p>
        </Section>

        <Section title="3. What we explicitly do NOT collect">
          <p>
            We do not collect or store the content of your AI requests — no
            prompts, no completions, no embeddings, no file contents. We are not
            in your request path to any AI provider and have no access to that
            traffic. We only read the aggregate usage figures the provider
            publishes through its own admin/usage API.
          </p>
        </Section>

        <Section title="4. Provider API keys &amp; encryption">
          <p>
            Provider keys are protected with envelope encryption: each key is
            encrypted with AES-256-GCM using a unique data key, which is itself
            encrypted by a master key held in AWS Key Management Service (KMS).
            Keys are decrypted only inside our ingestion workers at poll time —
            never in the web application. Only the last four characters of a key
            are ever displayed or logged. Keys are used solely to retrieve usage
            data from the corresponding provider and for no other purpose.
          </p>
        </Section>

        <Section title="5. How we use information">
          <p>We use the information we collect to:</p>
          <ul className="ml-5 list-disc space-y-1">
            <li>provide per-developer spend reporting, trends, and anomaly detection;</li>
            <li>send Slack digests, anomaly alerts, and (where connected) file Linear issues;</li>
            <li>send transactional email such as developer invitations;</li>
            <li>process subscriptions and enforce plan limits;</li>
            <li>secure, monitor, debug, and improve the service.</li>
          </ul>
          <p>
            We do not use your data to train machine-learning models, and we do
            not sell your data.
          </p>
        </Section>

        <Section title="6. Sub-processors">
          <p>
            We share data only with the service providers required to operate
            Reckon. Each is contractually bound to protect it:
          </p>
          <div className="mt-2 overflow-hidden rounded-xl border border-line">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-line bg-bg-2 text-left text-ink-3">
                  <th className="px-3 py-2 font-medium">Sub-processor</th>
                  <th className="px-3 py-2 font-medium">Purpose</th>
                  <th className="px-3 py-2 font-medium">Region</th>
                </tr>
              </thead>
              <tbody>
                {SUBPROCESSORS.map(([name, purpose, region]) => (
                  <tr key={name} className="border-b border-line last:border-0">
                    <td className="px-3 py-2 font-medium text-ink">{name}</td>
                    <td className="px-3 py-2 text-ink-2">{purpose}</td>
                    <td className="px-3 py-2 text-ink-2">{region}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="7. Data retention">
          <p>
            Usage records are retained according to your plan:{" "}
            <span className="font-medium text-ink">30 days on Free</span> and{" "}
            <span className="font-medium text-ink">365 days on Pro</span>. Older
            records are deleted automatically. Account and organization records
            are retained while your account is active. On account deletion, we
            delete or anonymize your data within 30 days, except where retention
            is required by law (e.g., tax/billing records).
          </p>
        </Section>

        <Section title="8. Your rights">
          <p>
            Depending on where you live (e.g., the EEA/UK under GDPR, or
            California under the CCPA/CPRA), you may have the right to access,
            correct, export, or delete your personal data, and to object to or
            restrict certain processing. You can exercise these rights — or ask
            us to delete your organization&apos;s data at any time — by emailing{" "}
            <a href="mailto:privacy@getreckon.dev" className="text-brand-ink underline">
              privacy@getreckon.dev
            </a>
            . We do not sell personal information.
          </p>
        </Section>

        <Section title="9. International transfers">
          <p>
            Reckon and its sub-processors operate in the United States. If you
            access the service from outside the U.S., your information will be
            transferred to and processed in the U.S. We rely on appropriate
            safeguards (such as Standard Contractual Clauses) where required.
          </p>
        </Section>

        <Section title="10. Security">
          <p>
            We use structural tenant isolation (every record is scoped to an
            organization, enforced by database row-level security), envelope
            encryption for secrets, encryption in transit (TLS 1.2+), and
            least-privilege access. No system is perfectly secure, but security
            is the single largest responsibility we carry — see our{" "}
            <a href="/security" className="text-brand-ink underline">
              security overview
            </a>
            .
          </p>
        </Section>

        <Section title="11. Cookies">
          <p>
            We use only the cookies necessary for authentication, session
            management, and security. We do not use third-party advertising
            cookies.
          </p>
        </Section>

        <Section title="12. Children">
          <p>
            Reckon is a business tool not directed to children and is not
            intended for anyone under 16. We do not knowingly collect data from
            children.
          </p>
        </Section>

        <Section title="13. Changes to this policy">
          <p>
            We may update this policy from time to time. Material changes will
            be reflected by the &quot;Last updated&quot; date above and, where
            appropriate, communicated by email or in-app notice.
          </p>
        </Section>

        <Section title="14. Contact">
          <p>
            Questions or requests? Email{" "}
            <a href="mailto:privacy@getreckon.dev" className="text-brand-ink underline">
              privacy@getreckon.dev
            </a>
            .
          </p>
        </Section>
      </div>
    </div>
  );
}
