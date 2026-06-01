# Architecture

This document describes how the system is built. It complements `CLAUDE.md` (which covers *why* and *what*) by describing *how*. If you change something here, also reconcile it with CLAUDE.md's load-bearing decisions.

---

## 1. System overview

Three planes:

- **Web plane** — Next.js app. Marketing pages, admin UI, OAuth callbacks, Stripe webhooks, internal API routes.
- **Worker plane** — Inngest functions. Scheduled ingestion, anomaly detection, digest composition, Slack/Linear delivery.
- **Data plane** — Postgres (managed). Single source of truth. No separate cache, queue, or search service in v1.

```mermaid
flowchart LR
    subgraph External["External systems"]
        AP[Anthropic Admin API]
        OAI[OpenAI Usage API]
        GH[GitHub Copilot Billing]
        SLACK[Slack]
        LIN[Linear]
        STR[Stripe]
        CLK[Clerk]
        KMS[AWS KMS]
    end

    subgraph Web["Web plane — Vercel"]
        NEXT[Next.js app]
    end

    subgraph Workers["Worker plane — Inngest Cloud"]
        ING[Ingestion workers]
        ANO[Anomaly detection]
        DIG[Digest composer]
        NOT[Notification dispatch]
    end

    subgraph Data["Data plane"]
        PG[(Postgres)]
    end

    User[Customer admin/dev] -->|HTTPS| NEXT
    NEXT --> PG
    NEXT --> CLK
    NEXT --> STR
    NEXT --> KMS

    ING --> AP
    ING --> OAI
    ING --> GH
    ING --> PG
    ING --> KMS

    ANO --> PG
    ANO --> NOT

    DIG --> PG
    DIG --> NOT

    NOT --> SLACK
    NOT --> LIN
    NOT --> PG

    STR -->|webhooks| NEXT
    SLACK -->|events/slash cmds| NEXT
```

**Why three planes:** keeps user-facing latency (web) decoupled from long-running provider polls (workers) and ensures a database outage degrades cleanly (web returns 503, workers retry).

---

## 2. Component responsibilities

### Web plane (Next.js, Vercel)

- **Marketing pages** — static, ISR where useful.
- **Authenticated admin UI** — org settings, developer management, provider key entry/rotation, integration setup, billing.
- **OAuth callbacks** — Slack, Linear, Clerk.
- **Webhook receivers** — Stripe (subscription events), Slack (slash commands, interactivity).
- **Internal API routes** — invoked by the UI; never directly by workers.
- **No direct provider polling.** The web tier never calls Anthropic/OpenAI/GitHub on a user request path. All such calls happen in workers.

### Worker plane (Inngest)

- **Ingestion functions** — one per provider, fan-out per `provider_key`. Triggered on cron (hourly) and on-demand (key added → immediate backfill).
- **Anomaly detection function** — runs after each org's ingestion completes. Computes rolling stats, writes to `anomalies`, fans out notifications.
- **Digest composer** — daily and weekly, scheduled per-org based on the org's configured local time.
- **Notification dispatch** — formats Slack Block Kit messages and Linear GraphQL mutations, with retry and dead-letter behavior.
- **Maintenance functions** — Stripe sync reconciliation, expired key cleanup, data retention enforcement.

Each function is independently retryable, idempotent, and observable.

### Data plane (Postgres)

- Single managed Postgres instance (Supabase or Neon).
- Row-level security policies enforce `org_id` scoping.
- `pgcrypto` extension used for application-layer encryption helpers (KMS is the master, pgcrypto is occasionally used for hashing/fingerprinting).
- No read replicas in v1. Add when read load demands it (likely never at our scale).
- Daily snapshot backups via the managed provider; point-in-time recovery enabled.

---

## 3. Data model

See CLAUDE.md for the table summary. This section covers relationships, indexes, and design notes.

### Entity relationships

```mermaid
erDiagram
    organizations ||--o{ users : has
    organizations ||--o{ developers : tracks
    organizations ||--o{ provider_keys : owns
    organizations ||--o{ usage_events : owns
    organizations ||--o{ anomalies : owns
    organizations ||--o| slack_installations : has
    organizations ||--o| linear_installations : has
    organizations ||--o| subscriptions : has

    developers ||--o{ provider_keys : owns
    developers ||--o{ anomalies : flagged_for

    provider_keys ||--o{ usage_events : generates
    providers ||--o{ provider_keys : powers
    providers ||--o{ usage_events : categorizes
```

### Key indexes

```sql
-- Hot path: daily digest queries
CREATE INDEX idx_usage_events_org_bucket
  ON usage_events (org_id, time_bucket DESC);

-- Per-developer rollups
CREATE INDEX idx_usage_events_org_dev_bucket
  ON usage_events (org_id, developer_id, time_bucket DESC);

-- Anomaly detection rolling window
CREATE INDEX idx_usage_events_dev_bucket
  ON usage_events (developer_id, time_bucket DESC);

-- Ingestion idempotency (also serves as unique constraint)
CREATE UNIQUE INDEX uniq_usage_events_natural_key
  ON usage_events (provider_key_id, time_bucket, model);

-- Anomalies feed
CREATE INDEX idx_anomalies_org_unack
  ON anomalies (org_id, detected_at DESC)
  WHERE acknowledged_at IS NULL;
```

### Money and time

- `cost_usd_micros bigint` — never floats for currency. `$1.00 = 1_000_000`.
- All `timestamptz`, stored UTC. `time_bucket date` is in UTC (this is an explicit, documented choice — see §10).
- Display conversion to local time happens at the edge in the user's browser.

### Soft delete

`organizations`, `developers`, `provider_keys` use `deleted_at timestamptz`. Hard-deletes only run as part of a customer-initiated GDPR/data-deletion request, executed by a maintenance worker.

---

## 3a. Attribution model (agents & workflows)

The MVP attributes spend to a **developer**. Agents and workflows add a second, finer attribution axis: *which workflow/agent burned this?* — the question that matters once one agent can outspend a whole team. This layer is **derived** and sits entirely on top of `usage_events`. It is added in Phase 8 (prompt 8.1).

### The immutability rule (load-bearing)

`usage_events` is the source of truth and is **immutable and idempotent** on its natural key (`provider_key_id, external_identity, time_bucket, model`). We **never** add a mutable attribution column to it and **never** `UPDATE` a usage row to attach an agent, workflow, run, or customer. Attribution is *derived* and lives in its own recomputable tables, each keyed back to a `usage_events` row. If a mapping changes, we recompute the derived table; the raw ledger never moves.

This keeps re-ingestion, retries, and provider back-revisions safe (the ledger invariant is untouched) and lets us re-derive attribution from scratch at any time without risk to the underlying numbers.

### Tables

All five are org-scoped (`org_id NOT NULL`) and carry the standard RLS policy
`USING (org_id = current_setting('app.current_org_id', true)::uuid)` — see §4. Drizzle does not manage policies, so each is enabled in the migration alongside the table (mirroring `0002_enable_rls.sql`).

- **`agents`** — a named agent whose spend we attribute (`name`, `description`, `status` = `active | archived`). A product/automation, not a person.
- **`workflows`** — a logical run-path. `agent_id` is a **nullable** FK to `agents` (a workflow may stand alone or belong to an agent). `name`, `description`, `status` = `active | archived`.
- **`workflow_runs`** — a single execution of a workflow. `external_run_id` is the customer's own run/trace id (from observability or the SDK), **nullable**, and **unique per `(org_id, workflow_id, external_run_id)` when present** (partial unique index `WHERE external_run_id IS NOT NULL`). Carries `started_at`/`ended_at` (nullable), `status` = `running | completed | failed | unknown`, and `customer_ref` (nullable — the customer's end-customer this run served, for per-customer COGS later). Indexed on `(org_id, workflow_id, started_at)`.
- **`attribution_sources`** — records **how** an attribution was derived, for audit + recompute. `source_type` = `key_mapping | observability | sdk_tag`, a `label`, and a `config` jsonb for source-specific settings.
- **`usage_attribution`** — the **derived join**, recomputable, never the source of truth. One row per `usage_events` row: `usage_event_id` (FK), nullable `agent_id` / `workflow_id` / `workflow_run_id` / `customer_ref`, an `attribution_source_id` (FK, how it was derived), and `confidence` = `exact` (key/tag mapping) or `inferred` (timestamp/fingerprint join). The **unique index on `(org_id, usage_event_id)`** enforces one attribution row per event.

### Recompute strategy

`usage_attribution` is fully derivable from `usage_events` + the active mappings/sources. When a source mapping changes (e.g. a key is reassigned to a different agent), we recompute **per affected event** by **delete + reinsert** of its `usage_attribution` row — idempotent, so re-running yields identical row counts and never duplicates (the unique index on `(org_id, usage_event_id)` guarantees it). At ingest, a new `usage_events` row is attributed inline only when a mapping applies; with no mapping, no attribution row is written and ingestion behaves exactly as before. The raw ledger is read, never written, by any of this.

> Read-performance note: if attribution rollups get slow, the answer is a materialized rollup keyed off `usage_attribution`, **not** denormalizing dimensions onto `usage_events`. The ledger stays immutable.

### Approach A — key/developer → agent mapping (Phase 8.2)

The first agent-attribution source is a pure mapping, no new data feeds. It is adapted to the current attribution model (load-bearing decision #2: one org-wide admin key per provider, with per-identity breakdown), so the mapping attaches at the **identity** and **developer** level rather than at the org `provider_keys` row (which would attribute the whole org to one agent):

- **`provider_identities.agent_id`** (nullable FK → `agents`) — maps a single provider-side identity (an Anthropic `api_key_id`, OpenAI `user_id`, or Copilot seat) to an agent. A customer who mints a dedicated key per agent sees that key as its own identity, so this is the "key → agent" path.
- **`developers.agent_id`** (nullable FK → `agents`) — maps a developer to an agent (the "this dev's key is really the support bot" case).

**Resolution precedence.** For each `usage_events` row the agent is `COALESCE(identity.agent_id, developer.agent_id)` — the identity mapping wins; the developer mapping is the fallback; if neither resolves, the event is left **unattributed** (no `usage_attribution` row). A shared key that serves multiple agents cannot be split at this level — it is left unattributed at the agent level, pending workflow-level attribution (Phase 8.3/8.4).

**Derivation source.** These rows are written with a single per-org `attribution_sources` row of `source_type = key_mapping` and `confidence = exact`, `workflow_id = NULL`.

**ROI honesty — never hide unattributed spend.** Because agent ROI depends on a complete cost denominator, unattributed spend is surfaced, never silently dropped. `lib/attribution/coverage.ts` reports, for a period, total vs agent-attributed spend and the unattributed remainder; the Providers page shows "agent attribution coverage · 30d" and the dollars not attributed to any agent. A shared key that can't be split at the identity level lands in this unattributed bucket until observability attribution (Prompt 8.3) can split it by `workflow_run`. We never guess a split to make coverage look higher.

**Two write paths, both in `lib/attribution/key-mapping.ts`:**
- *Inline at ingest* — the ingestion worker (`lib/jobs/ingest-provider-key.ts`) resolves the agent for each upserted event and writes its `usage_attribution` row when (and only when) a mapping applies. Additive: no mapping → no row, and ingestion behaves exactly as before.
- *Recompute* — `recomputeOrgKeyMappingAttribution(orgId)` does the §3a delete+reinsert for the whole org: delete the org's `key_mapping` rows, then reinsert one per event that resolves to an agent. Idempotent (re-running yields identical counts; guaranteed by the unique `(org_id, usage_event_id)` index). It runs in the `recompute-attribution` Inngest job, fired whenever an identity→agent or developer→agent mapping changes and from the manual "Recompute attribution" action on the Providers page.

---

## 3b. Observability connectors (Langfuse / Helicone)

Approach C reads run/trace metadata from the customer's existing LLM-observability tool and joins it to `usage_events` — the same passive, polled posture as the provider usage APIs (decision #1). It is **not** in the request path.

### Metadata only — the hard rule

We pull **metadata only**: run/trace ids, workflow names, timing, model, and token counts. We **never** request, read, or store prompt/response/input/output content, even when the API returns it. The connector contract (`lib/observability/types.ts`) has no field that can carry message content, and each adapter copies a fixed allowlist of metadata fields — it never references the `input`/`output`/body fields on the upstream objects. Generation token records are used transiently for the join and are **not** persisted as rows.

Persisted fields and their (potentially customer-controlled) sources:
- `workflows.name` ← Langfuse trace `name` / Helicone `session:<id>`. Treated as a **label only**; persisted truncated to a short length so an accidental free-text value can't carry meaningful content.
- `workflow_runs`: `external_run_id` (trace id / session id), `started_at`, `ended_at`, `status`, `customer_ref` (Langfuse `userId` / Helicone user) — `customer_ref` is treated as an opaque end-customer id.
- `observability_connections`: provider, `base_url`, KMS-encrypted credentials (same envelope as `provider_keys`, §-encryption), status, sync timing.

### The (model, day) fingerprint join

Provider usage APIs report **daily aggregates** (`usage_events` is one row per `provider_key × identity × day × model`), so a single observability generation cannot be matched to a per-call usage row. The join therefore operates at the **`(model, day)` grain**: generations are grouped by their model and UTC day, and a `usage_events` row (a model's spend for one day) is attributed to a workflow only when **exactly one** workflow claims that `(model, day)`. Ambiguous days (multiple workflows) are left **unattributed** — no guessing — and surface in attribution coverage (§3a). A `workflow_run_id` is linked only when exactly one run claims the day. Confidence is always `inferred` (daily aggregates carry no provider request id for an `exact` match). The poller logs the match rate (`usage matched / in-window`, `runs linked`); unmatched runs are retained as `workflow_runs` for run-count value.

Cross-source precedence: the observability upsert fills `workflow_id`/`workflow_run_id`/`customer_ref` and preserves any existing agent via `COALESCE(existing agent_id, workflow's agent_id)`, so it never clobbers an `exact` key-mapping agent (§3a). A full precedence/re-derivation engine across sources is deferred.

### Polling

`lib/observability/sync.ts` does the work; `lib/jobs/poll-observability.ts` wraps it as an Inngest function (`observability/poll.requested`) plus an hourly cron (`cron-observability-poll`, offset 30 min after ingestion so the day's `usage_events` are present). Idempotent: workflows upsert by name, runs by `external_run_id`, attribution by the unique `(org_id, usage_event_id)`. Auth errors set `status = error`; transient errors retry. Reads metadata only and never mutates `usage_events`.

---

## 3d. Finance dimensions

The first piece of the Finance tier (Phase 9.1) is **master data**: the dimensions every dollar rolls up to, so spend becomes finance-readable. This prompt adds the master tables and CRUD only — the *allocation* of usage to these dimensions is a separate, derived, recomputable table (Prompt 9.2), never a mutation of `usage_events`.

Five org-scoped tables, each with the standard RLS policy and a unique `(org_id, code)`:

- **`cost_centers`** — `code`, `name`, `parent_id` (self-FK), `owner_ref`, `status`. `parent_id` gives a **hierarchy for rollups** (developer → team → cost center → department); the dimensions UI renders the tree from `parent_id`.
- **`gl_accounts`** — `code`, `name`, `account_type` (`cogs | opex_rnd | opex_ga | opex_sm | other`), `status`. `account_type` is what makes COGS-vs-opex visible at a glance later (margin, accruals).
- **`projects`**, **`product_lines`** — `code`, `name`, `status`.
- **`entities`** — `code`, `name`, `functional_currency` (ISO 4217), `status`. Entity currency feeds period/FX handling downstream; Reckon tags entity-level splits and lets the ERP do the journal/FX (we never compute tax).

All carry a `status` enum (`active | archived`); the UI archives rather than hard-deletes so historical allocations keep their references. Admin CRUD lives under the Finance surface at `/finance/dimensions` (a tab per dimension; cost centers as a tree). **Rollup intent:** spend is aggregated up the `cost_centers` tree and grouped by `gl_accounts.account_type` in the showback views (Prompt 9.4).

---

## 3e. Account determination & cost allocations

A **light**, deterministic, ordered, overridable mapping from usage to finance dimensions (Phase 9.2) — deliberately *not* a general rules engine (Ramp/Coupa own that). `lib/finance/allocate.ts` is the engine.

**Rule evaluation order.** `attribution_rules` are evaluated in `priority` order, **lower wins**. A rule's `match` (jsonb) must hold on every specified key; only `provider`, `model`, `agentId`, `workflowId` are verifiable, so a rule constraining anything else (e.g. `environment`) does **not** match — we never assume an unverifiable constraint holds. The **first** matching rule assigns; later matching rules **fill only still-unset** fields (never overwrite). The first rule to contribute is recorded as `rule_id`.

**Suspense / never-guess.** If no rule assigns a GL account, the event is **never** silently coded. It routes to `coding_status = suspense` (with `gl_account_id` set to the org's configured `organizations.suspense_gl_account_id`) when one exists, else `needs_coding`. The needs-coding queue (`/finance/coding`) lists everything not `coded`, grouped by provider/model/agent; a controller codes a group manually.

**Overrides survive recompute.** Manual codings live in their own durable table, **`cost_allocation_overrides`** (keyed per event) — *not* in the derived output. `cost_allocations` is the recomputable output (one row per usage_event, unique on `(org_id, usage_event_id)`), with `overridden = true` flagging override-sourced rows. Recompute (`recomputeOrgAllocations`) is a **drop-and-rebuild**: delete the org's `cost_allocations`, then recompute each event from rules + overrides + suspense. Because overrides are a separate input, they are re-applied on every rebuild — so `cost_allocations` is **fully derivable from `usage_events` + rules + overrides** (drop and rebuild, counts match), and a manual override always wins and persists. Inline coding at ingest is additive (writes a row only when a rule/suspense codes the event; never clobbers an override via `setWhere overridden = false`). Fired via the `recompute-allocations` Inngest job on any rule/override/suspense change.

**COGS stop-and-ask (gross-margin guard).** Activating a rule that assigns a **COGS** GL account with a **broad** match (empty, or `provider`-only — not narrowed to a model/agent/workflow) is gated: `saveRule` throws `COGS_CONFIRM_REQUIRED` and the UI requires explicit confirmation before activating. Misclassifying opex as COGS distorts gross margin, so this is never silent.

---

## 3f. Shared-cost allocation (drivers)

Spend that maps to a shared key/gateway rather than one owner is split across cost centers by a **driver** (Phase 9.3). A rule marks an event as shared by assigning an `allocation_driver_id` (instead of a `cost_center_id`) in its `assign`.

**Driver methods** (`allocation_drivers.method`, with method-specific `config` jsonb):
- `usage_tokens` *(default, fairest for AI)* — split by each target cost center's share of directly-attributed token volume in scope. `config.cost_center_ids` (optional; defaults to all cost centers with usage).
- `even` — equal split across `config.cost_center_ids`.
- `fixed_pct` — `config.weights` `{ ccId: bps }`.
- `headcount` / `revenue` — split by `config.values` `{ ccId: number }`. These are **external numbers we don't hold**; the customer supplies them in config and we **never fabricate** them (the engine refuses to split if values are absent — the stop-and-ask).

**Split representation.** A shared event produces **multiple `cost_allocations` rows** (one per target cost center), each with `allocation_pct` in **basis points** (10000 = 100%). Direct/uncoded events are a single row at `allocation_pct = 10000`. The DB has no unique on `(org, event)` anymore — a direct event has one row, a shared event several — and correctness is by construction: every writer deletes the event's rows before inserting, and recompute is delete-all-then-rebuild. Recompute is two-pass: pass 1 base-codes every event and accumulates per-cost-center token volume; pass 2 emits the split rows.

**Splits sum to exactly 100%.** The split uses **largest-remainder** over the targets so the basis points sum to **exactly 10000** — the rounding residual is distributed, never dropped. If `organizations.rounding_cost_center_id` is configured, the residual lands on that cost center instead. Both paths guarantee an exact 10000-bps sum.

---

## 3g. Finance showback, rollups & budgets

The Finance surface root (`/finance`, Phase 9.4) is **read-only showback finance can trust**. It never mutates `usage_events` or `cost_allocations`.

**Reconciliation by construction.** Rollups read `cost_allocations` via a **LEFT JOIN from `usage_events`**, so every event is represented — uncoded events (no allocation row) fall into an explicit **"Uncoded"** bucket. Allocated cost = `usage_event.cost × allocation_pct ÷ 10000`. We sum the **weighted** value (`cost × pct`) per group and divide by 10000 once at the end, so a shared event's split rows recombine to its exact cost and the **grand total equals raw billed usage exactly**. A shared key visibly fans out across its consuming cost centers.

**Views** (all period-selectable by month, each drills to contributing usage):
- **Cost centers** — rolled up the `cost_centers` tree (each node shows direct + rolled-up subtree total). Weighted sums roll up the tree, divided to micros per node.
- **GL accounts** — grouped with a COGS-vs-opex headline (`gl_accounts.account_type`), so margin-relevant spend is obvious at a glance.
- **Entities** and **Product lines** — flat rollups.

**Budgets.** `budgets(scope_type ∈ {cost_center, gl_account, project}, scope_id, period "YYYY-MM"|"YYYY", amount_micros)` is kept **separate from actuals**; budget-vs-actual is computed at read time. Cost-center actuals roll up the **subtree**. Each row shows variance in $ and %, plus a month-to-date **pace** indicator (budget × day-of-month ÷ days-in-month vs actual) for the current month.

**Privacy — dimensions, not people.** Showback defaults to rolled-up dimensions and shows **no individual developer names**. The drill-through to contributing usage includes developer names **only** when the viewer also holds `operations` surface access (`getDrillAction` passes `hasSurface(user, "operations")`); a finance-only member sees provider/model/cost but no people.

---

## 4. Multi-tenancy and isolation

Every row in customer-data tables carries `org_id`. Two layers of defense:

**Layer 1 — Application code.** Every Drizzle query is scoped by `org_id`. We never `SELECT * FROM usage_events`. The org_id comes from the authenticated session (web) or the job payload (workers); it is *never* taken from a user-supplied parameter.

**Layer 2 — Postgres RLS.** Every customer-data table has a policy roughly like:

```sql
CREATE POLICY tenant_isolation ON usage_events
  USING (org_id = current_setting('app.current_org_id', true)::uuid);
```

The app sets `app.current_org_id` at the start of each request/job. If we forget to scope a query, RLS returns zero rows rather than leaking data across orgs.

**The exception:** maintenance functions that need cross-org reads (e.g., billing reconciliation) run as a privileged Postgres role that bypasses RLS. These functions live in a separate code directory (`workers/admin/*`) and are explicitly audited.

---

## 4a. Surfaces (role-aware app shell)

The app is split into three **surfaces** over one shared data spine (Phase 8.5), each a different audience's lens on the same `usage_events`/attribution data:

- **operations** — the original product: dashboard, developers, providers, observability, anomalies, integrations.
- **workflows** — cost per agent/workflow/run, run distributions, the run explorer.
- **finance** — showback, dimensions, reconciliation, accruals, unit economics (filled in Phases 9–13).

**Access model (not Clerk paid roles).** Access is stored on our own membership row: `users.surfaces surface[]` (`surface` enum = operations|workflows|finance). Defaults: org **admins get all three** (and `hasSurface()` always returns true for admins regardless of the column); new members default to `[operations]`; a finance assignment grants `[finance, workflows]`. Admins set per-member access at `/members`. We deliberately do **not** depend on Clerk custom roles. Surfaces are synced on membership creation (Clerk webhook + onboarding); `lib/auth.ts` exposes `hasSurface(user, surface)` and `requireSurface(surface)`.

**Route structure.** Routes live in Next.js route groups under `app/(app)/`: `(operations)/`, `(workflows)/`, `(finance)/`. Route groups are **URL-transparent** — moving the existing pages into `(operations)/` did not change any URL (`/dashboard` stays `/dashboard`), so no customer deep links broke and no redirects were needed. Account pages (`settings`, `billing`, `members`) stay at the `(app)` top level (role-gated, not surface-gated). Each group has a `layout.tsx` that `notFound()`s a member lacking that surface, so a forbidden deep link 404s. The sidebar renders only the surfaces the member can access.

**Privacy.** The Workflows surface is a product/finance lens, not a people lens: its queries never select developer names, and the run-explorer drill-down exposes only provider/model/token/cost (no developer identity). Finance rollups (Phase 9+) default to dimensions, not individuals.

---

## 5. Security architecture

### Provider key lifecycle

```mermaid
sequenceDiagram
    participant Dev as Developer
    participant Web as Next.js
    participant KMS as AWS KMS
    participant PG as Postgres
    participant W as Worker

    Dev->>Web: Paste API key (TLS)
    Web->>KMS: GenerateDataKey
    KMS-->>Web: plaintext_dek + encrypted_dek
    Web->>Web: AES-256-GCM encrypt(key, plaintext_dek)
    Web->>Web: Zero plaintext_dek from memory
    Web->>PG: INSERT encrypted_key, encrypted_dek, fingerprint
    Web-->>Dev: Confirmation (last 4 chars shown)

    Note over W: Hours later, scheduled poll

    W->>PG: SELECT encrypted_key, encrypted_dek
    W->>KMS: Decrypt(encrypted_dek)
    KMS-->>W: plaintext_dek
    W->>W: AES-256-GCM decrypt → plaintext key
    W->>+Anthropic: GET /v1/organizations/usage_report (Bearer)
    Anthropic-->>-W: usage data
    W->>W: Zero plaintext from memory
    W->>PG: UPSERT usage_events
```

### Envelope encryption details

- **Master key:** KMS-managed customer master key (CMK), one per environment.
- **Data key:** Per-row, generated by KMS at insert time.
- **Cipher:** AES-256-GCM with random 96-bit IV per encryption. IV and auth tag stored alongside ciphertext.
- **Key rotation:** CMK has automatic annual rotation enabled. Data keys don't need rotation since each is one-use.
- **What's loggable:** only the 4-character `key_fingerprint` (last 4 characters of the original key, e.g. `...x9K2`). Plaintext keys never enter logs, error messages, or Sentry events.

### Authentication and authorization

- **User auth:** Clerk. Sessions are JWT-based, validated server-side on every request.
- **Org membership:** Stored in Clerk organization metadata, mirrored to our `users.org_id` on signup/invite.
- **Roles:** `admin` (manage developers, keys, billing) and `member` (read-only dashboard). Enforced in API route middleware.
- **Worker auth:** Inngest signs every function invocation with a shared HMAC secret. Functions verify the signature before executing.

### Webhook security

- **Stripe webhooks:** verified with Stripe's signature header against the endpoint secret.
- **Slack events:** verified with Slack's signing secret and timestamp window (5 min).
- **Linear:** webhooks not used; we only call Linear's GraphQL API outbound.

### Network egress

- All outbound API calls go through a single HTTP client wrapper that enforces TLS 1.2+, sets a 30s timeout, and tags requests with org_id for tracing.
- No public worker endpoints. Inngest invokes our deployed Next.js routes; the routes verify the signature.

---

## 6. Data flow: Ingestion

```mermaid
sequenceDiagram
    participant Cron as Inngest cron
    participant Orch as Org orchestrator
    participant Poll as Provider poller
    participant KMS as AWS KMS
    participant API as Provider API
    participant PG as Postgres
    participant Ano as Anomaly detection

    Cron->>Orch: Hourly tick
    Orch->>PG: SELECT active orgs
    loop For each org
        Orch->>PG: SELECT active provider_keys for org
        loop For each key (parallel, max 5)
            Orch->>Poll: ingest_provider_key(key_id)
            Poll->>PG: SELECT encrypted_key, encrypted_dek
            Poll->>KMS: Decrypt DEK
            Poll->>API: GET usage for last 48h
            API-->>Poll: usage rows
            Poll->>PG: UPSERT usage_events (ON CONFLICT...)
            Poll->>PG: UPDATE last_polled_at
        end
        Orch->>Ano: detect_anomalies(org_id)
    end
```

**Why 48 hours of overlap on each poll:** providers (especially Anthropic) revise the last 24–72 hours of usage data as late events flow in. We re-pull and let the upsert reconcile. The unique constraint on `(provider_key_id, time_bucket, model)` means re-pulls are safe.

**Failure handling per key:**
- Transient errors (5xx, network, rate limit): exponential backoff with jitter, max 5 attempts. Inngest handles retries.
- Auth errors (401/403): mark key `status = 'errored'`, surface in admin UI, stop polling until rotated.
- Persistent errors after 24h: notify the org admin via Slack/email.

A failed key never blocks other keys in the same org. The org orchestrator runs them in parallel with `Promise.allSettled`.

---

## 7. Data flow: Anomaly detection

```mermaid
flowchart TD
    Start([Ingestion completes for org]) --> Load[Load last 28 days of usage_events for org]
    Load --> Group[Group by developer × provider]
    Group --> Stats[Compute rolling mean and stddev]
    Stats --> Check{Today's daily total}
    Check -->|> mean + 3·stddev| Flag1[Flag: spike]
    Check -->|> 3× trailing 7-day avg| Flag2[Flag: sudden increase]
    Check -->|normal| Skip[No anomaly]
    Flag1 --> Dedupe[Check anomalies for existing unack record today]
    Flag2 --> Dedupe
    Dedupe -->|none| Write[INSERT anomaly]
    Dedupe -->|exists| Update[UPDATE severity if increased]
    Write --> Notify[Queue Slack/Linear notification]
    Update --> Done([Done])
    Skip --> Done
    Notify --> Done
```

**Why not ML.** Engineering managers don't trust black-box alerts. A simple "this developer spent 4× their normal yesterday" is actionable; a model-derived score is not. Revisit only if false-positive rates become a real complaint.

**Suppression rules:**
- A developer flagged today won't re-flag for the same anomaly kind for 24 hours.
- An org with fewer than 7 days of history doesn't get anomaly detection (insufficient baseline).
- Anomalies under $5 absolute change are filtered (don't alert on noise).

### Workflow cost-per-run detector (Phase 8.6)

The same engine also runs over **workflow cost-per-run** — an alert that points at a code path, not a person. For each active workflow it builds a daily series of mean cost-per-run (attributed daily cost ÷ runs started that day) over the trailing 28 days, then reuses the identical thresholding: flag a **spike** when the recent day's mean cost-per-run exceeds `baseline mean + 3·stddev`, or a **sudden increase** when it exceeds `3× baseline mean` (`lib/anomaly/detect-workflows.ts`).

- **Likely cause** is derived from the data and put in the alert: `model_changed` (recent dominant model ≠ baseline), `run_length_grew` (recent tokens-per-run > 1.5× baseline), else `per_call_cost_grew` (same shape, costlier).
- **Floors** so new/quiet workflows don't alert on noise: ≥7 baseline days with runs, ≥10 baseline runs total, ≥3 runs on the recent day; per-run change must exceed $1.
- **Storage:** `anomalies.developer_id` is now nullable; a workflow anomaly sets `anomalies.workflow_id` and `kind = workflow_cost_per_run` (exactly one of developer/workflow is set). The per-developer path is unchanged.
- **Notification:** the Slack builder renders a workflow-named message (before/after cost-per-run, likely cause, link to the workflow detail page); critical severity files a workflow-focused Linear issue. The existing per-developer Slack/Linear path is untouched. The per-developer anomalies list excludes workflow anomalies (its inner join requires a developer), so existing in-app behavior is unchanged.

---

## 8. Data flow: Daily digest

```mermaid
sequenceDiagram
    participant Cron as Inngest scheduler
    participant Comp as Digest composer
    participant PG as Postgres
    participant SLK as Slack

    Cron->>PG: Find orgs whose local digest time is now
    loop For each org
        Cron->>Comp: compose_digest(org_id)
        Comp->>PG: Aggregate yesterday's usage
        Comp->>PG: Fetch trailing 7-day averages
        Comp->>PG: Fetch unacknowledged anomalies
        Comp->>Comp: Build Block Kit message
        Comp->>SLK: chat.postMessage
        SLK-->>Comp: ts
        Comp->>PG: INSERT digest_log
    end
```

Digests run from a single scheduled function that queries for "orgs due now" every 15 minutes, rather than per-org cron entries. This keeps the scheduling configuration in the database, not in code.

---

## 9. Deployment topology

```mermaid
flowchart LR
    subgraph Vercel
        EDGE[Edge / CDN]
        SSR[Next.js SSR]
        API[API routes]
    end
    subgraph Inngest["Inngest Cloud"]
        FUNCS[Functions]
    end
    subgraph Managed["Managed services"]
        SUPA[(Supabase Postgres)]
        CLERK[Clerk]
        STRIPE[Stripe]
        SENTRY[Sentry]
        AWS[AWS KMS]
        RESEND[Resend]
    end

    EDGE --> SSR
    SSR --> API
    API --> SUPA
    API --> CLERK
    API --> STRIPE
    API --> AWS
    FUNCS --> API
    FUNCS --> SUPA
    FUNCS --> AWS
    FUNCS --> RESEND
    SSR --> SENTRY
    FUNCS --> SENTRY
```

**Environments:** `dev` (local), `preview` (per-PR Vercel deployment + isolated Inngest env + branch Postgres), `production`.

**No self-hosted infrastructure** in v1. Every component is managed. The cost is ~$100–200/month at zero customers and scales sub-linearly with customer count for at least the first 1,000 orgs.

---

## 10. Important design choices and their tradeoffs

### UTC time buckets vs per-org local time
Daily totals are bucketed in UTC. A developer working in Tokyo sees their "Monday total" cover their local Sunday-Monday span. This is a known imperfection. The alternative — per-org local bucketing — multiplies storage and complicates cross-org analytics. Revisit if customers complain.

### Single Postgres for everything
No Redis, no separate analytics DB, no search service. Postgres is more than capable at our scale (rolling stats over a few million rows per org is trivial). Resist the urge to add specialized stores until query latency demands it.

### Inngest over a self-managed queue
Inngest gives us scheduled functions, retries, dead-letter handling, observability, and step-function semantics out of the box. The lock-in cost is acceptable; we'd build worse versions of these ourselves.

### Drizzle over Prisma
Drizzle's query builder is closer to SQL, which matters because our query patterns are analytical (rollups, window functions) more than transactional. Migration ergonomics are slightly worse than Prisma's; we accept it.

### Clerk over rolling our own auth
Auth is a tax, not a differentiator. Clerk handles SSO when we eventually need it without rewriting our authentication stack.

### No GraphQL, no tRPC
Internal API routes are plain Next.js Route Handlers returning JSON, typed end-to-end with shared Zod schemas. tRPC was considered; the additional abstraction wasn't worth the lock-in given our small API surface.

---

## 11. Failure modes

| Failure | Detection | Behavior | Recovery |
|---|---|---|---|
| Provider API down | 5xx or timeout on poll | Retry with backoff, mark transient | Auto-recovers on next cron |
| Customer's provider key revoked | 401 from provider | Mark key `errored`, notify admin | Admin rotates key in UI |
| Slack workspace uninstalled us | `account_inactive` on post | Mark Slack install inactive, email admin | Admin reinstalls |
| Stripe subscription canceled | Stripe webhook | Mark org `past_due`, stop ingestion after 7-day grace | Admin updates billing |
| Postgres unavailable | Connection errors | Web returns 503; workers retry; Inngest queues | Auto-recovers when DB returns |
| KMS unavailable | Decrypt error | Workers retry; ingestion delayed | Auto-recovers; alert if >1h |
| Anomaly false positive | Customer feedback | None automatic | Tune thresholds in `lib/anomaly/config.ts` |
| Ingestion job hung | Inngest timeout (>15min) | Auto-killed and retried | Idempotent, safe to retry |
| Daily digest missed | `digest_log` row missing for org+day | Recovery job re-runs at next scheduled tick | Customer sees a late digest |

---

## 12. Observability

- **Errors:** Sentry, tagged with `org_id`, `user_id`, `provider`, `job_name`.
- **Logs:** structured JSON to platform stdout (Vercel and Inngest collect). No external log aggregator in v1.
- **Metrics:** ingestion success rate, digest delivery rate, anomaly false-positive rate (manual, from customer feedback). Tracked via Inngest's built-in dashboards and a weekly admin email.
- **Customer-facing status:** simple status page (statuspage.io or homegrown) showing ingestion health. Add when first customer asks.

---

## 13. Scaling considerations

Approximate inflection points:

- **0–100 orgs:** current architecture as-is. ~$200/month all-in.
- **100–1,000 orgs:** still fine. May need to move from Supabase's hobby tier to Pro. Inngest's free tier becomes paid around 100 orgs.
- **1,000–10,000 orgs:** consider sharding ingestion by org_id hash across multiple Inngest function instances. Postgres still single-instance.
- **10,000+ orgs:** rethink. Probably a read replica, separate analytics DB (DuckDB or ClickHouse for rollups), and per-region deployment for latency.

We are nowhere near these inflection points. **Don't pre-optimize.** The architecture in this document is sufficient for the first three years of plausible growth.

---

## 14. What's deliberately not here

- **Search.** No global search across usage events. If we add it, Postgres full-text first, not Elasticsearch.
- **Analytics SDK / events.** PostHog if we add product analytics. Not in v1.
- **Public API.** No customer-facing API. Add only if customers ask and are willing to pay for Pro.
- **Mobile.** Slack *is* the mobile experience.
- **Real-time updates.** Daily/weekly digest is the rhythm. No WebSockets, no live dashboard. Add only on real demand.
- **Multi-region.** US-only in v1.

---

## 15. Open questions to resolve in build

These are unresolved at write-time. Decide explicitly when each comes up, then update this doc.

1. **Per-developer Slack DMs vs channel-only digests?** Some managers want public visibility; others want per-dev DMs. Likely an org setting, but design needed.
2. **Anomaly threshold defaults — `mean + 3·stddev` or `mean + 2·stddev`?** Calibrate against first 10 customers' data.
3. **Backfill window on key add — 30 days or 90?** 30 is faster and cheaper on provider API quotas; 90 gives better immediate anomaly baselines.
4. **Handling of cached tokens in cost attribution.** Anthropic's prompt caching shows up as a different line item; do we attribute the savings to the developer who created the cache, or the one who hit it?
5. **GitHub Copilot data granularity.** Their billing API is org-level, not per-developer. Either we punt on Copilot in v1 or we present it as an org-wide line item separate from per-developer breakdown.
