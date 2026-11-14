ALTER TABLE "work_tasks" ALTER COLUMN "reviewer_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "work_tasks" ADD COLUMN "viewer_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL;