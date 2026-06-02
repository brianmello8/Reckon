ALTER TYPE "public"."journal_entry_type" ADD VALUE 'reversal';--> statement-breakpoint
ALTER TABLE "accruals" ADD COLUMN "actual_amount" bigint;--> statement-breakpoint
ALTER TABLE "accruals" ADD COLUMN "variance_amount" bigint;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD COLUMN "source_journal_entry_id" uuid;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_source_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("source_journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;