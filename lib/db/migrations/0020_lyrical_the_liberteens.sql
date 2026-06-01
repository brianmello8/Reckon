CREATE TABLE "forecast_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"period" text NOT NULL,
	"snapshot_date" date NOT NULL,
	"mtd_observed" bigint NOT NULL,
	"through_day" integer NOT NULL,
	"days_in_month" integer NOT NULL,
	"run_rate_daily" bigint NOT NULL,
	"projected_total" bigint NOT NULL,
	"low" bigint NOT NULL,
	"high" bigint NOT NULL,
	"band_pct" integer NOT NULL,
	"method" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "forecast_snapshots" ADD CONSTRAINT "forecast_snapshots_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_forecast_snapshots_day" ON "forecast_snapshots" USING btree ("org_id","provider","period","snapshot_date");--> statement-breakpoint
-- RLS for the new table (Drizzle doesn't manage policies; mirror 0002_enable_rls.sql)
ALTER TABLE "forecast_snapshots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "forecast_snapshots"
  USING (org_id = current_setting('app.current_org_id', true)::uuid);
