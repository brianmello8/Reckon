CREATE TYPE "public"."ingest_token_status" AS ENUM('active', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."outcome_direction" AS ENUM('higher_is_better', 'lower_is_better');--> statement-breakpoint
CREATE TYPE "public"."outcome_grain" AS ENUM('customer', 'product_line', 'workflow', 'org');--> statement-breakpoint
CREATE TYPE "public"."outcome_source" AS ENUM('manual', 'csv', 'api');--> statement-breakpoint
CREATE TABLE "ingest_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"token_prefix" text NOT NULL,
	"scope" text DEFAULT 'outcomes' NOT NULL,
	"status" "ingest_token_status" DEFAULT 'active' NOT NULL,
	"created_by_user_id" uuid,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outcome_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"unit" text NOT NULL,
	"grain" "outcome_grain" NOT NULL,
	"direction" "outcome_direction" DEFAULT 'higher_is_better' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outcome_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"metric_id" uuid NOT NULL,
	"grain_ref" text DEFAULT '' NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"value" bigint NOT NULL,
	"source" "outcome_source" DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ingest_tokens" ADD CONSTRAINT "ingest_tokens_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingest_tokens" ADD CONSTRAINT "ingest_tokens_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outcome_metrics" ADD CONSTRAINT "outcome_metrics_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outcome_values" ADD CONSTRAINT "outcome_values_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outcome_values" ADD CONSTRAINT "outcome_values_metric_id_outcome_metrics_id_fk" FOREIGN KEY ("metric_id") REFERENCES "public"."outcome_metrics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_ingest_tokens_hash" ON "ingest_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_outcome_metrics_org_key" ON "outcome_metrics" USING btree ("org_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_outcome_values_metric_ref_period" ON "outcome_values" USING btree ("metric_id","grain_ref","period_start","period_end");--> statement-breakpoint
CREATE INDEX "idx_outcome_values_org_metric" ON "outcome_values" USING btree ("org_id","metric_id");--> statement-breakpoint
-- RLS for the new tables (Drizzle doesn't manage policies; mirror 0002_enable_rls.sql).
ALTER TABLE "outcome_metrics" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "outcome_metrics"
  USING (org_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "outcome_values" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "outcome_values"
  USING (org_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "ingest_tokens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "ingest_tokens"
  USING (org_id = current_setting('app.current_org_id', true)::uuid);