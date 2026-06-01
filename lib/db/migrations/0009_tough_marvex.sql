CREATE TYPE "public"."agent_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."attribution_confidence" AS ENUM('exact', 'inferred');--> statement-breakpoint
CREATE TYPE "public"."attribution_source_type" AS ENUM('key_mapping', 'observability', 'sdk_tag');--> statement-breakpoint
CREATE TYPE "public"."workflow_run_status" AS ENUM('running', 'completed', 'failed', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."workflow_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" "agent_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attribution_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"source_type" "attribution_source_type" NOT NULL,
	"label" text NOT NULL,
	"config" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_attribution" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"usage_event_id" uuid NOT NULL,
	"agent_id" uuid,
	"workflow_id" uuid,
	"workflow_run_id" uuid,
	"customer_ref" text,
	"attribution_source_id" uuid NOT NULL,
	"confidence" "attribution_confidence" NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"workflow_id" uuid NOT NULL,
	"external_run_id" text,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"status" "workflow_run_status" DEFAULT 'unknown' NOT NULL,
	"customer_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"agent_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"status" "workflow_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attribution_sources" ADD CONSTRAINT "attribution_sources_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_attribution" ADD CONSTRAINT "usage_attribution_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_attribution" ADD CONSTRAINT "usage_attribution_usage_event_id_usage_events_id_fk" FOREIGN KEY ("usage_event_id") REFERENCES "public"."usage_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_attribution" ADD CONSTRAINT "usage_attribution_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_attribution" ADD CONSTRAINT "usage_attribution_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_attribution" ADD CONSTRAINT "usage_attribution_workflow_run_id_workflow_runs_id_fk" FOREIGN KEY ("workflow_run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_attribution" ADD CONSTRAINT "usage_attribution_attribution_source_id_attribution_sources_id_fk" FOREIGN KEY ("attribution_source_id") REFERENCES "public"."attribution_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_agents_org" ON "agents" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_attribution_sources_org" ON "attribution_sources" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_usage_attribution_event" ON "usage_attribution" USING btree ("org_id","usage_event_id");--> statement-breakpoint
CREATE INDEX "idx_usage_attribution_agent" ON "usage_attribution" USING btree ("org_id","agent_id");--> statement-breakpoint
CREATE INDEX "idx_usage_attribution_workflow" ON "usage_attribution" USING btree ("org_id","workflow_id");--> statement-breakpoint
CREATE INDEX "idx_workflow_runs_org_wf_started" ON "workflow_runs" USING btree ("org_id","workflow_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_workflow_runs_external" ON "workflow_runs" USING btree ("org_id","workflow_id","external_run_id") WHERE external_run_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_workflows_org_agent" ON "workflows" USING btree ("org_id","agent_id");--> statement-breakpoint
-- RLS for the new attribution tables (Drizzle doesn't manage policies; mirror 0002_enable_rls.sql)
ALTER TABLE "agents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "agents"
  USING (org_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "workflows" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "workflows"
  USING (org_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "workflow_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "workflow_runs"
  USING (org_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "attribution_sources" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "attribution_sources"
  USING (org_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "usage_attribution" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "usage_attribution"
  USING (org_id = current_setting('app.current_org_id', true)::uuid);