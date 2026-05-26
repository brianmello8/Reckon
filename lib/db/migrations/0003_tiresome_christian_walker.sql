ALTER TABLE "organizations" ADD COLUMN "clerk_org_id" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_clerk_org_id_unique" UNIQUE("clerk_org_id");