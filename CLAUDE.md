# CLAUDE.md — Project Context

## What we're building

A read-only observability and anomaly-detection product for AI/LLM spend, aimed at engineering managers at small-to-midsize companies. We poll provider APIs (Anthropic, OpenAI, GitHub Copilot) on a schedule and surface per-developer spend, weekly trends, and anomalies via Slack and Linear.

The customer is the engineering manager. The buyer is them or a finance/ops partner. The end-user experience for their developers is "nothing" — we don't proxy requests, we don't change anyone's workflow, we don't add latency. Developers feel us only through the Slack digest.

---

## Load-bearing architectural decisions

These are decisions to preserve, not reopen casually. Each was chosen deliberately over an alternative. If a feature request, refactor, or "small improvement" implies changing one of these, stop and surface it before building.

### 1. We are a passive observer, not a proxy gateway

We never sit in the customer's request path to AI providers. We never see prompts or responses. We poll the providers' admin/usage APIs and read what they already report.

- **Why:** Keeps us off the critical path (no uptime SLA pressure, no latency budget), eliminates the largest security-review category, and lets a small team operate the service. Tradeoff is shallower data — accepted.
- **Rules out:** Building a proxy, terminating TLS for customer traffic, semantic caching, response routing, prompt rewriting, anything that requires being in-band.

### 2. Per-developer attribution via one org admin key per provider

The customer connects **one org-level admin/usage key per provider**. We poll the provider's usage API, which reports the whole org's usage **broken down per provider-side identity** (Anthropic `api_key_id`, OpenAI `user_id`, GitHub Copilot seat login). Each identity is recorded in `provider_identities` and mapped to a developer (auto-created for human labels, else assigned in the UI). `usage_events.developer_id` is denormalized from that mapping at ingest and re-resolved on reassignment.

- **Why:** Only org-admin keys can read usage on these providers, and those endpoints report org-wide — so collecting a key per developer doesn't actually work and misattributes the whole org's spend to one person. One key per provider is also far less setup friction. Still no proxy: we only read what the provider already reports.
- **Superseded:** the original "each developer pastes their own key" model (it was structurally broken — see git history around the attribution rework).
- **Rules out:** Being in the request path / proxy (decision #1). Per-project or per-repo attribution (we're per-person only in v1).
- **Constraint:** requires provider org-admin access (Anthropic Team/Enterprise Admin key, OpenAI org admin key, GitHub org admin). Accounts without admin access can't be tracked — surfaced in the UI.

### 3. Multi-tenant with structural isolation

Every table that holds customer data has `org_id` as a NOT NULL column. We use Postgres row-level security policies as a backstop so application bugs can't leak data across orgs.

- **Why:** It is easy to forget `WHERE org_id = ?` in some query path. RLS turns that bug from "data leak" into "query returns nothing." Defense in depth.

### 4. Provider keys are encrypted at rest with KMS-managed keys

Envelope encryption. Data keys stored encrypted in the row, master key in the platform's KMS. Decrypt only inside the ingestion worker, never in the web app process.

- **Why:** A leak of our database is an apocalypse for our customers if their provider keys are plaintext. This is the single largest trust risk we carry.

### 5. Idempotent ingestion

Every `usage_events` row has a composite natural key (`provider_key_id`, `external_identity`, `time_bucket`, `model`). Ingestion is `ON CONFLICT DO NOTHING` or `DO UPDATE` with last-write-wins on numeric fields. Workers can re-run, be killed mid-flight, or process the same window twice without corruption.

- **Why:** Provider APIs revise past numbers, jobs get retried, manual reprocessing happens. Idempotency is the only sane invariant.

---

## Tech stack

- **Language:** TypeScript end-to-end
- **Web framework:** Next.js (App Router) for admin UI and OAuth handlers
- **Database:** Postgres, managed (Supabase or Neon). RLS enabled.
- **ORM:** Drizzle ORM
- **Background jobs:** Inngest for scheduled ingestion, anomaly detection, and notification workers
- **Slack bot:** `@slack/bolt`
- **Linear:** `@linear/sdk`
- **Auth:** Clerk (org-scoped) — don't roll our own
- **Billing:** Stripe
- **Email:** Resend
- **KMS:** AWS KMS (or platform equivalent) via the AWS SDK
- **Error monitoring:** Sentry
- **Hosting:** Vercel (web) + Inngest Cloud (workers)

Don't silently swap categories (ORM, framework, job runner). Surface the proposal first.

---

## Data model (core tables)

```
organizations
  id (uuid pk), name, slug, stripe_customer_id, created_at

users
  id (uuid pk), org_id (fk), email, name, role (admin|member), created_at

developers
  id (uuid pk), org_id (fk), display_name, email,
  slack_user_id (nullable), created_at
  -- A person whose spend we track. May or may not have a user account.

providers
  id (uuid pk), key (e.g. "anthropic", "openai", "github_copilot"),
  display_name

provider_keys
  id (uuid pk), org_id (fk), developer_id (fk), provider_id (fk),
  encrypted_key (bytea), encrypted_dek (bytea), key_fingerprint (text),
  status (active|revoked|errored), last_polled_at, created_at

usage_events
  id (uuid pk), org_id (fk), provider_key_id (fk), provider_id (fk),
  time_bucket (date), model (text),
  input_tokens (bigint), output_tokens (bigint), cached_tokens (bigint),
  cost_usd_micros (bigint), raw (jsonb)
  UNIQUE (provider_key_id, time_bucket, model)

anomalies
  id (uuid pk), org_id (fk), developer_id (fk, nullable),
  kind (spike|new_high|sustained_increase), severity (info|warn|critical),
  details (jsonb), detected_at, acknowledged_at (nullable)

slack_installations / linear_installations
  org_id (fk), workspace_id, encrypted_bot_token, scopes,
  installed_by_user_id, installed_at
```

**Money:** stored as `cost_usd_micros` (bigint, $1.00 = 1_000_000). Never floats for currency.
**Time:** `timestamptz`, stored UTC, rendered in user's locale at the edge.
**Identifiers:** UUIDs everywhere; never expose integer surrogate keys.

---

## Key flows

### Onboarding
1. Admin signs up → creates organization → connects Slack via OAuth.
2. Admin invites developers (email or Slack DM). Each gets a magic link.
3. Developer clicks link → confirms identity → pastes their personal Anthropic + OpenAI keys into our app.
4. Backfill job runs immediately for the new keys; pulls the last 30 days.

### Hourly ingestion
1. Inngest cron fires per org.
2. For each active `provider_key`: decrypt → call provider usage API for the last 48h → upsert into `usage_events`.
3. After org ingestion completes, run anomaly detection over the rolling window.
4. New anomalies write to `anomalies` and queue Slack/Linear notifications.

### Daily digest
1. Per-org scheduled job at org's configured local send time (default 9am).
2. Aggregate yesterday's `usage_events` by developer, compute deltas vs trailing 7-day average.
3. Post a single Slack message to the configured channel: totals, top consumers, unacknowledged anomalies.

### Anomaly detection (v1)
Rolling stats per `(developer, provider)` over trailing 28 days. Flag when daily total exceeds `mean + 3 * stddev`, OR when daily total is >3× the 7-day rolling average. No ML. Tune thresholds based on customer feedback.

---

## Conventions

- Every query is scoped by `org_id`. RLS enforces it; write it explicitly anyway for readability.
- Never log raw provider keys. Only the 4-character display fingerprint is loggable.
- All external API calls use exponential backoff with jitter; max 5 retries; persistent failures set `provider_keys.status = 'errored'` and surface in the admin UI.
- Slack messages use Block Kit, not plain text. Message builders live in `lib/slack/messages/*.ts`.
- Drizzle prepared statements only; no string-interpolated SQL.
- Currency math in integers (micros). Never `Number` for money.
- Cron schedules all defined in `lib/jobs/schedule.ts` so they're discoverable in one place.
- Sentry tags every event with `org_id` and `user_id` where applicable.
- Secrets via environment variables, never committed. Local dev uses `.env.local` (gitignored).

---

## Non-goals — do not do these without explicit decision

- ❌ Don't build a proxy / gateway. We are read-only.
- ❌ Don't ingest from providers without a real admin/usage API (Cursor, Windsurf). Defer.
- ❌ Don't store prompts, responses, or any content from the customer's AI calls.
- ❌ Don't add ML-based anomaly detection in v1. Simple stats win.
- ❌ Don't add per-project or per-repo attribution in v1. Per-developer only.
- ❌ Don't build custom auth. Use Clerk.
- ❌ Don't add LLM-powered features inside our app ("AI summary of this developer's usage") in v1. Operational complexity + vibe mismatch with our positioning.
- ❌ Don't add budget *enforcement* (blocking, throttling). We observe and alert. Enforcement requires being in the request path — see decision #1.

---

## MVP scope

**Providers:** Anthropic (Admin API), OpenAI (Usage API), GitHub Copilot (org billing API).

**Integrations:** Slack (daily digest, weekly digest, `/spend` slash command, anomaly alerts), Linear (file issue on critical anomaly).

**Explicitly out of v1:** Cursor / Windsurf / Codex, per-project attribution, budget enforcement, multi-currency, SSO, public API, mobile app.

---

## When uncertain

If a request would violate a non-goal or change a load-bearing decision, stop and ask. These were chosen deliberately and unwinding them has compounding consequences. Everything else — UI choices, helper organization, library swaps within the same category — proceed.
