CREATE TYPE "public"."accrual_status" AS ENUM('draft', 'reversed', 'trued_up');--> statement-breakpoint
CREATE TYPE "public"."journal_entry_status" AS ENUM('draft', 'approved', 'posted');--> statement-breakpoint
CREATE TYPE "public"."journal_entry_type" AS ENUM('accrual', 'allocation', 'true_up');--> statement-breakpoint
CREATE TABLE "accruals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"period_id" uuid NOT NULL,
	"provider" text,
	"estimated_amount" bigint NOT NULL,
	"tail_forecast_amount" bigint NOT NULL,
	"method_note" text NOT NULL,
	"status" "accrual_status" DEFAULT 'draft' NOT NULL,
	"journal_entry_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journal_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"period_id" uuid NOT NULL,
	"type" "journal_entry_type" NOT NULL,
	"status" "journal_entry_status" DEFAULT 'draft' NOT NULL,
	"idempotency_key" text NOT NULL,
	"memo" text,
	"approved_by_user_id" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journal_entry_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"journal_entry_id" uuid NOT NULL,
	"gl_account_id" uuid,
	"cost_center_id" uuid,
	"entity_id" uuid,
	"project_id" uuid,
	"debit" bigint DEFAULT 0 NOT NULL,
	"credit" bigint DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "accrued_liability_gl_account_id" uuid;--> statement-breakpoint
ALTER TABLE "accruals" ADD CONSTRAINT "accruals_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accruals" ADD CONSTRAINT "accruals_period_id_accounting_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."accounting_periods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accruals" ADD CONSTRAINT "accruals_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_period_id_accounting_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."accounting_periods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_gl_account_id_gl_accounts_id_fk" FOREIGN KEY ("gl_account_id") REFERENCES "public"."gl_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_cost_center_id_cost_centers_id_fk" FOREIGN KEY ("cost_center_id") REFERENCES "public"."cost_centers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_accruals_period" ON "accruals" USING btree ("org_id","period_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_journal_entries_idempotency" ON "journal_entries" USING btree ("org_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "idx_journal_entry_lines_entry" ON "journal_entry_lines" USING btree ("org_id","journal_entry_id");--> statement-breakpoint
-- RLS for the new tables (Drizzle doesn't manage policies; mirror 0002_enable_rls.sql)
ALTER TABLE "journal_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "journal_entries"
  USING (org_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "journal_entry_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "journal_entry_lines"
  USING (org_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "accruals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "accruals"
  USING (org_id = current_setting('app.current_org_id', true)::uuid);
