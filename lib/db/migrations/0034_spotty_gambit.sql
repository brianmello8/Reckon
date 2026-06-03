-- Helicone connector removed; drop any such connections so the enum recreate casts cleanly.
DELETE FROM "observability_connections" WHERE "provider"::text = 'helicone';--> statement-breakpoint
ALTER TABLE "observability_connections" ALTER COLUMN "provider" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."observability_provider";--> statement-breakpoint
CREATE TYPE "public"."observability_provider" AS ENUM('langfuse');--> statement-breakpoint
ALTER TABLE "observability_connections" ALTER COLUMN "provider" SET DATA TYPE "public"."observability_provider" USING "provider"::"public"."observability_provider";