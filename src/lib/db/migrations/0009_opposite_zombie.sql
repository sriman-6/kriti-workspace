CREATE TABLE "work_uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"task_version" integer NOT NULL,
	"name" text NOT NULL,
	"size" integer NOT NULL,
	"content_type" text NOT NULL,
	"blob_path" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"claimed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_uploads_blob_path_unique" UNIQUE("blob_path")
);
--> statement-breakpoint
ALTER TABLE "work_files" ALTER COLUMN "content" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "work_files" ADD COLUMN "blob_path" text;--> statement-breakpoint
ALTER TABLE "work_uploads" ADD CONSTRAINT "work_uploads_task_id_work_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."work_tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_uploads" ADD CONSTRAINT "work_uploads_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "work_uploads_pending_idx" ON "work_uploads" USING btree ("owner_id","expires_at");--> statement-breakpoint
ALTER TABLE "work_files" ADD CONSTRAINT "work_files_blob_path_unique" UNIQUE("blob_path");--> statement-breakpoint
ALTER TABLE "work_files" ADD CONSTRAINT "work_files_one_storage" CHECK (("work_files"."content" is not null) <> ("work_files"."blob_path" is not null));