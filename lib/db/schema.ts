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
