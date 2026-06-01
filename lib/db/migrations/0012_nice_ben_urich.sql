CREATE TYPE "public"."surface" AS ENUM('operations', 'workflows', 'finance');--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "surfaces" "surface"[] DEFAULT ARRAY['operations']::surface[] NOT NULL;--> statement-breakpoint
-- Backfill: existing admins get all surfaces; members keep the [operations] default.
UPDATE "users" SET "surfaces" = ARRAY['operations','workflows','finance']::surface[] WHERE "role" = 'admin';