CREATE TABLE "provider_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"provider_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"label" text,
	"developer_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "uniq_usage_events_natural_key";--> statement-breakpoint
ALTER TABLE "provider_keys" ALTER COLUMN "developer_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "usage_events" ALTER COLUMN "developer_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN "external_identity" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "provider_identities" ADD CONSTRAINT "provider_identities_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_identities" ADD CONSTRAINT "provider_identities_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_identities" ADD CONSTRAINT "provider_identities_developer_id_developers_id_fk" FOREIGN KEY ("developer_id") REFERENCES "public"."developers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_provider_identities_natural" ON "provider_identities" USING btree ("org_id","provider_id","external_id");--> statement-breakpoint
CREATE INDEX "idx_provider_identities_developer" ON "provider_identities" USING btree ("developer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_usage_events_natural_key" ON "usage_events" USING btree ("provider_key_id","external_identity","time_bucket","model");--> statement-breakpoint
-- RLS for the new table (Drizzle doesn't manage policies; mirror 0002_enable_rls.sql)
ALTER TABLE "provider_identities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "provider_identities"
  USING (org_id = current_setting('app.current_org_id', true)::uuid);