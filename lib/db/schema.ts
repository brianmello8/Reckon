import {
  pgTable,
  uuid,
  text,
  timestamp,
  pgEnum,
  uniqueIndex,
  index,
  bigint,
  date,
  jsonb,
  customType,
  integer,
  boolean,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

// --- Custom types ---

const bytea = customType<{ data: Buffer }>({
  dataType() {
    return "bytea";
  },
});

// --- Enums ---

export const planEnum = pgEnum("plan", ["free", "pro"]);
export const userRoleEnum = pgEnum("user_role", ["admin", "member"]);
// App-level surfaces a member can access (Phase 8.5). Stored on the membership
// (users) row — NOT dependent on Clerk paid custom roles.
export const surfaceEnum = pgEnum("surface", [
  "operations",
  "workflows",
  "finance",
]);
export const providerKeyStatusEnum = pgEnum("provider_key_status", [
  "active",
  "errored",
  "revoked",
]);
export const anomalyKindEnum = pgEnum("anomaly_kind", [
  "spike",
  "sudden_increase",
  "sustained_increase",
  // Workflow-level (Phase 8.6): cost-per-run deviated from baseline.
  "workflow_cost_per_run",
]);
export const anomalySeverityEnum = pgEnum("anomaly_severity", [
  "info",
  "warn",
  "critical",
]);
export const digestKindEnum = pgEnum("digest_kind", ["daily", "weekly"]);

// --- Attribution (Phase 8 / §3a) enums ---

export const agentStatusEnum = pgEnum("agent_status", ["active", "archived"]);
export const workflowStatusEnum = pgEnum("workflow_status", [
  "active",
  "archived",
]);
export const workflowRunStatusEnum = pgEnum("workflow_run_status", [
  "running",
  "completed",
  "failed",
  "unknown",
]);
export const attributionSourceTypeEnum = pgEnum("attribution_source_type", [
  "key_mapping",
  "observability",
  "sdk_tag",
]);
export const attributionConfidenceEnum = pgEnum("attribution_confidence", [
  "exact",
  "inferred",
]);
export const observabilityProviderEnum = pgEnum("observability_provider", [
  "langfuse",
  "helicone",
]);
export const observabilityConnectionStatusEnum = pgEnum(
  "observability_connection_status",
  ["active", "error", "disabled"]
);
// Finance dimensions (Phase 9.1)
export const dimensionStatusEnum = pgEnum("dimension_status", [
  "active",
  "archived",
]);
export const glAccountTypeEnum = pgEnum("gl_account_type", [
  "cogs",
  "opex_rnd",
  "opex_ga",
  "opex_sm",
  "other",
]);
export const codingStatusEnum = pgEnum("coding_status", [
  "coded",
  "needs_coding",
  "suspense",
]);
export const allocationDriverMethodEnum = pgEnum("allocation_driver_method", [
  "usage_tokens",
  "headcount",
  "revenue",
  "fixed_pct",
  "even",
]);
export const budgetScopeTypeEnum = pgEnum("budget_scope_type", [
  "cost_center",
  "gl_account",
  "project",
]);
// Invoices & rate snapshots (Phase 10.1)
export const expectedCreditsSourceEnum = pgEnum("expected_credits_source", [
  "none",
  "manual",
  "commitment",
]);
export const invoiceSourceEnum = pgEnum("invoice_source", [
  "manual",
  "billing_api",
  "ocr",
]);
export const invoiceStatusEnum = pgEnum("invoice_status", [
  "draft",
  "confirmed",
]);
export const rateSnapshotSourceEnum = pgEnum("rate_snapshot_source", [
  "mvp_rate_source",
  "provider_published",
  "manual",
]);
// Reconciliation (Phase 10.2)
export const reconciliationStatusEnum = pgEnum("reconciliation_status", [
  "open",
  "explained",
  "accepted",
  "disputed",
  "stale",
]);
export const discrepancyTypeEnum = pgEnum("discrepancy_type", [
  "untracked_keys",
  "credits",
  "missing_credit",
  "tax",
  "fx",
  "price_change",
  "rounding",
  "unknown",
]);

// --- Tables ---

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  clerkOrgId: text("clerk_org_id").unique(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  plan: planEnum("plan").notNull().default("free"),
  paymentStatus: text("payment_status"),
  digestTimeLocal: text("digest_time_local").notNull().default("09:00"),
  digestTimezone: text("digest_timezone")
    .notNull()
    .default("America/Los_Angeles"),
  digestSlackChannelId: text("digest_slack_channel_id"),
  linearTeamId: text("linear_team_id"),
  // Optional GL account that unmapped spend routes to (Phase 9.2). When unset,
  // unmapped spend lands in the needs-coding queue instead of a suspense code.
  suspenseGlAccountId: uuid("suspense_gl_account_id"),
  // Optional cost center that shared-cost split rounding residual lands on
  // (Phase 9.3). When unset, residual is distributed by largest-remainder.
  roundingCostCenterId: uuid("rounding_cost_center_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id),
  clerkUserId: text("clerk_user_id").unique(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  role: userRoleEnum("role").notNull().default("member"),
  // Surfaces this member can access. Admins get all three; members default to
  // [operations]; a finance assignment grants [finance, workflows].
  surfaces: surfaceEnum("surfaces")
    .array()
    .notNull()
    .default(sql`ARRAY['operations']::surface[]`),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const developers = pgTable(
  "developers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    displayName: text("display_name").notNull(),
    email: text("email").notNull(),
    slackUserId: text("slack_user_id"),
    // Optional agent mapping (Phase 8.2): all of this developer's usage is
    // attributed to this agent unless a more specific identity mapping applies.
    agentId: uuid("agent_id").references(() => agents.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("uniq_developers_org_email").on(t.orgId, t.email)]
);

export const providers = pgTable("providers", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  displayName: text("display_name").notNull(),
});

export const providerKeys = pgTable("provider_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id),
  // Nullable: an org-wide admin key is not tied to a single developer.
  // (Legacy per-developer keys may still reference one.)
  developerId: uuid("developer_id").references(() => developers.id),
  providerId: uuid("provider_id")
    .notNull()
    .references(() => providers.id),
  encryptedKey: bytea("encrypted_key").notNull(),
  encryptedDek: bytea("encrypted_dek").notNull(),
  iv: bytea("iv").notNull(),
  authTag: bytea("auth_tag").notNull(),
  keyFingerprint: text("key_fingerprint").notNull(),
  status: providerKeyStatusEnum("status").notNull().default("active"),
  lastPolledAt: timestamp("last_polled_at", { withTimezone: true }),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// A distinct usage-producing identity reported by a provider under an org's
// admin key — Anthropic api_key_id, OpenAI user_id, GitHub Copilot seat login.
// We map each to one of our developers (nullable = not yet assigned).
export const providerIdentities = pgTable(
  "provider_identities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => providers.id),
    externalId: text("external_id").notNull(),
    label: text("label"),
    developerId: uuid("developer_id").references(() => developers.id),
    // Optional agent mapping (Phase 8.2): a dedicated per-agent key/seat/user
    // shows up as its own identity. Takes precedence over the developer mapping.
    agentId: uuid("agent_id").references(() => agents.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("uniq_provider_identities_natural").on(
      t.orgId,
      t.providerId,
      t.externalId
    ),
    index("idx_provider_identities_developer").on(t.developerId),
  ]
);

export const usageEvents = pgTable(
  "usage_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    providerKeyId: uuid("provider_key_id")
      .notNull()
      .references(() => providerKeys.id),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => providers.id),
    // Resolved from provider_identities at ingest; nullable = unassigned.
    developerId: uuid("developer_id").references(() => developers.id),
    // Provider-side identity (api_key_id / user_id / seat login). Empty string
    // for legacy/aggregate rows so the natural key stays reliable (no NULLs).
    externalIdentity: text("external_identity").notNull().default(""),
    timeBucket: date("time_bucket").notNull(),
    model: text("model").notNull(),
    inputTokens: bigint("input_tokens", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    outputTokens: bigint("output_tokens", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    cachedInputTokens: bigint("cached_input_tokens", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    costUsdMicros: bigint("cost_usd_micros", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    raw: jsonb("raw"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("uniq_usage_events_natural_key").on(
      t.providerKeyId,
      t.externalIdentity,
      t.timeBucket,
      t.model
    ),
    index("idx_usage_events_org_bucket").on(t.orgId, t.timeBucket),
    index("idx_usage_events_org_dev_bucket").on(
      t.orgId,
      t.developerId,
      t.timeBucket
    ),
    index("idx_usage_events_dev_bucket").on(t.developerId, t.timeBucket),
  ]
);

// --- Attribution model (Phase 8, architecture §3a) ---
// usage_events stays immutable and idempotent. Attribution is DERIVED and lives
// in these recomputable tables, keyed back to usage_events. We never UPDATE a
// usage row to attach an agent/workflow.

// A named agent whose spend we attribute (e.g. "support bot", "code reviewer").
export const agents = pgTable(
  "agents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    description: text("description"),
    status: agentStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_agents_org").on(t.orgId)]
);

// A logical workflow/run-path. May or may not belong to a named agent.
export const workflows = pgTable(
  "workflows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    // Nullable: a workflow may exist without a parent agent.
    agentId: uuid("agent_id").references(() => agents.id),
    name: text("name").notNull(),
    description: text("description"),
    status: workflowStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_workflows_org_agent").on(t.orgId, t.agentId)]
);

// A single execution of a workflow. external_run_id is the customer's own
// run/trace id (from observability or the SDK), unique per workflow when present.
export const workflowRuns = pgTable(
  "workflow_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    workflowId: uuid("workflow_id")
      .notNull()
      .references(() => workflows.id),
    externalRunId: text("external_run_id"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    status: workflowRunStatusEnum("status").notNull().default("unknown"),
    // The customer's end-customer this run served, for per-customer COGS later.
    customerRef: text("customer_ref"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_workflow_runs_org_wf_started").on(
      t.orgId,
      t.workflowId,
      t.startedAt
    ),
    uniqueIndex("uniq_workflow_runs_external")
      .on(t.orgId, t.workflowId, t.externalRunId)
      .where(sql`external_run_id IS NOT NULL`),
  ]
);

// Records HOW an attribution was derived, for audit + recompute.
export const attributionSources = pgTable(
  "attribution_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    sourceType: attributionSourceTypeEnum("source_type").notNull(),
    label: text("label").notNull(),
    config: jsonb("config"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_attribution_sources_org").on(t.orgId)]
);

// The DERIVED join — recomputable, never the source of truth. One row per
// usage_event; recompute deletes + reinserts the row for an event.
export const usageAttribution = pgTable(
  "usage_attribution",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    usageEventId: uuid("usage_event_id")
      .notNull()
      .references(() => usageEvents.id),
    agentId: uuid("agent_id").references(() => agents.id),
    workflowId: uuid("workflow_id").references(() => workflows.id),
    workflowRunId: uuid("workflow_run_id").references(() => workflowRuns.id),
    customerRef: text("customer_ref"),
    attributionSourceId: uuid("attribution_source_id")
      .notNull()
      .references(() => attributionSources.id),
    // exact = key/tag mapping; inferred = timestamp/fingerprint join.
    confidence: attributionConfidenceEnum("confidence").notNull(),
    computedAt: timestamp("computed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("uniq_usage_attribution_event").on(t.orgId, t.usageEventId),
    index("idx_usage_attribution_agent").on(t.orgId, t.agentId),
    index("idx_usage_attribution_workflow").on(t.orgId, t.workflowId),
  ]
);

// A connection to a customer's LLM-observability tool (Langfuse/Helicone).
// We read run/trace METADATA ONLY (ids, timing, model, token counts) — never
// prompt/response content. Credentials use the same KMS envelope as
// provider_keys (architecture §3b).
export const observabilityConnections = pgTable(
  "observability_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    provider: observabilityProviderEnum("provider").notNull(),
    baseUrl: text("base_url").notNull(),
    encryptedCredentials: bytea("encrypted_credentials").notNull(),
    encryptedDek: bytea("encrypted_dek").notNull(),
    iv: bytea("iv").notNull(),
    authTag: bytea("auth_tag").notNull(),
    status: observabilityConnectionStatusEnum("status")
      .notNull()
      .default("active"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_observability_connections_org").on(t.orgId)]
);

// --- Finance dimensions (Phase 9.1, architecture §3d) ---
// Master data only — every dollar of spend rolls up to these. Allocation
// (mapping usage to dimensions) is a separate derived table (Prompt 9.2).
// All org-scoped with the standard RLS policy; codes are unique per org.

export const costCenters = pgTable(
  "cost_centers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    // Self-FK for hierarchy/rollups (developer → team → cost center → dept).
    parentId: uuid("parent_id").references((): AnyPgColumn => costCenters.id),
    ownerRef: text("owner_ref"),
    status: dimensionStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("uniq_cost_centers_org_code").on(t.orgId, t.code),
    index("idx_cost_centers_parent").on(t.parentId),
  ]
);

export const glAccounts = pgTable(
  "gl_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    accountType: glAccountTypeEnum("account_type").notNull(),
    status: dimensionStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("uniq_gl_accounts_org_code").on(t.orgId, t.code)]
);

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    status: dimensionStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("uniq_projects_org_code").on(t.orgId, t.code)]
);

export const entities = pgTable(
  "entities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    // ISO 4217 functional currency (e.g. USD, EUR).
    functionalCurrency: text("functional_currency").notNull().default("USD"),
    status: dimensionStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("uniq_entities_org_code").on(t.orgId, t.code)]
);

export const productLines = pgTable(
  "product_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    status: dimensionStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("uniq_product_lines_org_code").on(t.orgId, t.code)]
);

// Driver for splitting shared spend across cost centers (Phase 9.3, §3f).
export const allocationDrivers = pgTable(
  "allocation_drivers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    method: allocationDriverMethodEnum("method").notNull(),
    // config (jsonb): method-specific. usage_tokens/even → { cost_center_ids:[] };
    // fixed_pct → { weights: { ccId: bps } }; headcount/revenue → { values: { ccId: n } }
    // (customer-supplied external numbers — never fabricated).
    config: jsonb("config").notNull().default({}),
    status: dimensionStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_allocation_drivers_org").on(t.orgId)]
);

// Budget per dimension scope + period (Phase 9.4, §3g). Kept separate from
// actuals (cost_allocations); budget-vs-actual is computed at read time.
export const budgets = pgTable(
  "budgets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    scopeType: budgetScopeTypeEnum("scope_type").notNull(),
    scopeId: uuid("scope_id").notNull(),
    // "YYYY-MM" for a month or "YYYY" for a year.
    period: text("period").notNull(),
    amountMicros: bigint("amount_micros", { mode: "bigint" }).notNull(),
    currency: text("currency").notNull().default("USD"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("uniq_budgets_scope_period").on(
      t.orgId,
      t.scopeType,
      t.scopeId,
      t.period
    ),
  ]
);

// --- Invoices & rate snapshots (Phase 10.1, architecture §5) ---

export const providerInvoices = pgTable(
  "provider_invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    provider: text("provider").notNull(),
    invoiceNumber: text("invoice_number").notNull(),
    billingPeriodStart: date("billing_period_start").notNull(),
    billingPeriodEnd: date("billing_period_end").notNull(),
    currency: text("currency").notNull().default("USD"),
    subtotal: bigint("subtotal", { mode: "bigint" }).notNull().default(sql`0`),
    creditsApplied: bigint("credits_applied", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    // What we were PROMISED this period. NULL = unknown (10.2 skips the
    // missing-credit check); 0 = nothing promised. Never coerce null to 0.
    expectedCredits: bigint("expected_credits", { mode: "bigint" }),
    expectedCreditsSource: expectedCreditsSourceEnum("expected_credits_source")
      .notNull()
      .default("none"),
    tax: bigint("tax", { mode: "bigint" }).notNull().default(sql`0`),
    total: bigint("total", { mode: "bigint" }).notNull().default(sql`0`),
    dueDate: date("due_date"),
    paymentTerms: text("payment_terms"),
    source: invoiceSourceEnum("source").notNull(),
    status: invoiceStatusEnum("status").notNull().default("draft"),
    // True when ≥1 line item carries model + quantity + amount (a per-model
    // effective rate is derivable). A lump-sum invoice is false → 10.2 marks
    // price_change uncomputable rather than guessing.
    rateCheckable: boolean("rate_checkable").notNull().default(false),
    // Reference to the stored original PDF (the file, not its parsed text).
    pdfFileRef: text("pdf_file_ref"),
    raw: jsonb("raw"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("uniq_provider_invoices_number").on(
      t.orgId,
      t.provider,
      t.invoiceNumber
    ),
    index("idx_provider_invoices_period").on(
      t.orgId,
      t.provider,
      t.billingPeriodStart
    ),
  ]
);

export const invoiceLineItems = pgTable(
  "invoice_line_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => providerInvoices.id),
    description: text("description").notNull(),
    model: text("model"),
    quantity: bigint("quantity", { mode: "bigint" }),
    unit: text("unit"),
    amount: bigint("amount", { mode: "bigint" }).notNull().default(sql`0`),
  },
  (t) => [index("idx_invoice_line_items_invoice").on(t.orgId, t.invoiceId)]
);

// APPEND-ONLY, immutable point-in-time rates (same discipline as usage_events).
// `rate` is micros per 1,000,000 units (so sub-micro per-token prices stay
// integers). A change is a NEW row; historical rows are never edited.
export const providerRateSnapshots = pgTable(
  "provider_rate_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    unit: text("unit").notNull(),
    rate: bigint("rate", { mode: "bigint" }).notNull(),
    currency: text("currency").notNull().default("USD"),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    capturedAt: timestamp("captured_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    source: rateSnapshotSourceEnum("source").notNull(),
    raw: jsonb("raw"),
  },
  (t) => [
    index("idx_rate_snapshots_lookup").on(
      t.orgId,
      t.provider,
      t.model,
      t.unit,
      t.effectiveFrom
    ),
  ]
);

// Next-invoice forecast snapshots (Phase 10.3, architecture §5c). One per
// (provider, period, day) so we keep the projection trajectory for accuracy
// tracking. All money in USD micros; band is low/high + a percent.
export const forecastSnapshots = pgTable(
  "forecast_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    provider: text("provider").notNull(),
    period: text("period").notNull(), // YYYY-MM
    snapshotDate: date("snapshot_date").notNull(),
    mtdObserved: bigint("mtd_observed", { mode: "bigint" }).notNull(),
    throughDay: integer("through_day").notNull(),
    daysInMonth: integer("days_in_month").notNull(),
    runRateDaily: bigint("run_rate_daily", { mode: "bigint" }).notNull(),
    projectedTotal: bigint("projected_total", { mode: "bigint" }).notNull(),
    low: bigint("low", { mode: "bigint" }).notNull(),
    high: bigint("high", { mode: "bigint" }).notNull(),
    bandPct: integer("band_pct").notNull(), // ±% confidence band, whole percent
    method: jsonb("method"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("uniq_forecast_snapshots_day").on(
      t.orgId,
      t.provider,
      t.period,
      t.snapshotDate
    ),
  ]
);

// Invoice ↔ usage reconciliation (Phase 10.2, architecture §5a).
export const reconciliations = pgTable(
  "reconciliations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => providerInvoices.id),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    billedTotal: bigint("billed_total", { mode: "bigint" }).notNull(),
    observedTotal: bigint("observed_total", { mode: "bigint" }).notNull(),
    delta: bigint("delta", { mode: "bigint" }).notNull(),
    status: reconciliationStatusEnum("status").notNull().default("open"),
    // Watermark: latest usage ingestion time included in observed_total.
    observedThrough: timestamp("observed_through", { withTimezone: true }),
    // As-of date of the rate reference used for price_change (null if none).
    rateRefAsOf: date("rate_ref_as_of"),
    computedAt: timestamp("computed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("uniq_reconciliations_invoice").on(t.orgId, t.invoiceId)]
);

export const reconciliationDiscrepancies = pgTable(
  "reconciliation_discrepancies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    reconciliationId: uuid("reconciliation_id")
      .notNull()
      .references(() => reconciliations.id),
    type: discrepancyTypeEnum("type").notNull(),
    amount: bigint("amount", { mode: "bigint" }).notNull(),
    detail: jsonb("detail"),
    suggestedAction: text("suggested_action"),
  },
  (t) => [
    index("idx_recon_discrepancies_recon").on(t.orgId, t.reconciliationId),
  ]
);

// --- Account determination & allocations (Phase 9.2, architecture §3e) ---

// Ordered, overridable mapping from usage to finance dimensions. Lower priority
// wins; first match assigns, later rules fill only still-unset fields.
export const attributionRules = pgTable(
  "attribution_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    priority: integer("priority").notNull().default(100),
    name: text("name").notNull(),
    // match: { provider?, model?, environment?, agentId?, workflowId?,
    //          costCenterHint?, project? } — all specified keys must match.
    match: jsonb("match").notNull().default({}),
    // assign: any subset of gl_account_id, cost_center_id, entity_id,
    //         project_id, product_line_id.
    assign: jsonb("assign").notNull().default({}),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_attribution_rules_org_priority").on(t.orgId, t.priority)]
);

// DERIVED, recomputable coding output — one row per usage_event. Never the
// source of truth; rebuilt from usage_events + rules + overrides.
export const costAllocations = pgTable(
  "cost_allocations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    usageEventId: uuid("usage_event_id")
      .notNull()
      .references(() => usageEvents.id),
    glAccountId: uuid("gl_account_id").references(() => glAccounts.id),
    costCenterId: uuid("cost_center_id").references(() => costCenters.id),
    entityId: uuid("entity_id").references(() => entities.id),
    projectId: uuid("project_id").references(() => projects.id),
    productLineId: uuid("product_line_id").references(() => productLines.id),
    codingStatus: codingStatusEnum("coding_status").notNull(),
    // Share of the event's cost in basis points (10000 = 100%). Direct rows are
    // 10000; a shared-cost event has multiple rows whose pct sum to exactly 10000.
    allocationPct: integer("allocation_pct").notNull().default(10000),
    ruleId: uuid("rule_id").references(() => attributionRules.id),
    overridden: boolean("overridden").notNull().default(false),
    computedAt: timestamp("computed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // A direct/uncoded event has one row; a shared-cost event has several (one
    // per target cost center). Row-set correctness is enforced by construction —
    // every writer deletes the event's rows before inserting (delete-then-insert)
    // and recompute is delete-all-then-rebuild — so no DB unique is needed here.
    index("idx_cost_allocations_event").on(t.orgId, t.usageEventId),
    index("idx_cost_allocations_status").on(t.orgId, t.codingStatus),
  ]
);

// Durable manual codings (the "overrides" input). Kept separate from
// cost_allocations so a full rebuild re-applies them and they survive recompute.
export const costAllocationOverrides = pgTable(
  "cost_allocation_overrides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    usageEventId: uuid("usage_event_id")
      .notNull()
      .references(() => usageEvents.id),
    glAccountId: uuid("gl_account_id").references(() => glAccounts.id),
    costCenterId: uuid("cost_center_id").references(() => costCenters.id),
    entityId: uuid("entity_id").references(() => entities.id),
    projectId: uuid("project_id").references(() => projects.id),
    productLineId: uuid("product_line_id").references(() => productLines.id),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("uniq_cost_allocation_overrides_event").on(
      t.orgId,
      t.usageEventId
    ),
  ]
);

export const anomalies = pgTable(
  "anomalies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    // Nullable: a per-developer anomaly sets developer_id; a workflow-level
    // anomaly (Phase 8.6) sets workflow_id instead. Exactly one is set.
    developerId: uuid("developer_id").references(() => developers.id),
    workflowId: uuid("workflow_id").references(() => workflows.id),
    kind: anomalyKindEnum("kind").notNull(),
    severity: anomalySeverityEnum("severity").notNull(),
    details: jsonb("details"),
    detectedAt: timestamp("detected_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    acknowledgedByUserId: uuid("acknowledged_by_user_id").references(
      () => users.id
    ),
    slackMessageTs: text("slack_message_ts"),
    linearIssueId: text("linear_issue_id"),
  },
  (t) => [
    index("idx_anomalies_org_unack")
      .on(t.orgId, t.detectedAt)
      .where(sql`acknowledged_at IS NULL`),
  ]
);

export const slackInstallations = pgTable("slack_installations", {
  orgId: uuid("org_id")
    .primaryKey()
    .references(() => organizations.id),
  workspaceId: text("workspace_id").notNull(),
  encryptedBotToken: bytea("encrypted_bot_token").notNull(),
  encryptedDek: bytea("encrypted_dek").notNull(),
  iv: bytea("iv").notNull(),
  authTag: bytea("auth_tag").notNull(),
  scopes: text("scopes").array().notNull(),
  installedByUserId: uuid("installed_by_user_id").references(() => users.id),
  installedAt: timestamp("installed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  uninstalledAt: timestamp("uninstalled_at", { withTimezone: true }),
});

export const linearInstallations = pgTable("linear_installations", {
  orgId: uuid("org_id")
    .primaryKey()
    .references(() => organizations.id),
  workspaceId: text("workspace_id").notNull(),
  encryptedBotToken: bytea("encrypted_bot_token").notNull(),
  encryptedDek: bytea("encrypted_dek").notNull(),
  iv: bytea("iv").notNull(),
  authTag: bytea("auth_tag").notNull(),
  scopes: text("scopes").array().notNull(),
  installedByUserId: uuid("installed_by_user_id").references(() => users.id),
  installedAt: timestamp("installed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  uninstalledAt: timestamp("uninstalled_at", { withTimezone: true }),
});

export const digestLogs = pgTable("digest_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id),
  kind: digestKindEnum("kind").notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  slackTs: text("slack_ts"),
  error: text("error"),
});

export const developerInvites = pgTable("developer_invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id),
  developerId: uuid("developer_id")
    .notNull()
    .references(() => developers.id),
  email: text("email").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
});

// --- Relations ---

export const organizationsRelations = relations(organizations, ({ many }) => ({
  users: many(users),
  developers: many(developers),
  providerKeys: many(providerKeys),
  usageEvents: many(usageEvents),
  anomalies: many(anomalies),
  digestLogs: many(digestLogs),
}));

export const usersRelations = relations(users, ({ one }) => ({
  organization: one(organizations, {
    fields: [users.orgId],
    references: [organizations.id],
  }),
}));

export const developersRelations = relations(developers, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [developers.orgId],
    references: [organizations.id],
  }),
  providerKeys: many(providerKeys),
  usageEvents: many(usageEvents),
  anomalies: many(anomalies),
  agent: one(agents, {
    fields: [developers.agentId],
    references: [agents.id],
  }),
}));

export const providerIdentitiesRelations = relations(
  providerIdentities,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [providerIdentities.orgId],
      references: [organizations.id],
    }),
    provider: one(providers, {
      fields: [providerIdentities.providerId],
      references: [providers.id],
    }),
    developer: one(developers, {
      fields: [providerIdentities.developerId],
      references: [developers.id],
    }),
    agent: one(agents, {
      fields: [providerIdentities.agentId],
      references: [agents.id],
    }),
  })
);

export const providersRelations = relations(providers, ({ many }) => ({
  providerKeys: many(providerKeys),
  usageEvents: many(usageEvents),
}));

export const providerKeysRelations = relations(providerKeys, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [providerKeys.orgId],
    references: [organizations.id],
  }),
  developer: one(developers, {
    fields: [providerKeys.developerId],
    references: [developers.id],
  }),
  provider: one(providers, {
    fields: [providerKeys.providerId],
    references: [providers.id],
  }),
  usageEvents: many(usageEvents),
}));

export const usageEventsRelations = relations(usageEvents, ({ one }) => ({
  organization: one(organizations, {
    fields: [usageEvents.orgId],
    references: [organizations.id],
  }),
  providerKey: one(providerKeys, {
    fields: [usageEvents.providerKeyId],
    references: [providerKeys.id],
  }),
  provider: one(providers, {
    fields: [usageEvents.providerId],
    references: [providers.id],
  }),
  developer: one(developers, {
    fields: [usageEvents.developerId],
    references: [developers.id],
  }),
}));

export const agentsRelations = relations(agents, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [agents.orgId],
    references: [organizations.id],
  }),
  workflows: many(workflows),
}));

export const workflowsRelations = relations(workflows, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [workflows.orgId],
    references: [organizations.id],
  }),
  agent: one(agents, {
    fields: [workflows.agentId],
    references: [agents.id],
  }),
  runs: many(workflowRuns),
}));

export const workflowRunsRelations = relations(workflowRuns, ({ one }) => ({
  organization: one(organizations, {
    fields: [workflowRuns.orgId],
    references: [organizations.id],
  }),
  workflow: one(workflows, {
    fields: [workflowRuns.workflowId],
    references: [workflows.id],
  }),
}));

export const attributionSourcesRelations = relations(
  attributionSources,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [attributionSources.orgId],
      references: [organizations.id],
    }),
  })
);

export const usageAttributionRelations = relations(
  usageAttribution,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [usageAttribution.orgId],
      references: [organizations.id],
    }),
    usageEvent: one(usageEvents, {
      fields: [usageAttribution.usageEventId],
      references: [usageEvents.id],
    }),
    agent: one(agents, {
      fields: [usageAttribution.agentId],
      references: [agents.id],
    }),
    workflow: one(workflows, {
      fields: [usageAttribution.workflowId],
      references: [workflows.id],
    }),
    workflowRun: one(workflowRuns, {
      fields: [usageAttribution.workflowRunId],
      references: [workflowRuns.id],
    }),
    attributionSource: one(attributionSources, {
      fields: [usageAttribution.attributionSourceId],
      references: [attributionSources.id],
    }),
  })
);

export const observabilityConnectionsRelations = relations(
  observabilityConnections,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [observabilityConnections.orgId],
      references: [organizations.id],
    }),
  })
);

export const costCentersRelations = relations(
  costCenters,
  ({ one, many }) => ({
    organization: one(organizations, {
      fields: [costCenters.orgId],
      references: [organizations.id],
    }),
    parent: one(costCenters, {
      fields: [costCenters.parentId],
      references: [costCenters.id],
      relationName: "cost_center_parent",
    }),
    children: many(costCenters, { relationName: "cost_center_parent" }),
  })
);

export const costAllocationsRelations = relations(
  costAllocations,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [costAllocations.orgId],
      references: [organizations.id],
    }),
    usageEvent: one(usageEvents, {
      fields: [costAllocations.usageEventId],
      references: [usageEvents.id],
    }),
    rule: one(attributionRules, {
      fields: [costAllocations.ruleId],
      references: [attributionRules.id],
    }),
  })
);

export const anomaliesRelations = relations(anomalies, ({ one }) => ({
  organization: one(organizations, {
    fields: [anomalies.orgId],
    references: [organizations.id],
  }),
  developer: one(developers, {
    fields: [anomalies.developerId],
    references: [developers.id],
  }),
  workflow: one(workflows, {
    fields: [anomalies.workflowId],
    references: [workflows.id],
  }),
  acknowledgedBy: one(users, {
    fields: [anomalies.acknowledgedByUserId],
    references: [users.id],
  }),
}));

export const digestLogsRelations = relations(digestLogs, ({ one }) => ({
  organization: one(organizations, {
    fields: [digestLogs.orgId],
    references: [organizations.id],
  }),
}));
