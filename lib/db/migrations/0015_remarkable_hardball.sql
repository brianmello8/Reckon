CREATE TYPE "public"."coding_status" AS ENUM('coded', 'needs_coding', 'suspense');--> statement-breakpoint
CREATE TABLE "attribution_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"name" text NOT NULL,
	"match" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"assign" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cost_allocation_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"usage_event_id" uuid NOT NULL,
	"gl_account_id" uuid,
	"cost_center_id" uuid,
	"entity_id" uuid,
	"project_id" uuid,
	"product_line_id" uuid,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cost_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"usage_event_id" uuid NOT NULL,
	"gl_account_id" uuid,
	"cost_center_id" uuid,
	"entity_id" uuid,
	"project_id" uuid,
	"product_line_id" uuid,
	"coding_status" "coding_status" NOT NULL,
	"rule_id" uuid,
	"overridden" boolean DEFAULT false NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "suspense_gl_account_id" uuid;--> statement-breakpoint
ALTER TABLE "attribution_rules" ADD CONSTRAINT "attribution_rules_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_allocation_overrides" ADD CONSTRAINT "cost_allocation_overrides_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_allocation_overrides" ADD CONSTRAINT "cost_allocation_overrides_usage_event_id_usage_events_id_fk" FOREIGN KEY ("usage_event_id") REFERENCES "public"."usage_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_allocation_overrides" ADD CONSTRAINT "cost_allocation_overrides_gl_account_id_gl_accounts_id_fk" FOREIGN KEY ("gl_account_id") REFERENCES "public"."gl_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_allocation_overrides" ADD CONSTRAINT "cost_allocation_overrides_cost_center_id_cost_centers_id_fk" FOREIGN KEY ("cost_center_id") REFERENCES "public"."cost_centers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_allocation_overrides" ADD CONSTRAINT "cost_allocation_overrides_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_allocation_overrides" ADD CONSTRAINT "cost_allocation_overrides_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_allocation_overrides" ADD CONSTRAINT "cost_allocation_overrides_product_line_id_product_lines_id_fk" FOREIGN KEY ("product_line_id") REFERENCES "public"."product_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_allocation_overrides" ADD CONSTRAINT "cost_allocation_overrides_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_allocations" ADD CONSTRAINT "cost_allocations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_allocations" ADD CONSTRAINT "cost_allocations_usage_event_id_usage_events_id_fk" FOREIGN KEY ("usage_event_id") REFERENCES "public"."usage_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_allocations" ADD CONSTRAINT "cost_allocations_gl_account_id_gl_accounts_id_fk" FOREIGN KEY ("gl_account_id") REFERENCES "public"."gl_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_allocations" ADD CONSTRAINT "cost_allocations_cost_center_id_cost_centers_id_fk" FOREIGN KEY ("cost_center_id") REFERENCES "public"."cost_centers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_allocations" ADD CONSTRAINT "cost_allocations_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_allocations" ADD CONSTRAINT "cost_allocations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_allocations" ADD CONSTRAINT "cost_allocations_product_line_id_product_lines_id_fk" FOREIGN KEY ("product_line_id") REFERENCES "public"."product_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_allocations" ADD CONSTRAINT "cost_allocations_rule_id_attribution_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."attribution_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_attribution_rules_org_priority" ON "attribution_rules" USING btree ("org_id","priority");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_cost_allocation_overrides_event" ON "cost_allocation_overrides" USING btree ("org_id","usage_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_cost_allocations_event" ON "cost_allocations" USING btree ("org_id","usage_event_id");--> statement-breakpoint
CREATE INDEX "idx_cost_allocations_status" ON "cost_allocations" USING btree ("org_id","coding_status");--> statement-breakpoint
-- RLS for the new tables (Drizzle doesn't manage policies; mirror 0002_enable_rls.sql)
ALTER TABLE "attribution_rules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "attribution_rules"
  USING (org_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "cost_allocations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "cost_allocations"
  USING (org_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "cost_allocation_overrides" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "cost_allocation_overrides"
  USING (org_id = current_setting('app.current_org_id', true)::uuid);
