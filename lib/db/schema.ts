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
export const providerKeyStatusEnum = pgEnum("provider_key_status", [
  "active",
  "errored",
  "revoked",
]);
export const anomalyKindEnum = pgEnum("anomaly_kind", [
  "spike",
  "sudden_increase",
  "sustained_increase",
]);
export const anomalySeverityEnum = pgEnum("anomaly_severity", [
  "info",
  "warn",
  "critical",
]);
export const digestKindEnum = pgEnum("digest_kind", ["daily", "weekly"]);

// --- Tables ---

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  clerkOrgId: text("clerk_org_id").unique(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  plan: planEnum("plan").notNull().default("free"),
  digestTimeLocal: text("digest_time_local").notNull().default("09:00"),
  digestTimezone: text("digest_timezone")
    .notNull()
    .default("America/Los_Angeles"),
  digestSlackChannelId: text("digest_slack_channel_id"),
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
  developerId: uuid("developer_id")
    .notNull()
    .references(() => developers.id),
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
    developerId: uuid("developer_id")
      .notNull()
      .references(() => developers.id),
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

export const anomalies = pgTable(
  "anomalies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    developerId: uuid("developer_id")
      .notNull()
      .references(() => developers.id),
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
}));

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

export const anomaliesRelations = relations(anomalies, ({ one }) => ({
  organization: one(organizations, {
    fields: [anomalies.orgId],
    references: [organizations.id],
  }),
  developer: one(developers, {
    fields: [anomalies.developerId],
    references: [developers.id],
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
