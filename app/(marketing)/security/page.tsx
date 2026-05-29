import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Security — Reckon",
  description:
    "How Reckon protects your data: read-only by design, no prompts seen, envelope-encrypted keys, structural tenant isolation.",
};

const POINTS = [
  {
    title: "Read-only by design",
    body: "We never sit in your request path to AI providers. We poll their usage APIs and read what they already report. There's no proxy, no TLS termination, and no way for us to see or alter your traffic.",
  },
  {
    title: "We never see prompts or responses",
    body: "Because we're a passive observer, we have no access to the content of your AI calls — only the aggregate usage numbers the providers publish at the key level.",
  },
  {
    title: "Provider keys are envelope-encrypted",
    body: "Every API key you add is encrypted with AES-256-GCM using a per-row data key, which is itself encrypted by an AWS KMS managed master key. Keys are only ever decrypted inside the ingestion worker — never in the web app. A database leak alone reveals nothing.",
  },
  {
    title: "Structural tenant isolation",
    body: "Every row of customer data carries an org ID, and Postgres row-level security policies enforce it as a backstop. Even an application bug can't leak data across organizations — a mis-scoped query returns nothing.",
  },
  {
    title: "Authentication we don't roll ourselves",
    body: "User authentication is handled by Clerk. We don't store passwords. Sessions are validated server-side on every request.",
  },
  {
    title: "What's loggable",
    body: "Only the last 4 characters of any provider key ever appear in logs or our UI. Plaintext keys never enter logs, error messages, or monitoring tools.",
  },
];

export default function SecurityPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-20">
      <h1 className="text-4xl font-semibold tracking-tight">Security</h1>
      <p className="mt-4 text-lg text-zinc-600">
        Reckon carries one of the most sensitive responsibilities a vendor can:
        access to your AI provider keys. Here&apos;s how we protect them.
      </p>

      <div className="mt-12 space-y-8">
        {POINTS.map((p) => (
          <div key={p.title}>
            <h2 className="text-lg font-medium text-zinc-900">{p.title}</h2>
            <p className="mt-2 text-zinc-600">{p.body}</p>
          </div>
        ))}
      </div>

      <p className="mt-12 text-sm text-zinc-500">
        Questions about our security posture? Email{" "}
        <a href="mailto:brianmello96@gmail.com" className="underline">
          brianmello96@gmail.com
        </a>
        .
      </p>
    </div>
  );
}
