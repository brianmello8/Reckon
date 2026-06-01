CREATE TYPE "public"."commitment_status" AS ENUM('active', 'expired', 'exhausted');--> statement-breakpoint
CREATE TYPE "public"."commitment_type" AS ENUM('committed_use', 'prepaid_credit', 'enterprise_agreement');--> statement-breakpoint
CREATE TABLE "commitments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"type" "commitment_type" NOT NULL,
	"amount" bigint NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"effective_rate" bigint,
	"notes" text,
	"status" "commitment_status" DEFAULT 'active' NOT NULL,
	"last_alert_kind" text,
	"last_alerted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_commitments_org" ON "commitments" USING btree ("org_id");--> statement-breakpoint
-- RLS for the new table (Drizzle doesn't manage policies; mirror 0002_enable_rls.sql)
ALTER TABLE "commitments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "commitments"
  USING (org_id = current_setting('app.current_org_id', true)::uuid);
