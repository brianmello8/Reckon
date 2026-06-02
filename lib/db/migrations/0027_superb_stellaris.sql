ALTER TYPE "public"."expected_credits_source" ADD VALUE 'invoice_document';--> statement-breakpoint
ALTER TABLE "journal_entries" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "journal_entries" ALTER COLUMN "status" SET DEFAULT 'draft'::text;--> statement-breakpoint
DROP TYPE "public"."journal_entry_status";--> statement-breakpoint
CREATE TYPE "public"."journal_entry_status" AS ENUM('draft', 'approved');--> statement-breakpoint
ALTER TABLE "journal_entries" ALTER COLUMN "status" SET DEFAULT 'draft'::"public"."journal_entry_status";--> statement-breakpoint
ALTER TABLE "journal_entries" ALTER COLUMN "status" SET DATA TYPE "public"."journal_entry_status" USING "status"::"public"."journal_entry_status";