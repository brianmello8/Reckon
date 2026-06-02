ALTER TABLE "organizations" ADD COLUMN "seat_count" integer;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "finance_enabled" boolean DEFAULT false NOT NULL;