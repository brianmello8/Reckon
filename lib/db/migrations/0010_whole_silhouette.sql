ALTER TABLE "developers" ADD COLUMN "agent_id" uuid;--> statement-breakpoint
ALTER TABLE "provider_identities" ADD COLUMN "agent_id" uuid;--> statement-breakpoint
ALTER TABLE "developers" ADD CONSTRAINT "developers_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_identities" ADD CONSTRAINT "provider_identities_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;