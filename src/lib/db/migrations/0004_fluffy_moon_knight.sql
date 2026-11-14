-- Retire course-only accounts while preserving explicitly configured KRITI identities.
UPDATE "users" SET "is_active" = false
WHERE "role" IN ('coordinator', 'ta', 'mentor')
AND NOT EXISTS (SELECT 1 FROM "workspace_profiles" p WHERE p."user_id" = "users"."id");
--> statement-breakpoint
UPDATE "programmes" SET "is_active" = false WHERE "code" = 'SVC';
--> statement-breakpoint
DROP TABLE "assessment_components" CASCADE;--> statement-breakpoint
DROP TABLE "attendance" CASCADE;--> statement-breakpoint
DROP TABLE "checkins" CASCADE;--> statement-breakpoint
DROP TABLE "cohort_settings" CASCADE;--> statement-breakpoint
DROP TABLE "individual_marks" CASCADE;--> statement-breakpoint
DROP TABLE "lessons" CASCADE;--> statement-breakpoint
DROP TABLE "session_feedback" CASCADE;--> statement-breakpoint
DROP TABLE "sessions" CASCADE;--> statement-breakpoint
DROP TABLE "students" CASCADE;--> statement-breakpoint
DROP TABLE "submissions" CASCADE;--> statement-breakpoint
DROP TABLE "teams" CASCADE;--> statement-breakpoint
ALTER TABLE "public"."users" ALTER COLUMN "role" SET DATA TYPE text;--> statement-breakpoint
-- Cast before mapping: fresh installs may apply the preceding enum addition in the same transaction.
UPDATE "users" SET "role" = 'member' WHERE "role" IN ('coordinator', 'ta', 'mentor');
--> statement-breakpoint
DROP TYPE "public"."user_role";--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('super_admin', 'member');--> statement-breakpoint
ALTER TABLE "public"."users" ALTER COLUMN "role" SET DATA TYPE "public"."user_role" USING "role"::"public"."user_role";--> statement-breakpoint
DROP TYPE "public"."attendance_mark";--> statement-breakpoint
DROP TYPE "public"."component_grain";--> statement-breakpoint
DROP TYPE "public"."idea_status";--> statement-breakpoint
DROP TYPE "public"."lesson_category";--> statement-breakpoint
DROP TYPE "public"."meeting_mode";--> statement-breakpoint
DROP TYPE "public"."session_status";--> statement-breakpoint
DROP TYPE "public"."speaker_status";--> statement-breakpoint
DROP TYPE "public"."student_status";--> statement-breakpoint
DROP TYPE "public"."submission_status";--> statement-breakpoint
DROP TYPE "public"."team_health";--> statement-breakpoint
DROP TYPE "public"."venture_stage";
