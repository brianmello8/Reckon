CREATE TYPE "public"."anomaly_kind" AS ENUM('spike', 'sudden_increase', 'sustained_increase');--> statement-breakpoint
CREATE TYPE "public"."anomaly_severity" AS ENUM('info', 'warn', 'critical');--> statement-breakpoint
CREATE TYPE "public"."digest_kind" AS ENUM('daily', 'weekly');--> statement-breakpoint
CREATE TYPE "public"."plan" AS ENUM('free', 'pro');--> statement-breakpoint
CREATE TYPE "public"."provider_key_status" AS ENUM('active', 'errored', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'member');--> statement-breakpoint
CREATE TABLE "anomalies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"developer_id" uuid NOT NULL,
	"kind" "anomaly_kind" NOT NULL,
	"severity" "anomaly_severity" NOT NULL,
	"details" jsonb,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"acknowledged_at" timestamp with time zone,
	"acknowledged_by_user_id" uuid
);
--> statement-breakpoint
CREATE TABLE "developers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"email" text NOT NULL,
	"slack_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "digest_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"kind" "digest_kind" NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"slack_ts" text,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "linear_installations" (
	"org_id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"encrypted_bot_token" "bytea" NOT NULL,
	"encrypted_dek" "bytea" NOT NULL,
	"iv" "bytea" NOT NULL,
	"auth_tag" "bytea" NOT NULL,
	"scopes" text[] NOT NULL,
	"installed_by_user_id" uuid,
	"installed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"uninstalled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"plan" "plan" DEFAULT 'free' NOT NULL,
	"digest_time_local" text DEFAULT '09:00' NOT NULL,
	"digest_timezone" text DEFAULT 'America/Los_Angeles' NOT NULL,
	"digest_slack_channel_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "provider_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"developer_id" uuid NOT NULL,
	"provider_id" uuid NOT NULL,
	"encrypted_key" "bytea" NOT NULL,
	"encrypted_dek" "bytea" NOT NULL,
	"iv" "bytea" NOT NULL,
	"auth_tag" "bytea" NOT NULL,
	"key_fingerprint" text NOT NULL,
	"status" "provider_key_status" DEFAULT 'active' NOT NULL,
	"last_polled_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "providers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"display_name" text NOT NULL,
	CONSTRAINT "providers_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "slack_installations" (
	"org_id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"encrypted_bot_token" "bytea" NOT NULL,
	"encrypted_dek" "bytea" NOT NULL,
	"iv" "bytea" NOT NULL,
	"auth_tag" "bytea" NOT NULL,
	"scopes" text[] NOT NULL,
	"installed_by_user_id" uuid,
	"installed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"uninstalled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "usage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"provider_key_id" uuid NOT NULL,
	"provider_id" uuid NOT NULL,
	"developer_id" uuid NOT NULL,
	"time_bucket" date NOT NULL,
	"model" text NOT NULL,
	"input_tokens" bigint DEFAULT 0 NOT NULL,
	"output_tokens" bigint DEFAULT 0 NOT NULL,
	"cached_input_tokens" bigint DEFAULT 0 NOT NULL,
	"cost_usd_micros" bigint DEFAULT 0 NOT NULL,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"clerk_user_id" text,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" "user_role" DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_clerk_user_id_unique" UNIQUE("clerk_user_id")
);
--> statement-breakpoint
ALTER TABLE "anomalies" ADD CONSTRAINT "anomalies_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anomalies" ADD CONSTRAINT "anomalies_developer_id_developers_id_fk" FOREIGN KEY ("developer_id") REFERENCES "public"."developers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anomalies" ADD CONSTRAINT "anomalies_acknowledged_by_user_id_users_id_fk" FOREIGN KEY ("acknowledged_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developers" ADD CONSTRAINT "developers_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digest_logs" ADD CONSTRAINT "digest_logs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_installations" ADD CONSTRAINT "linear_installations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_installations" ADD CONSTRAINT "linear_installations_installed_by_user_id_users_id_fk" FOREIGN KEY ("installed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_keys" ADD CONSTRAINT "provider_keys_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_keys" ADD CONSTRAINT "provider_keys_developer_id_developers_id_fk" FOREIGN KEY ("developer_id") REFERENCES "public"."developers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_keys" ADD CONSTRAINT "provider_keys_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slack_installations" ADD CONSTRAINT "slack_installations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slack_installations" ADD CONSTRAINT "slack_installations_installed_by_user_id_users_id_fk" FOREIGN KEY ("installed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_provider_key_id_provider_keys_id_fk" FOREIGN KEY ("provider_key_id") REFERENCES "public"."provider_keys"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_developer_id_developers_id_fk" FOREIGN KEY ("developer_id") REFERENCES "public"."developers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_anomalies_org_unack" ON "anomalies" USING btree ("org_id","detected_at") WHERE acknowledged_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_developers_org_email" ON "developers" USING btree ("org_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_usage_events_natural_key" ON "usage_events" USING btree ("provider_key_id","time_bucket","model");--> statement-breakpoint
CREATE INDEX "idx_usage_events_org_bucket" ON "usage_events" USING btree ("org_id","time_bucket");--> statement-breakpoint
CREATE INDEX "idx_usage_events_org_dev_bucket" ON "usage_events" USING btree ("org_id","developer_id","time_bucket");--> statement-breakpoint
CREATE INDEX "idx_usage_events_dev_bucket" ON "usage_events" USING btree ("developer_id","time_bucket");