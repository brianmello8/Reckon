-- Enable RLS and create tenant isolation policies on all org-scoped tables.
-- Policy uses current_setting('app.current_org_id', true)::uuid so that
-- forgetting to scope a query returns zero rows instead of leaking data.

-- organizations
ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "organizations"
  USING (id = current_setting('app.current_org_id', true)::uuid);

-- users
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "users"
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

-- developers
ALTER TABLE "developers" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "developers"
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

-- provider_keys
ALTER TABLE "provider_keys" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "provider_keys"
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

-- usage_events
ALTER TABLE "usage_events" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "usage_events"
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

-- anomalies
ALTER TABLE "anomalies" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "anomalies"
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

-- slack_installations
ALTER TABLE "slack_installations" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "slack_installations"
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

-- linear_installations
ALTER TABLE "linear_installations" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "linear_installations"
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

-- digest_logs
ALTER TABLE "digest_logs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "digest_logs"
  USING (org_id = current_setting('app.current_org_id', true)::uuid);
