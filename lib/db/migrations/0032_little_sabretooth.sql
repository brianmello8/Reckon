ALTER TABLE "organizations" ADD COLUMN "trial_ends_at" timestamp with time zone;--> statement-breakpoint
-- Backfill: give existing non-pro orgs a fresh 7-day trial so nobody is locked out.
UPDATE "organizations" SET "trial_ends_at" = now() + interval '7 days' WHERE "plan" <> 'pro' AND "trial_ends_at" IS NULL;
