# Reckon — Security & Trust Whitepaper

*Prospect-facing one-pager for vendor security reviews. Last reviewed: 2026-06-01.*
*Public version: https://getreckon.dev/security · Sub-processors & privacy: https://getreckon.dev/privacy*

---

## What Reckon is

Reckon is a **read-only observability and anomaly-detection product for AI/LLM spend**. We poll the admin/usage APIs that AI providers (Anthropic, OpenAI, GitHub Copilot, OpenRouter) already expose, attribute spend per developer / agent / workflow, and surface trends and anomalies via a dashboard, Slack, and Linear.

## The two facts that shrink your security review

1. **We are a passive observer, never a proxy.** Reckon does not sit in your request path to AI providers. There is no TLS termination of your traffic, no routing, no rewriting, no throttling. We read the aggregate usage numbers the provider already reports.
2. **We never receive your prompts or responses.** No prompt text, completions, embeddings, or files ever reach Reckon — only token counts, model names, and cost at the provider-API-key level. Your end-users' content and PII stay out of Reckon entirely.

Together these remove the largest categories a security review normally targets.

## The one sensitive asset we hold — and how we protect it

To read usage, a customer connects one provider **admin/usage key**. We treat this as our single largest trust risk:

- **Envelope encryption.** Each key is encrypted with AES-256-GCM under a unique per-key data key; that data key is encrypted by a master key (CMK) held in **AWS KMS**. Key material never leaves KMS. A database leak alone reveals nothing usable.
- **Decrypt only in the worker.** Keys are decrypted only inside the background ingestion worker, never in the web tier that serves browsers.
- **Minimal exposure.** Only the last four characters of a key are ever displayed or logged. Plaintext keys never enter logs, errors, or monitoring; the plaintext data key is zeroed from memory immediately after use.
- **Rotation & revocation.** KMS master-key rotation is enabled; per-key data keys are single-use. Customers can revoke a connection at any time.

Integration tokens (Slack, Linear) and observability credentials (Langfuse, Helicone) use the same envelope encryption.

## Tenant isolation (defense in depth)

- Every row of customer data carries an `org_id`. Application queries are always scoped to the caller's organization.
- **Postgres row-level security** enforces that scoping as a backstop: a mis-scoped query returns **zero rows**, never another tenant's data.

## Authentication & access

- Authentication is handled by **Clerk** (org-scoped). We never store passwords; sessions are validated server-side on every request.
- Admin vs. member roles; sensitive actions (keys, billing, integrations) are admin-only and enforced server-side.
- App surfaces (Operations / Workflows / Finance) are gated per member.

## Integrations & webhooks

- All inbound webhooks are signature-verified: Stripe (signing secret), Slack (signing secret + timestamp window), Clerk (Svix). Unsigned or stale requests are rejected.

## Data handling

- **No prompt/response content stored, ever. No data resale. No model training on your data.**
- Retention is plan-based (30 days Free / 365 days Pro), pruned automatically. Customers can request export or deletion of their organization's data at any time.

## Compliance posture

- **Inherited, audited infrastructure.** Every sub-processor that stores or processes customer data — **Vercel, Supabase (Postgres), AWS (KMS), Clerk, Stripe, Inngest, Sentry** — maintains **SOC 2 Type II and/or ISO 27001** certification. Reckon's application controls are built on top of independently-audited platforms.
- **SOC 2 Type II** is on our roadmap; we will commit to a timeline as part of an enterprise agreement.
- **Reduced scope by design** — no AI content means a large class of regulated data never enters Reckon.
- **US data residency.** Sub-processors operate in the United States.

## What we provide for your review

- This whitepaper and our public Trust page (`/security`).
- A completed **CAIQ** (or SIG-Lite) security questionnaire.
- A current **sub-processor list** and a **DPA** ready to sign.
- A walkthrough of the architecture with your security team on request.

## Security contact

Responsible disclosure and security questions: **brianmello96@gmail.com**. We acknowledge reports promptly and keep you updated.
