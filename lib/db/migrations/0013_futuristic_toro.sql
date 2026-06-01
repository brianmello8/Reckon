ALTER TYPE "public"."anomaly_kind" ADD VALUE 'workflow_cost_per_run';--> statement-breakpoint
ALTER TABLE "anomalies" ALTER COLUMN "developer_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "anomalies" ADD COLUMN "workflow_id" uuid;--> statement-breakpoint
ALTER TABLE "anomalies" ADD CONSTRAINT "anomalies_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE no action ON UPDATE no action;