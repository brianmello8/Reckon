# Prompts — Building the MVP with Claude Code

A sequenced playbook of prompts to give Claude Code, ordered so each one builds on the last. Designed for a solo founder to ship the MVP described in `CLAUDE.md` and `architecture.md` in roughly six weeks of focused work.

## How to use this file

1. **Read `CLAUDE.md` and `architecture.md` first.** Every prompt assumes those exist in the repo and have been ingested by Claude Code at session start.
2. **Run prompts in order.** Each one assumes the prior is complete. Skipping creates compounding gaps.
3. **One prompt per session.** Start fresh sessions between prompts to keep context windows clean. Don't chain three prompts in one session.
4. **Verify the acceptance criteria before moving on.** If something's broken, fix it in the same session rather than letting it fester.
5. **When Claude Code goes off the rails:** stop, start a new session, re-prompt with explicit constraints. Don't try to redirect mid-session — context is poisoned at that point.
6. **Commit after every prompt** with a clear message. Easier to revert when something turns out wrong.

## Conventions in the prompts below

- `[brackets]` are placeholders for your decisions.
- Prompts assume you're inside the project directory with `CLAUDE.md` and `architecture.md` at the root.
- Each prompt ends with explicit acceptance criteria. Tell Claude Code to verify them before declaring done.

---

# Phase 0 — Project setup (Day 1)

## Prompt 0.1 — Initialize the project

**Purpose:** Get a working Next.js + TypeScript + Tailwind project with the directory shape we want.

```
Read CLAUDE.md and architecture.md before starting.

Initialize a new Next.js 15 project with the App Router, TypeScript (strict mode), and Tailwind CSS. Use pnpm as the package manager.

Set up the following directory structure:
- app/                    (Next.js routes)
- app/(marketing)/        (public pages)
- app/(app)/              (authenticated app routes)
- app/api/                (API routes)
- components/             (React components)
- components/ui/          (shadcn-style primitives)
- lib/                    (shared utilities)
- lib/db/                 (database client, schema)
- lib/providers/          (provider API clients - one file per provider)
- lib/slack/              (Slack message builders, OAuth helpers)
- lib/linear/             (Linear client)
- lib/encryption/         (KMS envelope encryption)
- lib/jobs/               (Inngest function definitions)
- lib/anomaly/            (anomaly detection)
- workers/                (Inngest entry point)

Install and configure:
- Tailwind CSS with a base config
- shadcn/ui CLI (initialize but don't add components yet)
- Zod for validation
- date-fns for date handling
- env validation using @t3-oss/env-nextjs

Create .env.example with placeholder values for every env var we'll need based on architecture.md section 9 (Clerk, Stripe, Anthropic, OpenAI, GitHub, Slack, Linear, AWS KMS, Resend, Sentry, Inngest, Database URL). Add .env.local to .gitignore.

Set up the env validation file at lib/env.ts. Group server-only and client-safe vars separately.

Add a README.md with: project description (1 sentence pulled from CLAUDE.md), pnpm install, pnpm dev, link to CLAUDE.md.

Do NOT install or configure: any database client yet, Clerk, Stripe, or Inngest. Those come in later prompts.

Acceptance criteria:
- pnpm install completes
- pnpm dev runs and serves the default Next.js page
- The directory structure exists with .gitkeep files in empty dirs
- .env.example is complete
- TypeScript strict mode is on and the project type-checks
```

**After this prompt:** Commit as `chore: initial project setup`.

---

## Prompt 0.2 — Database and Drizzle setup

**Purpose:** Get Postgres + Drizzle wired up with migrations.

**Before you start:** Create a free Postgres database on Neon or Supabase. Put the connection string in `.env.local` as `DATABASE_URL`.

```
Read CLAUDE.md and architecture.md.

Install Drizzle ORM, drizzle-kit, and the postgres-js driver.

Set up:
- lib/db/client.ts: exports a singleton Drizzle client connected via DATABASE_URL
- lib/db/schema.ts: empty for now, will hold table definitions in the next prompt
- drizzle.config.ts: configured to use lib/db/schema.ts and output migrations to lib/db/migrations/
- Add pnpm scripts: "db:generate" (drizzle-kit generate), "db:migrate" (run migrations), "db:studio" (drizzle-kit studio)

Create lib/db/migrate.ts as a standalone Node script that runs pending migrations. This is what "pnpm db:migrate" should execute.

Enable the pgcrypto extension in the first migration (we'll need it for hashing helpers later).

Add a healthcheck API route at app/api/health/route.ts that runs a SELECT 1 against the database and returns {status, db_latency_ms}. This is our smoke test that the connection works.

Do NOT define any tables yet. That comes in the next prompt.

Acceptance criteria:
- pnpm db:generate creates an initial migration enabling pgcrypto
- pnpm db:migrate runs successfully against the configured database
- Visiting /api/health returns {status: "ok", db_latency_ms: <number>}
- pnpm db:studio opens Drizzle Studio
```

**After this prompt:** Commit as `chore: drizzle and postgres setup`.

---

# Phase 1 — Foundation (Days 2–4)

## Prompt 1.1 — Core schema with RLS

**Purpose:** Define every table from architecture.md §3 with the indexes and RLS policies.

```
Read CLAUDE.md and architecture.md, especially sections 3, 4, and 5.

Define the full data model in lib/db/schema.ts using Drizzle. Tables:

- organizations: id (uuid pk, default gen_random_uuid()), name, slug (unique), stripe_customer_id (nullable), stripe_subscription_id (nullable), plan (enum: free, pro), digest_time_local (text, default '09:00'), digest_timezone (text, default 'America/Los_Angeles'), digest_slack_channel_id (nullable), created_at, updated_at, deleted_at (nullable)

- users: id (uuid pk), org_id (fk -> organizations, NOT NULL), clerk_user_id (text unique), email, name, role (enum: admin, member), created_at, updated_at

- developers: id (uuid pk), org_id (fk NOT NULL), display_name, email, slack_user_id (nullable), created_at, updated_at, deleted_at (nullable). UNIQUE (org_id, email).

- providers: id (uuid pk), key (text unique - e.g. 'anthropic', 'openai', 'github_copilot'), display_name. This is seed data, not user-managed.

- provider_keys: id (uuid pk), org_id (fk NOT NULL), developer_id (fk NOT NULL), provider_id (fk NOT NULL), encrypted_key (bytea), encrypted_dek (bytea), iv (bytea), auth_tag (bytea), key_fingerprint (text - last 4 chars), status (enum: active, errored, revoked), last_polled_at (nullable), last_error (text nullable), created_at, updated_at

- usage_events: id (uuid pk), org_id (fk NOT NULL), provider_key_id (fk NOT NULL), provider_id (fk NOT NULL), developer_id (fk NOT NULL), time_bucket (date NOT NULL), model (text NOT NULL), input_tokens (bigint default 0), output_tokens (bigint default 0), cached_input_tokens (bigint default 0), cost_usd_micros (bigint default 0), raw (jsonb), created_at, updated_at. UNIQUE (provider_key_id, time_bucket, model).

- anomalies: id (uuid pk), org_id (fk NOT NULL), developer_id (fk NOT NULL), kind (enum: spike, sudden_increase, sustained_increase), severity (enum: info, warn, critical), details (jsonb), detected_at, acknowledged_at (nullable), acknowledged_by_user_id (nullable fk -> users)

- slack_installations: org_id (pk fk), workspace_id, encrypted_bot_token (bytea), encrypted_dek, iv, auth_tag, scopes (text[]), installed_by_user_id (fk users), installed_at, uninstalled_at (nullable)

- linear_installations: same shape as slack_installations

- digest_logs: id, org_id (fk), kind (daily, weekly), sent_at, slack_ts (nullable), error (nullable)

Add the indexes listed in architecture.md §3.

In a separate migration file (NOT in schema.ts since Drizzle doesn't manage them well), enable RLS on every table that has org_id and create the tenant_isolation policies as described in architecture.md §4. Use current_setting('app.current_org_id', true)::uuid as the comparator.

Create lib/db/seed.ts that inserts the three rows in the providers table. Add a pnpm script "db:seed" that runs it.

Acceptance criteria:
- pnpm db:generate produces a clean migration
- pnpm db:migrate succeeds
- pnpm db:seed populates providers
- All tables visible in Drizzle Studio
- RLS is enabled on the relevant tables (verify via Drizzle Studio or psql)

Stop and ask before: renaming any column, changing any enum value, or adding tables not listed above.
```

**After this prompt:** Commit as `feat: core schema with rls`. Manually verify in Drizzle Studio that tables exist and RLS is enabled.

---

## Prompt 1.2 — Clerk authentication and organizations

**Purpose:** Wire up auth, org creation, and the user/org sync to our database.

**Before you start:** Create a Clerk account, set up an application with Organizations enabled, add keys to `.env.local`.

```
Read CLAUDE.md and architecture.md §5.

Install @clerk/nextjs. Set up:

- middleware.ts at project root using clerkMiddleware. Protect everything under /(app), allow public access to /(marketing) and /api/health.
- app/layout.tsx wraps with <ClerkProvider>.
- Sign-in route at app/sign-in/[[...sign-in]]/page.tsx using Clerk's <SignIn />.
- Sign-up route at app/sign-up/[[...sign-up]]/page.tsx using Clerk's <SignUp />.
- After sign-up, redirect to /onboarding (creates org).

Create app/api/webhooks/clerk/route.ts to receive Clerk webhooks. Handle:
- user.created: do nothing on this event alone; user gets created in our DB during org assignment
- organization.created: insert into our organizations table (id from Clerk org id mapped to our uuid via deterministic mapping OR store clerk_org_id as a separate field — choose one and document the choice).
- organizationMembership.created: insert into our users table linking clerk_user_id, org_id, email, role.
- organizationMembership.deleted: soft-delete the user row.

IMPORTANT design decision to make now: do we use Clerk's org IDs as our org IDs, or do we generate our own uuids and store Clerk's id in a clerk_org_id column? Stop and propose both options with pros/cons before implementing. (I'll respond with my choice.)

Create lib/auth.ts with helper functions:
- getCurrentUser(): server-side, returns { user, org } from Clerk + our DB, or null
- requireUser(): same but throws if not signed in
- requireAdmin(): throws if not an admin role

Build a basic /onboarding page that:
- Shows a form to create an organization (name)
- Creates the Clerk org, which triggers our webhook
- Polls until the org appears in our DB, then redirects to /dashboard

Build a placeholder /dashboard page at app/(app)/dashboard/page.tsx that:
- Shows "Welcome, [user.name]. You are in org [org.name]."
- Uses requireUser() to gate access.

Set up a script lib/db/set-rls-context.ts: a helper that, given a Drizzle transaction, calls SET LOCAL app.current_org_id = '<uuid>'. Every database query in authenticated routes must run inside a transaction that calls this first. Build a wrapper withOrgContext(orgId, callback) and use it in /dashboard's query.

Acceptance criteria:
- New user can sign up at /sign-up
- Redirects to /onboarding
- Can create an org
- Org and user appear in our database (verify in Studio)
- /dashboard renders with the user's name and org
- Signing out and visiting /dashboard redirects to /sign-in
- The RLS context is being set on every authenticated DB query
```

**After this prompt:** Commit as `feat: clerk auth and org onboarding`. Manually sign up two users in two different orgs and verify they can't see each other's data.

---

## Prompt 1.3 — Admin shell and navigation

**Purpose:** Build the visual chrome of the authenticated app.

```
Read CLAUDE.md and architecture.md.

Install shadcn/ui components: button, card, input, label, dialog, dropdown-menu, table, badge, separator, avatar, toast (sonner).

Build the authenticated app shell at app/(app)/layout.tsx:
- Left sidebar with nav links: Dashboard, Developers, Providers, Anomalies, Integrations, Settings, Billing
- Top bar with org switcher (use Clerk's <OrganizationSwitcher />) and user menu
- Main content area renders {children}
- Mobile-responsive: sidebar collapses to a sheet on small screens

Build placeholder routes for each nav item:
- /dashboard (already exists, leave the welcome message for now)
- /developers (placeholder: "Manage developers — coming soon")
- /providers (placeholder)
- /anomalies (placeholder)
- /integrations (placeholder)
- /settings (placeholder)
- /billing (placeholder)

The /settings page should already work: it shows the org name, digest send time, and digest timezone, with edit forms that save to the database. Use server actions for the mutations.

Style: clean, minimal, neutral grays. No marketing-style gradients. Aim for the feel of Linear or Vercel's dashboard. Use the system font stack.

Add a toast (sonner) for save confirmations and errors.

Acceptance criteria:
- Sidebar nav works and highlights the active page
- /settings can edit and persist org name and digest schedule
- Layout looks clean on mobile
- No console errors

Stop and ask before: adding any nav item not listed above, changing the URL structure of routes.
```

**After this prompt:** Commit as `feat: admin shell and nav`.

---

# Phase 2 — Provider keys (Days 5–7)

## Prompt 2.1 — KMS envelope encryption

**Purpose:** Build the encryption primitives we'll use for all secrets at rest.

**Before you start:** Create an AWS account if you don't have one. Create a KMS Customer Master Key (CMK) in us-east-1 with automatic annual rotation enabled. Create an IAM user with `kms:GenerateDataKey` and `kms:Decrypt` permissions on that CMK. Put credentials and key ARN in `.env.local`.

```
Read CLAUDE.md and architecture.md §5.

Install @aws-sdk/client-kms.

Build lib/encryption/envelope.ts with two functions:

encryptSecret(plaintext: string): Promise<{
  ciphertext: Buffer,
  encrypted_dek: Buffer,
  iv: Buffer,
  auth_tag: Buffer
}>

decryptSecret(args: {
  ciphertext: Buffer,
  encrypted_dek: Buffer,
  iv: Buffer,
  auth_tag: Buffer
}): Promise<string>

Implementation:
- encryptSecret calls KMS GenerateDataKey with KeySpec AES_256. Receives plaintext_dek and encrypted_dek. Uses Node's crypto.createCipheriv with 'aes-256-gcm' and a fresh random 96-bit IV to encrypt the plaintext. Returns ciphertext, encrypted_dek, iv, and auth_tag. Zeros the plaintext_dek buffer before returning.
- decryptSecret calls KMS Decrypt with encrypted_dek to recover plaintext_dek, then crypto.createDecipheriv with the IV and auth_tag to recover plaintext. Zeros plaintext_dek after use.

Add a fingerprint helper: keyFingerprint(plaintext: string): string — returns the last 4 characters of the plaintext, no encryption involved. This is what's safe to log.

Build a test script at lib/encryption/test.ts (not Jest, just a script runnable with tsx) that:
1. Encrypts a known plaintext
2. Decrypts it back
3. Asserts they match
4. Asserts the encrypted_dek alone (without KMS) reveals nothing

Add pnpm script "encryption:test" that runs it.

Add a strict eslint rule (or a simple grep-based pre-commit check) that fails if anyone tries to console.log a value that looks like a provider API key (matches /sk-[A-Za-z0-9]/).

Do NOT use the keys in the database yet. This prompt only builds the primitive.

Acceptance criteria:
- pnpm encryption:test passes
- The KMS call works against your real KMS key
- Plaintext never appears in any log output
- The grep check is in place
```

**After this prompt:** Commit as `feat: kms envelope encryption`.

---

## Prompt 2.2 — Provider clients

**Purpose:** Build thin clients for each provider's usage API. No ingestion yet.

```
Read CLAUDE.md and architecture.md.

Create lib/providers/types.ts defining the shared interface:

interface UsageRow {
  time_bucket: string; // YYYY-MM-DD UTC
  model: string;
  input_tokens: number;
  output_tokens: number;
  cached_input_tokens: number;
  cost_usd_micros: number;
  raw: Record<string, unknown>;
}

interface ProviderClient {
  fetchUsage(args: {
    apiKey: string;
    since: Date;
    until: Date;
  }): Promise<UsageRow[]>;
}

Implement three clients:

1. lib/providers/anthropic.ts — uses Anthropic's Admin API usage_report endpoint. Reference: https://docs.anthropic.com/en/api/admin-api. Map their response to UsageRow[]. Group by day in UTC. Compute cost_usd_micros from token counts using a hardcoded model price table in lib/providers/pricing/anthropic.ts. Keep the price table easy to edit.

2. lib/providers/openai.ts — uses OpenAI's organization usage endpoint. Same shape. Pricing table in lib/providers/pricing/openai.ts.

3. lib/providers/github-copilot.ts — uses GitHub's org billing API for Copilot. Note: this is org-level only, not per-user. Document this clearly in the file's top comment. Return a single UsageRow per day attributed to a synthetic "org-wide" developer (we'll figure out attribution later — for now, just return the aggregate).

Each client must:
- Use a fetch wrapper with 30s timeout, exponential backoff (3 attempts, base 1s, jitter), and proper error categorization (transient vs auth vs other).
- Throw typed errors: ProviderAuthError, ProviderTransientError, ProviderUnknownError. Defined in lib/providers/errors.ts.
- Log nothing about the key beyond fingerprint.

Add a CLI script at scripts/test-provider.ts that takes a provider name and an API key as args, calls fetchUsage for the last 7 days, and prints the rows. This is for manual testing.

Do NOT integrate with the database or workers yet.

Acceptance criteria:
- tsx scripts/test-provider.ts anthropic <real-key> returns real usage data
- Same for openai
- GitHub Copilot returns aggregate org data
- Auth errors throw ProviderAuthError; rate limit / 5xx throws ProviderTransientError
- No plaintext keys in any log
```

**After this prompt:** Commit as `feat: provider clients`. Run the test script with your real keys to validate.

---

## Prompt 2.3 — Provider key management UI

**Purpose:** Let admins add, view, and revoke provider keys, with encryption at rest.

```
Read CLAUDE.md and architecture.md.

Build the /developers page first since keys belong to developers:
- Lists developers in the org as a table: name, email, # of provider keys, last activity, actions menu
- "Add developer" dialog: name + email
- Each row clickable → /developers/[id]

Build /developers/[id]:
- Shows developer info
- Section: "Provider Keys" with a list and an "Add key" button
- "Add key" dialog: provider dropdown, API key input (password-style), "Save"
- On save:
  - Validate the key by calling the appropriate provider client's fetchUsage for the last 24 hours
  - If auth fails, show "Invalid key" error
  - If valid, encrypt and store via lib/encryption/envelope
  - Store key_fingerprint (last 4 chars)
- List shows: provider, fingerprint (e.g. "...x9K2"), status badge, last polled, actions (revoke)
- Revoke: marks status='revoked', does not delete the row (we still want historical usage_events to resolve)

Build /providers page:
- Lists the three providers we support
- For each: count of active keys across the org, total cost last 30 days (placeholder $0.00 until ingestion runs)
- Documentation link to each provider's "how to create an admin API key"

Use server actions for all mutations. Wrap every DB query in withOrgContext(). Use Zod for input validation. Toast on success/failure.

Acceptance criteria:
- Can add a developer
- Can add a valid Anthropic/OpenAI key to a developer — verified via real API call before save
- Can see the key fingerprint and status after saving
- An invalid key shows an error and doesn't save
- Revoking a key updates status, leaves the row
- Two orgs can't see each other's developers or keys (verify RLS works)
- Plaintext keys never appear in any UI after entry, in logs, or in DB
```

**After this prompt:** Commit as `feat: provider key management`. Add a real key from your own account to test end-to-end.

---

# Phase 3 — Ingestion (Days 8–11)

## Prompt 3.1 — Inngest setup

```
Read CLAUDE.md and architecture.md §6.

Install inngest and the @inngest/sdk Next.js integration.

Set up:
- lib/jobs/client.ts: Inngest client singleton with the app id "spendwatch" (or whatever you're calling this — pick a name now and write it down)
- app/api/inngest/route.ts: the Inngest webhook handler exposing functions
- lib/jobs/schedule.ts: central registry of all cron schedules (cron strings as constants)

Create one trivial test function:
- name: "hello.world"
- trigger: manual event "test/hello"
- body: just console.logs "hello from inngest" and returns { ok: true }

Register it in app/api/inngest/route.ts.

Set up the Inngest dev server (npx inngest-cli dev) in a separate pnpm script: "inngest:dev".

Acceptance criteria:
- Run "pnpm inngest:dev" → opens dashboard at localhost:8288
- Trigger test/hello from the dashboard → function executes successfully
- Function appears in the dashboard's function list
```

**After this prompt:** Commit as `chore: inngest setup`.

---

## Prompt 3.2 — Single-key ingestion function

```
Read CLAUDE.md and architecture.md §6.

Build lib/jobs/ingest-provider-key.ts: an Inngest function that, given a provider_key_id, polls that key's provider for the last 48 hours and upserts usage_events.

Function signature:
- name: "ingest.provider-key"
- trigger: event "ingestion/provider-key.requested" with payload { provider_key_id: string }

Logic:
1. Load the provider_key row (use a privileged DB query that bypasses RLS — this is a system job; document why in a comment).
2. Decrypt the API key via lib/encryption.
3. Look up the provider client by provider.key.
4. Call fetchUsage for [now - 48h, now].
5. For each UsageRow, upsert into usage_events with ON CONFLICT (provider_key_id, time_bucket, model) DO UPDATE SET ... (last-write-wins on numeric fields, do not overwrite developer_id/org_id once set).
6. Update provider_keys.last_polled_at = now, last_error = null.
7. On ProviderAuthError: set status='errored', last_error=message. Do not retry.
8. On ProviderTransientError: throw to let Inngest retry with backoff (max 5 attempts).
9. On any other error: log to Sentry (placeholder for now), throw.

Use Inngest's step.run() to make each phase observable in their dashboard.

Add a manual trigger UI: on /developers/[id], next to each key, add a "Re-poll now" button that fires the event for that key.

Do NOT add the cron yet. We want to test single-key ingestion manually first.

Acceptance criteria:
- Click "Re-poll now" on a real Anthropic key → usage_events rows appear in DB for the last 48h
- Re-running it doesn't duplicate rows (idempotent)
- last_polled_at updates
- Revoke the key in Anthropic's dashboard, re-poll → status flips to 'errored', last_error populates
- Inngest dashboard shows the function executions with step-level detail
```

**After this prompt:** Commit as `feat: provider key ingestion`.

---

## Prompt 3.3 — Org-level orchestration and cron

```
Read CLAUDE.md and architecture.md §6.

Build lib/jobs/orchestrate-ingestion.ts: an Inngest function that fans out ingestion across all active keys in an org.

Function:
- name: "ingest.org"
- trigger: event "ingestion/org.requested" with payload { org_id: string }
- Logic:
  1. Load all provider_keys where org_id matches and status='active'.
  2. For each, send an "ingestion/provider-key.requested" event. Use step.sendEvent to batch.
  3. Wait for all to complete using step.waitForEvent or similar (or fire-and-forget if Inngest's parallelism model makes that simpler — choose and document).
  4. After all complete, send event "anomaly/detect.requested" with { org_id } (we'll build the consumer in Phase 5).

Build lib/jobs/cron-hourly.ts:
- Cron: "0 * * * *" (every hour)
- Lists all orgs where plan is not null and not deleted
- Fires "ingestion/org.requested" for each

Register both functions and the cron in app/api/inngest/route.ts.

Add an "Ingest now" button on /providers (admin-only) that fires "ingestion/org.requested" for the current org. Useful for testing without waiting for cron.

Acceptance criteria:
- Clicking "Ingest now" populates usage_events across all the org's keys
- Re-clicking is safe (idempotent)
- Cron is registered and shows up in Inngest dashboard
- The hourly cron, when triggered manually from Inngest's dashboard, processes all orgs
```

**After this prompt:** Commit as `feat: hourly org-level ingestion`.

---

## Prompt 3.4 — Backfill on key add

```
Read CLAUDE.md and architecture.md.

When a new provider_key is added (in prompt 2.3's "Add key" flow), trigger an immediate backfill of the last 30 days, not just 48h.

Approach:
1. Extend the ingest.provider-key function to accept an optional { since: ISO date string } in the payload. When present, use that as the start of the fetchUsage window instead of "48h ago".
2. After successfully saving a key in the UI server action, fire an "ingestion/provider-key.requested" event with since = today - 30 days.
3. Since some providers' usage APIs are paginated or have date-range limits, break the backfill into 7-day chunks if the requested window exceeds 7 days. Loop within the function using step.run for each chunk.

Show a backfill indicator in the UI: provider_keys gets a synthetic "backfilling" status while last_polled_at is null and created_at is within the last 30 minutes. Show a spinner badge in the key list during this state.

Acceptance criteria:
- Adding a new Anthropic key triggers a backfill that populates ~30 days of usage_events
- The UI shows "Backfilling..." until the first poll completes
- After completion, the dashboard would show 30 days of history (we'll build the dashboard next)
- A backfill of 30 days is broken into ~4 chunks visible in the Inngest dashboard
```

**After this prompt:** Commit as `feat: backfill on key add`.

---

# Phase 4 — Reporting and Slack (Days 12–18)

## Prompt 4.1 — Usage aggregation queries

```
Read CLAUDE.md and architecture.md §3.

Build lib/queries/usage.ts with typed query helpers (Drizzle):

- getDailyTotalsForOrg(orgId, from, to): Array<{ date, total_cost_usd_micros, total_input_tokens, total_output_tokens }>
- getDailyTotalsByDeveloper(orgId, from, to): Array<{ developer_id, developer_name, daily: Array<{ date, cost }> }>
- getDailyTotalsByProvider(orgId, from, to): same shape but grouped by provider
- getDailyTotalsByModel(orgId, from, to): same shape but grouped by model
- getDeveloperRanking(orgId, from, to): Array<{ developer_id, name, total_cost, % of org total, vs trailing 7-day avg }>
- getRollingStats(developerId, providerId, lookbackDays = 28): { mean_daily, stddev_daily, trailing_7day_avg }

Every function must run inside withOrgContext(orgId). Use prepared statements via Drizzle. Display all costs as the bigint micro value — UI layer converts to dollars.

Add a helper formatCost(micros: bigint): string for display (e.g. "$1,234.56"). Live in lib/format.ts.

Add a script scripts/usage-report.ts that prints a CLI-style report for a given org_id and date range. Useful for sanity-checking the queries before the UI exists.

Acceptance criteria:
- Each query returns expected shape against real ingested data
- The CLI script outputs a readable daily/by-developer breakdown
- Numbers reconcile with the provider's own dashboard (spot check Anthropic console vs our totals)
```

**After this prompt:** Commit as `feat: usage aggregation queries`.

---

## Prompt 4.2 — Dashboard UI

```
Read CLAUDE.md and architecture.md.

Build /dashboard:

Top row: 4 stat cards (current month-to-date)
- Total spend
- vs last month (delta + arrow)
- Active developers
- Most-used model

Main chart: stacked area chart of daily spend over the last 30 days, broken down by developer. Use Tremor (preferred) or Recharts. Default to "by developer", with a toggle for "by provider" and "by model".

Date range picker in the top right: last 7d, last 30d, last 90d, MTD, custom. Default 30d.

Below the chart: "Developers by spend" table:
- Columns: developer, total cost (selected range), % of org total, vs trailing 7-day avg (with delta indicator), # of provider keys
- Sortable by any numeric column
- Row click → /developers/[id]

Bottom: "Recent anomalies" list (placeholder — empty state for now: "No anomalies yet").

Build /developers/[id] (extend from prompt 2.3):
- Same stat cards but scoped to this developer
- Daily spend chart for this developer, by provider
- Table of provider keys (already exists)
- "Recent activity" — daily totals as a sparkline per model

Use loading skeletons, not spinners. Use the date range from URL search params so it's bookmarkable.

Acceptance criteria:
- Dashboard renders against real ingested data
- All charts show meaningful data after ingestion has run
- Date range picker updates the URL and re-fetches
- Two orgs see only their own data
- Empty state is graceful when no data exists yet
```

**After this prompt:** Commit as `feat: dashboard ui`.

---

## Prompt 4.3 — Slack OAuth and installation

**Before you start:** Create a Slack app at api.slack.com. Set scopes: chat:write, chat:write.public, channels:read, commands. Set OAuth redirect URL to your-domain/api/integrations/slack/callback. Get the client id, client secret, and signing secret into .env.local.

```
Read CLAUDE.md and architecture.md.

Install @slack/bolt and @slack/oauth.

Build the Slack OAuth installation flow:
- /integrations page lists Slack and Linear with "Connect" buttons
- Clicking "Connect Slack" goes to /api/integrations/slack/install which generates a state nonce (encoded with org_id), stores it briefly in a state table or signed cookie, and redirects to Slack's OAuth URL
- /api/integrations/slack/callback receives the code, exchanges it for tokens, validates state, encrypts the bot token (using lib/encryption), upserts into slack_installations
- After install, return to /integrations with a success toast and now show "Connected to [workspace]" with a "Disconnect" button

Once installed, the /settings page's "Daily digest channel" field becomes interactive:
- Fetch the workspace's channels via Slack API (using the decrypted bot token)
- Show a searchable dropdown
- Save the selected channel_id to organizations.digest_slack_channel_id

Build lib/slack/client.ts: getSlackClient(orgId): returns a configured WebClient with the decrypted bot token, or null if not installed. Always called inside withOrgContext.

Test posting: add a "Send test message" button on /integrations that posts "👋 SpendWatch is connected." to the configured channel.

Acceptance criteria:
- Can install the Slack app to your test workspace
- /integrations shows the connected workspace
- Can pick a channel from the dropdown
- "Send test message" posts to that channel
- Disconnecting removes the install row and the channel selector becomes inert
```

**After this prompt:** Commit as `feat: slack oauth and install`.

---

## Prompt 4.4 — Daily digest

```
Read CLAUDE.md and architecture.md §8.

Build lib/slack/messages/daily-digest.ts: a function that takes a digest data object and returns Slack Block Kit blocks.

Data shape:
{
  org_name: string,
  date: string, // "Yesterday, Nov 14"
  total_cost_micros: bigint,
  vs_trailing_avg_pct: number, // -10 means down 10%
  top_developers: Array<{ name, cost_micros, vs_avg_pct }>, // top 5
  unacknowledged_anomalies: Array<{ developer_name, kind, severity, summary }>,
  dashboard_url: string,
}

Block Kit design:
- Header: "📊 AI spend yesterday: $XXX (▲/▼ X% vs avg)"
- Section: top developers as a numbered list with cost and delta
- Divider
- If anomalies: "⚠️ Anomalies" section with bulleted summaries
- Context block: "View full dashboard →" link + timestamp

Build lib/jobs/compose-daily-digest.ts as an Inngest function:
- name: "digest.daily"
- triggered by event "digest/daily.requested" with { org_id }
- Loads yesterday's data via lib/queries/usage.ts
- Loads unacknowledged anomalies (will be empty until Phase 5)
- Composes blocks
- Posts to org's digest_slack_channel_id
- Inserts into digest_logs

Build lib/jobs/cron-daily-digest.ts:
- Cron: "*/15 * * * *" (every 15 minutes)
- Logic: for each org, compute "current local time in org's digest_timezone". If it matches org's digest_time_local within the last 15 minutes AND no digest_logs row exists for today, fire "digest/daily.requested".

Register both. Test by setting your test org's digest_time_local to 1 minute from now and waiting.

Acceptance criteria:
- Test digest posts to the configured Slack channel with real data
- Block Kit renders correctly (no broken markdown)
- Re-running the cron doesn't duplicate today's digest (digest_logs check)
- Setting digest time to a different time prevents the digest from sending
- If no Slack is connected, the function exits gracefully without erroring
```

**After this prompt:** Commit as `feat: daily slack digest`.

---

# Phase 5 — Anomaly detection (Days 19–22)

## Prompt 5.1 — Anomaly detection logic

```
Read CLAUDE.md and architecture.md §7.

Build lib/anomaly/detect.ts with:

detectAnomaliesForOrg(orgId: string): Promise<NewAnomaly[]>

Logic:
1. Load all developers in the org with at least 7 days of usage history.
2. For each (developer, provider) pair:
   a. Compute trailing 28-day daily totals.
   b. Compute mean and stddev (sample stddev, n-1).
   c. Get yesterday's total for this pair.
   d. Flag 'spike' if yesterday > mean + 3*stddev AND yesterday > $5 absolute.
   e. Compute trailing 7-day average. Flag 'sudden_increase' if yesterday > 3 * that average AND yesterday > $5.
   f. Severity: 'info' if 3-5x avg, 'warn' if 5-10x, 'critical' if >10x.
3. Dedupe against existing anomalies: don't create a new one of the same kind for the same developer within the last 24h. If severity has increased, update the existing row instead.
4. Return the list of new/updated anomaly rows.

Configurable thresholds live in lib/anomaly/config.ts as exported constants. Easy to tune.

Build lib/jobs/detect-anomalies.ts as an Inngest function:
- name: "anomaly.detect"
- triggered by event "anomaly/detect.requested" with { org_id }
- Calls detectAnomaliesForOrg
- Inserts/updates anomaly rows
- For each new or escalated anomaly, fires "anomaly/notify.requested" with { anomaly_id }

Wire it into the orchestrator from prompt 3.3: after all keys for an org finish ingesting, fire "anomaly/detect.requested".

Build /anomalies page:
- Table: detected_at, developer, kind, severity badge, summary, ack status, actions
- Filter: all / unacknowledged / acknowledged
- Row click → expandable detail showing the underlying numbers
- "Acknowledge" action sets acknowledged_at and acknowledged_by_user_id

Acceptance criteria:
- After ingestion completes, anomalies are detected if real spikes exist
- Manually create a fake spike (insert an outlier usage_event) and verify detection
- Re-running detection doesn't duplicate
- /anomalies page lists detected anomalies and acknowledgment works
- Suppression: artificially trigger the same anomaly kind twice, verify dedupe
```

**After this prompt:** Commit as `feat: anomaly detection`.

---

## Prompt 5.2 — Anomaly Slack notifications

```
Read CLAUDE.md and architecture.md.

Build lib/slack/messages/anomaly.ts: Block Kit message for a single anomaly.

Design:
- Header: "⚠️ AI spend anomaly detected" with severity color (info=blue, warn=orange, critical=red — use Slack's color attachments)
- Section: "{developer_name} spent ${amount} yesterday — {Xx} their trailing 7-day average"
- Context: "Detected at {time} • View developer →"
- Actions: "Acknowledge" button (interactive) + "View dashboard" link

Handle the "Acknowledge" button:
- Set up Slack interactivity URL at /api/integrations/slack/interactivity
- Verify signing secret on incoming requests
- Parse the action payload, identify the anomaly_id from action_id
- Look up the Slack user_id and map to our users table (by email or slack_user_id field — we need a way to associate; for now, accept any user in the same workspace as a valid acknowledger)
- Update anomalies.acknowledged_at and acknowledged_by_user_id
- Update the original message in place: replace with "✅ Acknowledged by @{user} at {time}"

Build lib/jobs/notify-anomaly.ts as an Inngest function:
- name: "anomaly.notify"
- triggered by "anomaly/notify.requested" with { anomaly_id }
- Loads the anomaly + developer + org
- Composes the message
- Posts to the org's digest_slack_channel_id
- Stores the Slack message ts on the anomaly row (add a slack_message_ts column to anomalies via migration)

For "critical" severity, also @-mention the org admins. Look up admins via users.role='admin' and try to resolve their Slack user IDs by matching email to Slack workspace users (use users.list API, cache the lookup in memory per function execution).

Acceptance criteria:
- A new anomaly posts to Slack with correct severity styling
- Clicking "Acknowledge" updates the database and edits the Slack message
- Critical anomalies @-mention admins
- Two anomalies in quick succession don't spam (dedupe from prompt 5.1 holds)
```

**After this prompt:** Commit as `feat: anomaly slack notifications`.

---

## Prompt 5.3 — Linear integration

**Before you start:** Create a Linear OAuth application at linear.app/settings/api/applications. Set redirect to your-domain/api/integrations/linear/callback. Put credentials in .env.local.

```
Read CLAUDE.md and architecture.md.

Build Linear OAuth installation, mirroring prompt 4.3's Slack flow:
- "Connect Linear" button on /integrations
- OAuth flow saving encrypted token to linear_installations
- After install, /integrations shows "Connected" with team selector
- /settings adds a "Linear team for anomaly issues" dropdown saving to organizations.linear_team_id (add this column via migration)

Build lib/linear/client.ts: getLinearClient(orgId) returns a @linear/sdk LinearClient with the decrypted token.

Extend lib/jobs/notify-anomaly.ts:
- After posting to Slack, if the anomaly severity is 'critical' AND Linear is connected AND a team is configured, create a Linear issue:
  - Title: "AI spend anomaly: {developer_name} — ${amount}"
  - Description: detail of the anomaly + link to /anomalies/{id} in our app
  - Team: organizations.linear_team_id
  - Labels: "AI spend", "anomaly"
  - Priority: Urgent
- Store the Linear issue id on the anomaly row (add column linear_issue_id)

When the anomaly is acknowledged (via Slack button or our UI), close the Linear issue with a comment "Acknowledged in SpendWatch by {user}".

Acceptance criteria:
- Can install Linear integration
- Critical anomaly creates a real Linear issue in the configured team
- Acknowledging the anomaly closes the Linear issue with a comment
- Linear failures don't block Slack notification (independent try/catch)
```

**After this prompt:** Commit as `feat: linear integration`.

---

# Phase 6 — Billing and free-tier limits (Days 23–26)

## Prompt 6.1 — Stripe subscriptions

**Before you start:** Create a Stripe account. Create a Product "SpendWatch Pro" with two prices: $19/mo per unit (metered? no — flat per-seat) and an annual equivalent at $190/year per unit (effective ~$15.83/mo, ~17% off). Actually create them as flat-tier prices with a quantity. Configure a customer portal. Get keys in .env.local.

```
Read CLAUDE.md and architecture.md.

Install stripe.

Build /billing page:
- Shows current plan (Free or Pro)
- For Free: pricing card with "Upgrade to Pro" CTA → starts Stripe Checkout in subscription mode with the per-developer price, quantity = current count of non-soft-deleted developers in the org. Set client_reference_id = org_id. Include a $99 minimum somehow (Stripe doesn't support floors natively — implement as a minimum quantity of ceil(99/19) = 6 in the checkout session).
- For Pro: shows current quantity, monthly cost, and a "Manage billing" button that opens the Stripe Customer Portal.

Build app/api/webhooks/stripe/route.ts handling:
- checkout.session.completed: set organizations.plan = 'pro', stripe_customer_id, stripe_subscription_id
- customer.subscription.updated: sync plan and quantity
- customer.subscription.deleted: set plan = 'free', null out stripe_subscription_id
- invoice.payment_failed: don't downgrade immediately; record a payment_status (add column to organizations) and show a banner in the app

Verify signatures on every webhook call.

Build lib/jobs/sync-developer-count.ts: an Inngest function that runs whenever a developer is added or soft-deleted. Updates Stripe subscription quantity to match current count (clamped to a minimum of 6). Trigger this from the developer add/delete server actions.

Build a banner component that appears at the top of every authenticated page when payment_status='past_due': "Your last payment failed. Update payment method →".

Acceptance criteria:
- Free org can click "Upgrade", complete checkout, and become Pro
- Pro org sees correct current cost based on developer count
- Adding a developer in a Pro org updates Stripe quantity (verify in Stripe dashboard)
- Cancelling in customer portal downgrades the org to Free
- Failed payment shows the banner
- Webhook signature verification is enforced (test with a wrong-signature payload returning 401)
```

**After this prompt:** Commit as `feat: stripe subscriptions`.

---

## Prompt 6.2 — Free tier enforcement

```
Read CLAUDE.md and architecture.md.

Enforce the Free tier limits as defined in the pricing decision:
- Up to 3 developers tracked (the 4th add is blocked)
- One provider only (Anthropic OR OpenAI). When adding a provider key on Free, the provider becomes locked to the org's first choice.
- 30-day data retention (older usage_events get deleted)
- Daily digest only (no weekly)

Implementation:

lib/plans/limits.ts: exports per-plan limits as a typed object.

In the "Add developer" server action: count current non-deleted developers; if plan='free' and count >= 3, throw a typed PlanLimitError. UI shows a paywall card: "Free plan supports up to 3 developers. Upgrade to Pro →".

In the "Add provider key" server action: if plan='free' and the new key's provider differs from any existing key's provider, throw PlanLimitError. Special-case: the first key sets the locked provider for the org.

Build lib/jobs/enforce-retention.ts: daily cron at 03:00 UTC. For each Free org, delete usage_events older than 30 days. For Pro, delete older than 365 days.

In /billing, surface current usage vs limits clearly: "3 of 3 developers used", "1 of 1 providers used", "Plan retains 30 days of history". For Pro, no limits to surface — show feature list instead.

Acceptance criteria:
- Cannot add a 4th developer on Free
- Cannot add an OpenAI key after adding an Anthropic key on Free
- Retention cron deletes old data correctly (test by inserting an old event and running the cron manually)
- Upgrading to Pro lifts all limits immediately
- Downgrading to Free with >3 developers does NOT auto-delete developers; instead, the org enters a "grace" state with a banner asking them to remove developers OR re-upgrade. Block new key additions until count <= 3.
```

**After this prompt:** Commit as `feat: free tier enforcement`.

---

# Phase 7 — Polish and launch prep (Days 27–35)

## Prompt 7.1 — Developer invite via magic link

```
Read CLAUDE.md and architecture.md.

Goal: let an admin invite a developer to set up their own provider keys, rather than requiring the admin to handle keys on their behalf.

Build:

1. New table: developer_invites
   - id, org_id, developer_id, email, token (unique), created_at, expires_at, claimed_at

2. On /developers/[id], add an "Invite to set up keys" button that creates an invite, sends an email via Resend, and shows the magic link to copy.

3. New public route /invite/[token]:
   - No auth required
   - Validates token, not expired, not claimed
   - Shows the developer's name and what they're being asked to do
   - Form: add an Anthropic key, an OpenAI key (or skip), step-by-step instructions for each
   - Validates keys via the provider client
   - On submit: stores encrypted keys, marks invite claimed_at, redirects to a success page

4. Email template (Resend):
   - Subject: "Set up your AI spend tracking for {org_name}"
   - Body: brief explanation + the magic link + what they need (5 minutes of setup)

Use a JWT-style signed token rather than a random string, signed with a server secret, so we don't need to query the DB for token validation in the public route (defense against enumeration). 7-day expiration.

Acceptance criteria:
- Admin can send an invite, email arrives
- Developer can claim the invite without an account
- Keys get added to the correct developer
- Expired/claimed tokens are rejected gracefully
- The page works on mobile (developers often check email on phones)
```

**After this prompt:** Commit as `feat: developer invite flow`.

---

## Prompt 7.2 — Slack slash commands

```
Read CLAUDE.md and architecture.md.

Add a slash command /spend in the Slack app config. Endpoint: /api/integrations/slack/commands.

Build /api/integrations/slack/commands/route.ts:
- Verify Slack signing
- Parse the command text
- Supported subcommands:
  - /spend → today's totals (terse): "Today so far: $X. Top: @alice $Y, @bob $Z."
  - /spend yesterday → yesterday's summary (terse)
  - /spend week → last 7 days summary
  - /spend @alice → @-resolve to a developer (match by slack_user_id or display name fuzzy), show their last 7 days
  - /spend help → list commands

Responses are ephemeral by default (only visible to the user who ran the command), with an "Make public" button that re-posts the same content in-channel.

Resolve the org from the Slack workspace_id → slack_installations.org_id mapping.

Acceptance criteria:
- /spend in the connected workspace returns today's totals
- /spend @alice works if Alice's slack_user_id is populated
- /spend in an unconnected workspace returns a helpful error
- Responses arrive within Slack's 3-second window (use deferred responses if any query takes longer)
```

**After this prompt:** Commit as `feat: slack slash commands`.

---

## Prompt 7.3 — Weekly digest

```
Read CLAUDE.md and architecture.md.

Build a weekly digest variant. Mondays at the org's local digest_time_local.

Content (Block Kit):
- Header: "📈 Weekly AI spend recap: {org_name}"
- Section: total spend last week, vs prior week (% change)
- Section: top 5 developers (name, cost, % of total)
- Section: spend by provider (Anthropic / OpenAI / Copilot bar visual via blocks)
- Section: anomalies from the week (count + severity breakdown)
- Section: "Notable changes" — developers whose week-over-week change exceeds 50% (up or down)
- Context: link to dashboard for the prior week

Cron: same scheduler pattern as daily, but firing on Monday only.

Add a settings toggle for "Send weekly digest" (default on for Pro, off for Free since it's a paid-tier feature).

Acceptance criteria:
- Manually trigger a weekly digest, verify formatting
- Free org doesn't get weekly digests
- Pro org gets it Monday at configured time
- Block Kit handles edge cases (zero developers, zero spend)
```

**After this prompt:** Commit as `feat: weekly digest`.

---

## Prompt 7.4 — Sentry, healthchecks, error pages

```
Read CLAUDE.md and architecture.md §12.

Install @sentry/nextjs. Configure for both web and Inngest functions. Tag every event with org_id (when available from context) and user_id.

Build /api/health/route.ts (extend the existing one):
- Checks: DB SELECT 1, KMS decrypt of a known canary value, Inngest connectivity (optional)
- Returns 200 with details, or 503 if any check fails

Build custom error pages:
- app/error.tsx: friendly fallback for unhandled errors in the app, with a "Reload" button. Logs to Sentry.
- app/not-found.tsx: simple 404
- app/(app)/error.tsx: same but inside the app shell so navigation still works

Add lib/errors.ts with typed errors (PlanLimitError, ProviderAuthError, etc.) and a serverActionWrapper helper that catches them and returns typed responses to client actions.

Add CSP headers via next.config.js: strict default-src 'self', allowlist for Clerk, Stripe, Slack, Linear, Sentry, our CDN.

Acceptance criteria:
- Throwing a test error in dev shows the friendly error page and a Sentry event arrives
- /api/health returns 503 if KMS credentials are wrong
- CSP doesn't break any in-app feature (verify Clerk, Stripe Checkout, charts)
- Sentry events are tagged with org_id when applicable
```

**After this prompt:** Commit as `feat: observability and error handling`.

---

## Prompt 7.5 — Marketing site

```
Read CLAUDE.md and the pricing decisions in this thread.

Build /(marketing) routes:
- / (home): hero, "the problem", "the product" (3-feature grid), pricing snapshot, FAQ, CTA
- /pricing: detailed Free vs Pro comparison table, FAQ about pricing, annual toggle
- /privacy: privacy policy (boilerplate with notes for legal review)
- /terms: terms of service (boilerplate with notes for legal review)
- /security: brief security overview (read-only, no prompts seen, envelope encryption, isolation)

Design language:
- Neutral, technical, "we do one thing well"
- No marketing-style gradients
- Code-like fonts in select callouts
- Real numbers and real screenshots (mock the dashboard screenshot)
- No testimonials yet — leave space for them

Specific content for the hero:
- Headline: "Know exactly what your team spends on AI."
- Subheadline: "Per-developer attribution for Anthropic, OpenAI, and Copilot. Anomaly alerts in Slack. No proxy required."
- Two CTAs: "Start free" (→ /sign-up) and "See pricing" (→ /pricing)

Specific framing for "the problem" section: reference the actual Microsoft/Uber overruns story without naming them ("Some of the world's largest companies have blown through annual AI budgets in months..."). Frame us as the answer.

Pricing page must surface:
- "No per-event fees. No surprise overages. Cancel anytime." (we agreed on this earlier)
- The $99/mo Pro minimum
- 17% annual discount toggle

Build a footer with copyright, links to privacy/terms/security, contact email.

Acceptance criteria:
- Marketing pages don't require auth
- They render on mobile cleanly
- Lighthouse score 95+ on performance (static where possible, ISR otherwise)
- Pricing page math is correct for the toggle states
```

**After this prompt:** Commit as `feat: marketing site`.

---

## Prompt 7.6 — Launch checklist and polish

```
Read CLAUDE.md and architecture.md.

This is the pre-launch sweep. Go through and verify/fix the following:

1. **Onboarding polish:**
   - After signup, the empty dashboard should have a clear next-step CTA: "Add your first developer →" or "Add a provider key →"
   - Detect zero-state and show a guided checklist: ☐ Add a developer ☐ Add a provider key ☐ Connect Slack ☐ Wait for first ingestion

2. **Empty states everywhere:**
   - Dashboard with no data
   - Developers page with no developers
   - Anomalies page with no anomalies (already done)
   - Each should have a clear illustration or icon + one-sentence explanation + CTA

3. **Loading states:**
   - All async UI uses skeletons, not spinners
   - Server actions show pending state on the trigger button

4. **Error states:**
   - Network failures show a toast
   - 403s redirect appropriately
   - Provider key errors are surfaced clearly in the keys list

5. **Accessibility audit:**
   - Run axe-core or similar
   - Keyboard nav works for all interactive elements
   - Focus rings visible
   - Color contrast passes AA

6. **SEO basics:**
   - Meta tags on marketing pages
   - sitemap.xml
   - robots.txt allowing marketing, disallowing /app/

7. **Cron sanity:**
   - List all crons from lib/jobs/schedule.ts
   - Verify each is registered with Inngest
   - Verify expected execution frequency in the Inngest dashboard

8. **Smoke test script:**
   - Build scripts/smoke-test.ts that, given a test org, exercises: add developer → add key → trigger ingestion → verify usage_events → trigger digest → verify Slack post
   - Used for post-deploy verification

9. **Stripe go-live:**
   - Move from test mode to live mode
   - Verify webhooks point to production URL
   - Test a real card transaction in incognito

10. **Domain and DNS:**
    - Set up your production domain
    - SSL is automatic via Vercel
    - Configure email DKIM/SPF for Resend

11. **Backup verification:**
    - Confirm Postgres provider's automated backups are on
    - Note the restore procedure in ops/runbook.md (create the file if needed)

Acceptance criteria:
- All eleven items above verified
- A new user can sign up, add a developer, add a key, see data within 30 minutes
- The full happy path (signup → first digest) has been walked through end-to-end on production
```

**After this prompt:** Commit as `chore: launch readiness`. Tag the commit `v1.0.0`.

---

# After launch

## Prompt 8.1 — First-week metrics

Once you have your first 5 customers:

```
Read CLAUDE.md.

Build a simple internal admin page at /admin (gated to a hardcoded list of admin emails — no UI, just hardcoded check):

- Total orgs (Free vs Pro split)
- New signups last 7d
- Active orgs (any ingestion in last 7d)
- Total usage_events ingested last 7d
- Anomalies detected last 7d
- Digests sent last 7d
- Errors from Sentry (link out)
- MRR (sum of active subscriptions)

No fancy charts. Just numbers. This is for you, not customers.

Acceptance criteria:
- Loads in under 1 second
- Hardcoded admin check works (non-admins get 404)
- Numbers match what's in Stripe/Postgres directly
```

---

## What to do when a prompt goes wrong

If Claude Code produces something broken or wildly off-base in a session:

1. **Don't try to fix it in the same session.** The context is poisoned.
2. **Git reset.** Throw away the changes.
3. **Start a new session.**
4. **Re-prompt with the original prompt PLUS a "Constraints" section** describing what went wrong and what to avoid. Example:
   ```
   [original prompt]
   
   Constraints:
   - Do NOT use Prisma. We use Drizzle.
   - Do NOT create new dependencies without listing them and asking first.
   - Reference architecture.md §6 for the ingestion flow.
   ```
5. **If it goes wrong again, the prompt is too big.** Split it in half.

## When to deviate from this order

Reorder when:
- A customer prospect tells you they need feature X to buy → prioritize X.
- A bug in something already shipped is blocking customer use → fix before continuing.
- You learn the assumed architecture is wrong → stop, update architecture.md and CLAUDE.md, then re-plan downstream prompts.

Don't reorder for:
- A shiny library you saw on Twitter.
- A "while we're in here" refactor.
- Premature optimization based on imagined scale.

Stay on the path.
