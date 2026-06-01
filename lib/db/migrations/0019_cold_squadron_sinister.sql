CREATE TYPE "public"."discrepancy_type" AS ENUM('untracked_keys', 'credits', 'missing_credit', 'tax', 'fx', 'price_change', 'rounding', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."reconciliation_status" AS ENUM('open', 'explained', 'accepted', 'disputed', 'stale');--> statement-breakpoint
CREATE TABLE "reconciliation_discrepancies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"reconciliation_id" uuid NOT NULL,
	"type" "discrepancy_type" NOT NULL,
	"amount" bigint NOT NULL,
	"detail" jsonb,
	"suggested_action" text
);
--> statement-breakpoint
CREATE TABLE "reconciliations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"billed_total" bigint NOT NULL,
	"observed_total" bigint NOT NULL,
	"delta" bigint NOT NULL,
	"status" "reconciliation_status" DEFAULT 'open' NOT NULL,
	"observed_through" timestamp with time zone,
	"rate_ref_as_of" date,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reconciliation_discrepancies" ADD CONSTRAINT "reconciliation_discrepancies_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_discrepancies" ADD CONSTRAINT "reconciliation_discrepancies_reconciliation_id_reconciliations_id_fk" FOREIGN KEY ("reconciliation_id") REFERENCES "public"."reconciliations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliations" ADD CONSTRAINT "reconciliations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliations" ADD CONSTRAINT "reconciliations_invoice_id_provider_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."provider_invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_recon_discrepancies_recon" ON "reconciliation_discrepancies" USING btree ("org_id","reconciliation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_reconciliations_invoice" ON "reconciliations" USING btree ("org_id","invoice_id");--> statement-breakpoint
-- RLS for the new tables (Drizzle doesn't manage policies; mirror 0002_enable_rls.sql)
ALTER TABLE "reconciliations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "reconciliations"
  USING (org_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "reconciliation_discrepancies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "reconciliation_discrepancies"
  USING (org_id = current_setting('app.current_org_id', true)::uuid);
