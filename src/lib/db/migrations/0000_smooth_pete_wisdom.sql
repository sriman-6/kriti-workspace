CREATE TYPE "public"."attendance_mark" AS ENUM('present', 'absent', 'excused');--> statement-breakpoint
CREATE TYPE "public"."campus" AS ENUM('PIL', 'GOA', 'HYD', 'DXB');--> statement-breakpoint
CREATE TYPE "public"."component_grain" AS ENUM('individual', 'team');--> statement-breakpoint
CREATE TYPE "public"."idea_status" AS ENUM('placeholder', 'confirmed');--> statement-breakpoint
CREATE TYPE "public"."lesson_category" AS ENUM('academic', 'operations', 'technology', 'communication', 'evaluation', 'student_experience');--> statement-breakpoint
CREATE TYPE "public"."meeting_mode" AS ENUM('in_person', 'zoom', 'phone', 'email');--> statement-breakpoint
CREATE TYPE "public"."session_status" AS ENUM('planned', 'scheduled', 'delivered', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."speaker_status" AS ENUM('to_invite', 'invited', 'confirmed', 'delivered', 'declined', 'rescheduled');--> statement-breakpoint
CREATE TYPE "public"."student_status" AS ENUM('active', 'dropped', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."submission_status" AS ENUM('not_submitted', 'submitted', 'under_evaluation', 'revision_requested', 'resubmitted', 'evaluated');--> statement-breakpoint
CREATE TYPE "public"."team_health" AS ENUM('green', 'amber', 'red');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('coordinator', 'ta', 'mentor');--> statement-breakpoint
CREATE TYPE "public"."venture_stage" AS ENUM('idea', 'validation', 'prototype', 'pilot', 'ready_to_pitch');--> statement-breakpoint
CREATE TABLE "assessment_components" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"grain" "component_grain" NOT NULL,
	"weight" numeric(4, 3) NOT NULL,
	"max_marks" numeric(5, 2) NOT NULL,
	"has_submission" boolean DEFAULT true NOT NULL,
	"due_at" timestamp with time zone,
	"instructions_url" text,
	"sort_order" smallint NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assessment_components_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "attendance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"mark" "attendance_mark" NOT NULL,
	"recorded_by" uuid,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"note" text,
	CONSTRAINT "attendance_session_student_unique" UNIQUE("session_id","student_id")
);
--> statement-breakpoint
CREATE TABLE "checkins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"author_user_id" uuid,
	"met_on" date NOT NULL,
	"mode" "meeting_mode" NOT NULL,
	"summary" text NOT NULL,
	"action_items" text,
	"health" "team_health" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cohort_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"course_code" text DEFAULT 'BITS F332' NOT NULL,
	"course_title" text DEFAULT 'Social Venture Creation (SVC)' NOT NULL,
	"instructor_in_charge" text,
	"starts_on" date,
	"ends_on" date,
	"teaching_weeks" smallint DEFAULT 15 NOT NULL,
	"session_time_label" text DEFAULT '6:00 PM – 7:50 PM IST' NOT NULL,
	"attendance_threshold" numeric(3, 2) DEFAULT '0.75' NOT NULL,
	"attendance_affects_grade" boolean DEFAULT false NOT NULL,
	"teams_frozen_after_week" smallint DEFAULT 3 NOT NULL,
	"marks_published_at" timestamp with time zone,
	"drive_root_url" text,
	"lms_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cohort_settings_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "individual_marks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"component_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"marks" numeric(5, 2) NOT NULL,
	"note" text,
	"recorded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "individual_marks_component_student_unique" UNIQUE("component_id","student_id")
);
--> statement-breakpoint
CREATE TABLE "lessons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"logged_on" date DEFAULT CURRENT_DATE NOT NULL,
	"category" "lesson_category" NOT NULL,
	"observation" text NOT NULL,
	"suggestion" text,
	"raised_by_user_id" uuid,
	"is_implemented" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"rating" smallint NOT NULL,
	"what_worked" text,
	"what_could_improve" text,
	"campus" "campus",
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"week_no" smallint NOT NULL,
	"module" text NOT NULL,
	"topic" text NOT NULL,
	"learning_outcome" text NOT NULL,
	"scheduled_at" timestamp with time zone,
	"duration_minutes" smallint DEFAULT 110 NOT NULL,
	"join_url" text,
	"recording_url" text,
	"status" "session_status" DEFAULT 'planned' NOT NULL,
	"speaker_name" text,
	"speaker_organisation" text,
	"speaker_email" text,
	"speaker_status" "speaker_status" DEFAULT 'to_invite' NOT NULL,
	"deck_received" boolean DEFAULT false NOT NULL,
	"interactive_element" text,
	"resources_shared" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_week_no_unique" UNIQUE("week_no")
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bits_id" text NOT NULL,
	"full_name" text NOT NULL,
	"email" text NOT NULL,
	"campus" "campus" NOT NULL,
	"discipline" text,
	"degree_type" text,
	"year" text,
	"team_id" uuid,
	"is_team_lead" boolean DEFAULT false NOT NULL,
	"status" "student_status" DEFAULT 'active' NOT NULL,
	"data_verified" boolean DEFAULT true NOT NULL,
	"verification_note" text,
	"penalty" numeric(5, 2) DEFAULT '0' NOT NULL,
	"penalty_reason" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "students_email_unique" UNIQUE("email"),
	CONSTRAINT "students_bits_id_unique" UNIQUE("bits_id")
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"component_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"drive_url" text NOT NULL,
	"submitted_by_student_id" uuid,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" smallint DEFAULT 1 NOT NULL,
	"supersedes_id" uuid,
	"status" "submission_status" DEFAULT 'submitted' NOT NULL,
	"note" text,
	"marks" numeric(5, 2),
	"feedback" text,
	"evaluated_by" uuid,
	"evaluated_at" timestamp with time zone,
	"revision_requested" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "submissions_component_team_version_unique" UNIQUE("component_id","team_id","version")
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"name_as_submitted" text,
	"campus" "campus" NOT NULL,
	"ta_user_id" uuid,
	"mentor_user_id" uuid,
	"venture_title" text,
	"problem_statement" text,
	"solution" text,
	"sector" text,
	"stage" "venture_stage" DEFAULT 'idea' NOT NULL,
	"idea_status" "idea_status" DEFAULT 'placeholder' NOT NULL,
	"drive_folder_url" text,
	"progress_pct" smallint DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teams_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"full_name" text NOT NULL,
	"role" "user_role" NOT NULL,
	"campus" "campus",
	"avatar_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_seen_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "individual_marks" ADD CONSTRAINT "individual_marks_component_id_assessment_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."assessment_components"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "individual_marks" ADD CONSTRAINT "individual_marks_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "individual_marks" ADD CONSTRAINT "individual_marks_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_raised_by_user_id_users_id_fk" FOREIGN KEY ("raised_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_feedback" ADD CONSTRAINT "session_feedback_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_component_id_assessment_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."assessment_components"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_submitted_by_student_id_students_id_fk" FOREIGN KEY ("submitted_by_student_id") REFERENCES "public"."students"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_evaluated_by_users_id_fk" FOREIGN KEY ("evaluated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_ta_user_id_users_id_fk" FOREIGN KEY ("ta_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_mentor_user_id_users_id_fk" FOREIGN KEY ("mentor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attendance_student_idx" ON "attendance" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "checkins_team_met_on_idx" ON "checkins" USING btree ("team_id","met_on");--> statement-breakpoint
CREATE INDEX "individual_marks_student_idx" ON "individual_marks" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "session_feedback_session_idx" ON "session_feedback" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "students_campus_status_idx" ON "students" USING btree ("campus","status");--> statement-breakpoint
CREATE INDEX "students_team_idx" ON "students" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "submissions_team_idx" ON "submissions" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "submissions_status_idx" ON "submissions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "teams_campus_idx" ON "teams" USING btree ("campus");--> statement-breakpoint
CREATE INDEX "teams_ta_idx" ON "teams" USING btree ("ta_user_id");--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role");