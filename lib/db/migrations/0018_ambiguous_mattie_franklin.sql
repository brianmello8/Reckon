CREATE TYPE "public"."expected_credits_source" AS ENUM('none', 'manual', 'commitment');--> statement-breakpoint
CREATE TYPE "public"."invoice_source" AS ENUM('manual', 'billing_api', 'ocr');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'confirmed');--> statement-breakpoint
CREATE TYPE "public"."rate_snapshot_source" AS ENUM('mvp_rate_source', 'provider_published', 'manual');--> statement-breakpoint
CREATE TABLE "invoice_line_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"description" text NOT NULL,
	"model" text,
	"quantity" bigint,
	"unit" text,
	"amount" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"invoice_number" text NOT NULL,
	"billing_period_start" date NOT NULL,
	"billing_period_end" date NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"subtotal" bigint DEFAULT 0 NOT NULL,
	"credits_applied" bigint DEFAULT 0 NOT NULL,
	"expected_credits" bigint,
	"expected_credits_source" "expected_credits_source" DEFAULT 'none' NOT NULL,
	"tax" bigint DEFAULT 0 NOT NULL,
	"total" bigint DEFAULT 0 NOT NULL,
	"due_date" date,
	"payment_terms" text,
	"source" "invoice_source" NOT NULL,
	"status" "invoice_status" DEFAULT 'draft' NOT NULL,
	"rate_checkable" boolean DEFAULT false NOT NULL,
	"pdf_file_ref" text,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_rate_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"unit" text NOT NULL,
	"rate" bigint NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" "rate_snapshot_source" NOT NULL,
	"raw" jsonb
);
--> statement-breakpoint
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_invoice_id_provider_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."provider_invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_invoices" ADD CONSTRAINT "provider_invoices_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_rate_snapshots" ADD CONSTRAINT "provider_rate_snapshots_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_invoice_line_items_invoice" ON "invoice_line_items" USING btree ("org_id","invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_provider_invoices_number" ON "provider_invoices" USING btree ("org_id","provider","invoice_number");--> statement-breakpoint
CREATE INDEX "idx_provider_invoices_period" ON "provider_invoices" USING btree ("org_id","provider","billing_period_start");--> statement-breakpoint
CREATE INDEX "idx_rate_snapshots_lookup" ON "provider_rate_snapshots" USING btree ("org_id","provider","model","unit","effective_from");--> statement-breakpoint
-- RLS for the new tables (Drizzle doesn't manage policies; mirror 0002_enable_rls.sql)
ALTER TABLE "provider_invoices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "provider_invoices"
  USING (org_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "invoice_line_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "invoice_line_items"
  USING (org_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "provider_rate_snapshots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "provider_rate_snapshots"
  USING (org_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
-- Append-only: historical rate snapshots are immutable. A change is a new row.
CREATE OR REPLACE FUNCTION reckon_block_rate_snapshot_update() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'provider_rate_snapshots is append-only; historical rates are immutable — insert a new row instead';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER trg_rate_snapshots_immutable BEFORE UPDATE ON "provider_rate_snapshots"
  FOR EACH ROW EXECUTE FUNCTION reckon_block_rate_snapshot_update();
