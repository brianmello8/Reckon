CREATE TYPE "public"."erp_segment" AS ENUM('gl_account', 'cost_center', 'entity', 'project', 'product_line');--> statement-breakpoint
CREATE TABLE "dimension_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"code_set_id" uuid NOT NULL,
	"reckon_dimension" "erp_segment" NOT NULL,
	"reckon_value_id" uuid NOT NULL,
	"erp_code" text NOT NULL,
	"validated" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "erp_code_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"system_label" text NOT NULL,
	"uploaded_by_user_id" uuid,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "erp_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"code_set_id" uuid NOT NULL,
	"segment" "erp_segment" NOT NULL,
	"code" text NOT NULL,
	"name" text
);
--> statement-breakpoint
ALTER TABLE "export_batches" ADD COLUMN "code_set_id" uuid;--> statement-breakpoint
ALTER TABLE "dimension_mappings" ADD CONSTRAINT "dimension_mappings_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dimension_mappings" ADD CONSTRAINT "dimension_mappings_code_set_id_erp_code_sets_id_fk" FOREIGN KEY ("code_set_id") REFERENCES "public"."erp_code_sets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_code_sets" ADD CONSTRAINT "erp_code_sets_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_code_sets" ADD CONSTRAINT "erp_code_sets_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_codes" ADD CONSTRAINT "erp_codes_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_codes" ADD CONSTRAINT "erp_codes_code_set_id_erp_code_sets_id_fk" FOREIGN KEY ("code_set_id") REFERENCES "public"."erp_code_sets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_dimension_mappings" ON "dimension_mappings" USING btree ("code_set_id","reckon_dimension","reckon_value_id");--> statement-breakpoint
CREATE INDEX "idx_dimension_mappings_org" ON "dimension_mappings" USING btree ("org_id","code_set_id");--> statement-breakpoint
CREATE INDEX "idx_erp_code_sets_org" ON "erp_code_sets" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_erp_codes_set_segment" ON "erp_codes" USING btree ("code_set_id","segment");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_erp_codes_set_segment_code" ON "erp_codes" USING btree ("code_set_id","segment","code");--> statement-breakpoint
ALTER TABLE "export_batches" ADD CONSTRAINT "export_batches_code_set_id_erp_code_sets_id_fk" FOREIGN KEY ("code_set_id") REFERENCES "public"."erp_code_sets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- RLS for the new tables (Drizzle does not manage policies; mirror 0002_enable_rls.sql).
ALTER TABLE "erp_code_sets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "erp_code_sets"
  USING (org_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "erp_codes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "erp_codes"
  USING (org_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "dimension_mappings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "dimension_mappings"
  USING (org_id = current_setting('app.current_org_id', true)::uuid);
