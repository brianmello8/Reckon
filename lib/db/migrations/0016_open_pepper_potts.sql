CREATE TYPE "public"."allocation_driver_method" AS ENUM('usage_tokens', 'headcount', 'revenue', 'fixed_pct', 'even');--> statement-breakpoint
CREATE TABLE "allocation_drivers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"method" "allocation_driver_method" NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "dimension_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "uniq_cost_allocations_event";--> statement-breakpoint
ALTER TABLE "cost_allocations" ADD COLUMN "allocation_pct" integer DEFAULT 10000 NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "rounding_cost_center_id" uuid;--> statement-breakpoint
ALTER TABLE "allocation_drivers" ADD CONSTRAINT "allocation_drivers_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_allocation_drivers_org" ON "allocation_drivers" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_cost_allocations_event" ON "cost_allocations" USING btree ("org_id","usage_event_id");--> statement-breakpoint
-- RLS for the new table (Drizzle doesn't manage policies; mirror 0002_enable_rls.sql)
ALTER TABLE "allocation_drivers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "allocation_drivers"
  USING (org_id = current_setting('app.current_org_id', true)::uuid);
