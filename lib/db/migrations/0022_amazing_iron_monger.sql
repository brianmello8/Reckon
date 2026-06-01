CREATE TYPE "public"."accounting_period_status" AS ENUM('open', 'closed', 'locked');--> statement-breakpoint
CREATE TABLE "accounting_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"entity_id" uuid,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"status" "accounting_period_status" DEFAULT 'open' NOT NULL,
	"closed_at" timestamp with time zone,
	"closed_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "entities" ADD COLUMN "reporting_timezone" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "reporting_timezone" text;--> statement-breakpoint
ALTER TABLE "accounting_periods" ADD CONSTRAINT "accounting_periods_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_periods" ADD CONSTRAINT "accounting_periods_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_periods" ADD CONSTRAINT "accounting_periods_closed_by_user_id_users_id_fk" FOREIGN KEY ("closed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_accounting_periods_org" ON "accounting_periods" USING btree ("org_id","period_start");--> statement-breakpoint
-- RLS for the new table (Drizzle doesn't manage policies; mirror 0002_enable_rls.sql)
ALTER TABLE "accounting_periods" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "accounting_periods"
  USING (org_id = current_setting('app.current_org_id', true)::uuid);
