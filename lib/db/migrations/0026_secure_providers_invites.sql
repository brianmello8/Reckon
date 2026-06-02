-- Close two RLS gaps flagged by the Supabase advisor ("RLS Disabled in Public").
-- The app DB role has BYPASSRLS, so these are backstops (decision #3) — app
-- behavior is unchanged; they harden any direct/PostgREST access path.

-- developer_invites IS org-scoped customer data (emails + invite tokens) and was
-- missing the standard tenant-isolation backstop. Add it like every other org table.
ALTER TABLE "developer_invites" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "developer_invites"
  USING (org_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint

-- providers is GLOBAL, non-sensitive reference data (id, key, display_name) with
-- no org_id, so tenant isolation doesn't apply. Enable RLS with a read-only
-- policy: everyone may read it; no write policy means non-bypass roles can't
-- mutate it (only our BYPASSRLS app role / migrations can).
ALTER TABLE "providers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "public_read" ON "providers"
  FOR SELECT USING (true);
