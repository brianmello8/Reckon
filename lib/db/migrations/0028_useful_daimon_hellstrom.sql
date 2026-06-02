CREATE TYPE "public"."export_batch_status" AS ENUM('generated', 'downloaded', 'acknowledged', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."export_target_format" AS ENUM('generic_csv', 'qbo_iif', 'netsuite_csv', 'intacct_csv', 'xero_csv', 'spend_splits_csv');--> statement-breakpoint
CREATE TABLE "export_batch_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"journal_entry_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "export_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"period_id" uuid NOT NULL,
	"target_format" "export_target_format" NOT NULL,
	"external_batch_id" text NOT NULL,
	"content_hash" text NOT NULL,
	"filename" text NOT NULL,
	"mimetype" text NOT NULL,
	"body" text NOT NULL,
	"status" "export_batch_status" DEFAULT 'generated' NOT NULL,
	"lock_override_reason" text,
	"supersede_reason" text,
	"superseded_by_batch_id" uuid,
	"generated_by_user_id" uuid,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"downloaded_at" timestamp with time zone,
	"acknowledged_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "export_batch_entries" ADD CONSTRAINT "export_batch_entries_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_batch_entries" ADD CONSTRAINT "export_batch_entries_batch_id_export_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."export_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_batch_entries" ADD CONSTRAINT "export_batch_entries_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_batches" ADD CONSTRAINT "export_batches_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_batches" ADD CONSTRAINT "export_batches_period_id_accounting_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."accounting_periods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_batches" ADD CONSTRAINT "export_batches_superseded_by_batch_id_export_batches_id_fk" FOREIGN KEY ("superseded_by_batch_id") REFERENCES "public"."export_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_batches" ADD CONSTRAINT "export_batches_generated_by_user_id_users_id_fk" FOREIGN KEY ("generated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_export_batch_entries" ON "export_batch_entries" USING btree ("batch_id","journal_entry_id");--> statement-breakpoint
CREATE INDEX "idx_export_batch_entries_je" ON "export_batch_entries" USING btree ("org_id","journal_entry_id");--> statement-breakpoint
CREATE INDEX "idx_export_batches_org_period" ON "export_batches" USING btree ("org_id","period_id");--> statement-breakpoint
CREATE INDEX "idx_export_batches_external" ON "export_batches" USING btree ("org_id","external_batch_id");--> statement-breakpoint
-- RLS for the new tables (Drizzle doesn't manage policies; mirror 0002_enable_rls.sql).
ALTER TABLE "export_batches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "export_batches"
  USING (org_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "export_batch_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "export_batch_entries"
  USING (org_id = current_setting('app.current_org_id', true)::uuid);