CREATE TABLE "tracker_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"programme_id" uuid NOT NULL,
	"row_id" uuid,
	"actor_id" uuid NOT NULL,
	"message" text NOT NULL,
	"snapshot" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tracker_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"programme_id" uuid NOT NULL,
	"sheet_id" uuid,
	"linked_sheet_id" uuid,
	"author_id" uuid NOT NULL,
	"owner_id" uuid,
	"title" text NOT NULL,
	"kind" text DEFAULT 'update' NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"event_on" date,
	"notes" text DEFAULT '' NOT NULL,
	"links" text[] DEFAULT '{}'::text[] NOT NULL,
	"values" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tracker_sheets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"programme_id" uuid NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"columns" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tracker_uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"programme_id" uuid NOT NULL,
	"row_id" uuid,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"content" text,
	"blob_path" text,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "programmes" ADD COLUMN "stage" text DEFAULT 'unset' NOT NULL;--> statement-breakpoint
ALTER TABLE "programmes" ADD COLUMN "tracker_columns" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "programmes" ADD COLUMN "version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "work_tasks" ADD COLUMN "tracker_sheet_id" uuid;--> statement-breakpoint
ALTER TABLE "tracker_events" ADD CONSTRAINT "tracker_events_programme_id_programmes_id_fk" FOREIGN KEY ("programme_id") REFERENCES "public"."programmes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker_events" ADD CONSTRAINT "tracker_events_row_id_tracker_rows_id_fk" FOREIGN KEY ("row_id") REFERENCES "public"."tracker_rows"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker_events" ADD CONSTRAINT "tracker_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker_rows" ADD CONSTRAINT "tracker_rows_programme_id_programmes_id_fk" FOREIGN KEY ("programme_id") REFERENCES "public"."programmes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker_rows" ADD CONSTRAINT "tracker_rows_sheet_id_tracker_sheets_id_fk" FOREIGN KEY ("sheet_id") REFERENCES "public"."tracker_sheets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker_rows" ADD CONSTRAINT "tracker_rows_linked_sheet_id_tracker_sheets_id_fk" FOREIGN KEY ("linked_sheet_id") REFERENCES "public"."tracker_sheets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker_rows" ADD CONSTRAINT "tracker_rows_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker_rows" ADD CONSTRAINT "tracker_rows_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker_sheets" ADD CONSTRAINT "tracker_sheets_programme_id_programmes_id_fk" FOREIGN KEY ("programme_id") REFERENCES "public"."programmes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker_uploads" ADD CONSTRAINT "tracker_uploads_programme_id_programmes_id_fk" FOREIGN KEY ("programme_id") REFERENCES "public"."programmes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker_uploads" ADD CONSTRAINT "tracker_uploads_row_id_tracker_rows_id_fk" FOREIGN KEY ("row_id") REFERENCES "public"."tracker_rows"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker_uploads" ADD CONSTRAINT "tracker_uploads_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tracker_events_scope_idx" ON "tracker_events" USING btree ("programme_id","created_at");--> statement-breakpoint
CREATE INDEX "tracker_rows_scope_idx" ON "tracker_rows" USING btree ("programme_id","sheet_id");--> statement-breakpoint
CREATE INDEX "tracker_sheets_programme_idx" ON "tracker_sheets" USING btree ("programme_id");--> statement-breakpoint
CREATE INDEX "tracker_uploads_row_idx" ON "tracker_uploads" USING btree ("row_id");--> statement-breakpoint
ALTER TABLE "work_tasks" ADD CONSTRAINT "work_tasks_tracker_sheet_id_tracker_sheets_id_fk" FOREIGN KEY ("tracker_sheet_id") REFERENCES "public"."tracker_sheets"("id") ON DELETE no action ON UPDATE no action;