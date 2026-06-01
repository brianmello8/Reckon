import { Spike } from "@/components/reckon/primitives";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Security",
  description:
    "How Reckon protects your data: read-only by design, never sees your prompts, envelope-encrypted keys, structural tenant isolation, signed webhooks.",
  path: "/security",
});

type Group = { title: string; points: { h: string; b: string }[] };

const GROUPS: Group[] = [
  {
    title: "Architecture",
    points: [
      {
        h: "Read-only by design",
        b: "We never sit in your request path to AI providers. We poll the admin/usage APIs they already expose and read what they report. There is no proxy, no TLS termination of your traffic, and no mechanism for us to see, route, modify, or throttle your AI calls.",
      },
      {
        h: "We never see prompts or responses",
        b: "Because we are a passive observer, we have no access to the content of your AI requests — no prompts, completions, embeddings, or files. We only ingest the aggregate usage numbers (tokens, model, cost) the provider publishes at the API-key level.",
      },
      {
        h: "Separation of planes",
        b: "The web application, background ingestion workers, and database run as separate concerns. Provider keys are only ever decrypted inside the ingestion worker — never in the web tier that serves your browser.",
      },
    ],
  },
  {
    title: "Encryption & key management",
    points: [
      {
        h: "Envelope encryption for every provider key",
        b: "Each API key is encrypted with AES-256-GCM using a unique per-key data key. That data key is itself encrypted by a master key (CMK) held in AWS KMS — the key material never leaves KMS. A leak of our database alone reveals nothing usable.",
      },
      {
        h: "Encryption in transit",
        b: "All connections use TLS 1.2+. Outbound calls to providers go through a single hardened HTTP client with strict timeouts.",
      },
      {
        h: "Minimal exposure",
        b: "Only the last four characters of a key are ever displayed in the app or written to logs. Plaintext keys never enter logs, error messages, or monitoring tools, and the plaintext data key is zeroed from memory immediately after use.",
      },
      {
        h: "Key rotation",
        b: "The KMS master key has automatic annual rotation enabled. Per-key data keys are single-use by construction.",
      },
    ],
  },
  {
    title: "Tenant isolation",
    points: [
      {
        h: "Defense in depth",
        b: "Every row of customer data carries an organization ID. Application queries are always scoped to the caller's organization, and Postgres row-level security policies enforce that scoping as a backstop.",
      },
      {
        h: "Bugs fail closed",
        b: "If a query is ever mis-scoped, row-level security returns zero rows rather than another organization's data — turning a would-be leak into an empty result.",
      },
    ],
  },
  {
    title: "Authentication & access",
    points: [
      {
        h: "We don't roll our own auth",
        b: "Authentication is handled by Clerk. We never store passwords. Sessions are JWT-based and validated server-side on every request. Social sign-in (Google, GitHub) uses our own OAuth credentials, scoped to email and profile only.",
      },
      {
        h: "Roles",
        b: "Organizations have admin and member roles. Sensitive actions — managing keys, billing, and integrations — are restricted to admins and enforced server-side.",
      },
    ],
  },
  {
    title: "Integrations & webhooks",
    points: [
      {
        h: "Every inbound webhook is verified",
        b: "Stripe webhooks are verified against the signing secret; Slack requests are verified with the signing secret and a timestamp window; Clerk webhooks are verified with Svix signatures. Unsigned or stale requests are rejected.",
      },
      {
        h: "Scoped integration tokens",
        b: "Slack and Linear tokens are stored with the same envelope encryption as provider keys and request only the scopes needed to post digests and file issues.",
      },
    ],
  },
  {
    title: "Operations & reliability",
    points: [
      {
        h: "Idempotent, retryable ingestion",
        b: "Usage ingestion is idempotent (safe to re-run) and isolated per key, so a single failing key never blocks others. Jobs run on managed infrastructure with retries and dead-letter handling.",
      },
      {
        h: "Monitoring",
        b: "Errors are captured in Sentry, tagged by organization, so we can detect and respond to issues quickly without exposing secrets.",
      },
      {
        h: "Managed, backed-up infrastructure",
        b: "We run on managed providers (Vercel, Supabase Postgres, AWS KMS, Inngest) with automated backups and point-in-time recovery on the database.",
      },
    ],
  },
  {
    title: "Compliance posture",
    points: [
      {
        h: "We inherit certified infrastructure",
        b: "Every sub-processor that stores or processes customer data — Vercel, Supabase (Postgres), AWS (KMS), Clerk, Stripe, Inngest, Sentry — maintains SOC 2 Type II and/or ISO 27001 certification. The physical, network, and host-level controls of the platforms Reckon runs on are independently audited; we build our application controls on top of them.",
      },
      {
        h: "Reduced compliance scope by design",
        b: "Because we never receive your prompts, responses, or any AI content, we don't process your end-users' personal data through the model path. That keeps a large category of regulated data entirely out of Reckon and shrinks the scope of any security review.",
      },
      {
        h: "SOC 2 on our roadmap",
        b: "A SOC 2 Type II examination is on our roadmap, and we'll commit to a timeline as part of enterprise agreements. In the meantime we support vendor security reviews directly — completed CAIQ questionnaire, a DPA, and our sub-processor list are available on request.",
      },
      {
        h: "US data residency",
        b: "Reckon and its sub-processors operate in the United States. A current sub-processor list is maintained in our Privacy Policy.",
      },
    ],
  },
  {
    title: "Data handling",
    points: [
      {
        h: "Retention you control",
        b: "Usage records are retained per plan (30 days Free, 365 days Pro) and pruned automatically. You can request deletion of your organization's data at any time.",
      },
      {
        h: "No data resale, no model training",
        b: "We never sell your data and never use it to train machine-learning models. Data is shared only with the sub-processors required to run the service, listed in our Privacy Policy.",
      },
    ],
  },
];

export default function SecurityPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-20">
      <span className="inline-flex items-center gap-2 rounded-full border border-brand-line bg-brand-soft px-3 py-1 text-[12.5px] font-medium text-brand-ink">
        <Spike size={15} /> Security
      </span>
      <h1 className="mt-5 text-[clamp(30px,5vw,42px)] font-semibold tracking-[-0.025em] text-ink">
        Built to be the safest vendor you onboard.
      </h1>
      <p className="mt-4 text-lg text-ink-2">
        Reckon carries one of the most sensitive responsibilities a vendor can —
        access to your AI provider keys. We treat that as the single largest
        trust risk we hold, and we designed the product around minimizing it.
      </p>

      <div className="mt-12 space-y-12">
        {GROUPS.map((g) => (
          <section key={g.title}>
            <h2 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-3">
              {g.title}
            </h2>
            <div className="mt-4 space-y-6">
              {g.points.map((p) => (
                <div key={p.h}>
                  <h3 className="text-[16px] font-semibold text-ink">{p.h}</h3>
                  <p className="mt-1.5 text-[14px] leading-relaxed text-ink-2">
                    {p.b}
                  </p>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="mt-14 rounded-xl border border-brand-line bg-brand-soft p-6">
        <h2 className="text-[16px] font-semibold text-ink">
          Running a vendor security review?
        </h2>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-2">
          We make security reviews easy. Email{" "}
          <a href="mailto:brianmello96@gmail.com" className="text-brand-ink underline">
            brianmello96@gmail.com
          </a>{" "}
          and we&apos;ll send our security whitepaper, a completed CAIQ
          questionnaire, our current sub-processor list, and a DPA ready to
          sign. Most reviews close on these alone — and we&apos;re glad to walk
          your team through the architecture.
        </p>
      </div>

      <div className="mt-6 rounded-xl border border-line bg-paper p-6">
        <h2 className="text-[16px] font-semibold text-ink">
          Responsible disclosure
        </h2>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-2">
          If you believe you&apos;ve found a security vulnerability, please report
          it privately to{" "}
          <a href="mailto:brianmello96@gmail.com" className="text-brand-ink underline">
            brianmello96@gmail.com
          </a>{" "}
          before disclosing it publicly. We&apos;ll acknowledge your report,
          investigate promptly, and keep you updated. We&apos;re grateful to
          researchers who help keep Reckon and its customers safe.
        </p>
      </div>
    </div>
  );
}
