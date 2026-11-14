# KRITI centralized management portal — proposed build plan

> **Historical inspection:** The user subsequently requested complete retirement
> of SVC. The working application is now standalone KRITI. This document records
> the inspected starting point, not the current feature inventory. See README
> and the updated role/screen blueprint for current scope.

> Scope update: [12-kriti-role-screen-blueprint.md](12-kriti-role-screen-blueprint.md)
> refines this proposal using the KRITI team directory and the user's expanded
> requirements. Its role model and delivery order supersede the generic role
> experiences and mentorship-first sequence below. The existing-app inspection
> remains valid. The new first milestone is task assignment, submission, and review.

Prepared 13 November 2026 after inspecting the existing SVC PMS source, schema,
services, documentation, source CSVs, and local runtime. This is a proposal for
discussion, not an approved expansion of every feature listed here.

## Product direction

Build one KRITI portal with a shared identity, navigation, and connected records.
SVC becomes a programme within KRITI. A member sees their own work; a mentor sees
their allocations; a programme lead sees their programme; KRITI administrators
see the organisation-wide picture.

The four supplied screenshots show the student experience of the BITS wellness
portal. The mentor allocation and scheduling requirements come from the user's
description. Use its profile panel, module cards, upcoming meeting, recent
activity, quick actions, status lists, and guided forms as interaction references.
Use KRITI branding and adapt the modules to KRITI's actual work. The reference's
leave, grievance, and gate-pass systems are not automatically KRITI requirements.

Working scope proposal: programmes contain initiatives/projects; projects have
owners, members, tasks, deadlines, and progress. Meetings and events provide the
calendar. SVC retains its course-specific teams, assessments, and marks. Actual
KRITI workstreams and the first pilot group still need to be identified.

## Verified current application

| Area | Current implementation | Implication |
|---|---|---|
| Stack | Next.js 16.3, React 19, TypeScript, Tailwind 4, Radix components | Keep the existing stack and reusable components |
| Structure | Server pages/actions call services; services query Drizzle | Extend the existing service boundary rather than rebuilding |
| Data | PGlite locally; Postgres driver when DATABASE_URL is set | Preserve local development; use managed Postgres for a shared deployment |
| Authentication | Direct Google OAuth, verified permitted domain, active staff account, signed session cookie | Reuse the identity flow; add member provisioning and scoped access |
| Roles | Super Admin, Coordinator, TA, Mentor; one role and optional campus per user | Insufficient for a person with different responsibilities in different programmes |
| Student portal | Landing card only, explicitly coming soon | Needs real login linkage, authorisation, and pages |
| SVC operations | Roster, team workspaces, venture details, staff allocation, session schedule, attendance and QR check-in, submissions/evaluation, gradebook, reports, account settings | Preserve and place inside the SVC programme |
| Mentoring | One mentor field per team; check-in table and read-side history | No complete scheduling workflow; no check-in creation action/UI found |
| Mentor visibility | Read access follows campus scope, rather than mentor allocation | Replace this behaviour for the new assigned-mentee experience |
| Programme scope | A single cohort configuration; operational rows lack cohort/programme identifiers | Multi-programme support requires explicit schema and query scoping |
| Missing shared tools | Project/task tracker, meetings, requests, announcements, notifications, persistent audit history, file uploads | Add incrementally as actual workflows |

The source CSVs contain 62 students, 24 teams, 9 staff accounts, and 15 sessions.
Those are SVC source counts, not a complete KRITI member directory.

Important documentation discrepancies: the post-MVP backlog says students.user_id
exists, but it does not exist in the current schema. Older architecture documents
describe libraries and auth choices that differ from the current implementation.
Use the current code and migrations as implementation evidence.

## Proposed role experiences

| Experience | Home dashboard and permitted work |
|---|---|
| Student / KRITI member | Profile, joined programmes, own projects/team, assigned tasks, deadlines, mentor, upcoming meetings, own requests, relevant announcements; SVC attendance and published results when enrolled |
| Professor / mentor | Assigned students/teams/projects, upcoming meetings, schedule/reschedule/cancel controls, progress reviews, shared follow-ups and restricted mentor notes |
| Programme lead / coordinator | Programme membership and allocations, projects, deadlines, sessions/events, programme requests and reports |
| KRITI administrator | Organisation overview, programme setup, account/access management, cross-programme reporting and audit history |
| SVC TA | Existing attendance/evaluation responsibilities in their authorised SVC scope |

These are experiences and scoped responsibilities. One account may hold more
than one responsibility. Navigation follows access; every service and export must
also enforce it. Campus is a useful filter, not a substitute for assignment.

## Information architecture

- Home: profile, relevant module cards, upcoming meeting/deadlines, activity, quick actions.
- My Work: projects and tasks assigned to the signed-in person.
- Programmes: programme overview and its people, projects, and schedule.
- Mentorship: My Mentor for members; My Mentees for mentors.
- Calendar: mentoring meetings and programme events with appropriate visibility.
- SVC: existing course operations, exposed according to enrolment and staff access.
- Requests: KRITI-specific requests and their approval history, once categories are agreed.
- Announcements and Resources: relevant updates and links.
- Reports and Administration: visible to authorised staff.

Hide irrelevant modules. Module cards and dashboards link to the same underlying
records; do not create disconnected copies of the student and mentor systems.

## Architecture changes and data preservation

Keep a single Next.js application, Drizzle migrations, server-side services, and
Postgres. The expanded scope creates a concrete blocker in the single-cohort data
model; address that blocker with incremental migrations rather than a rewrite.

1. Add programme identity and memberships; preserve SVC as the first programme.
   Represent academic cohorts separately where semester-specific behaviour is needed.
2. Link a verified login identity to its student/member record. Provision or invite
   approved members; a permitted email domain alone must not grant access.
3. Introduce scoped role grants when adding cross-programme responsibilities.
   Preserve existing administrative access during migration and test the mapping.
4. Backfill existing SVC operational records into the SVC programme/cohort before
   enabling a second programme. Include settings, sessions, attendance, assessment,
   submissions, grade publication, reports, and exports in the scope review.
5. Add explicit mentorship allocations for students or teams, with active dates
   and history. Preserve the existing team mentor assignments during conversion.
6. Add meetings and participants, then projects, project memberships, and tasks
   as their vertical slices ship. Keep historical check-ins as historical records;
   they must not become invented future meetings.
7. Record important changes in an audit trail from the first new workflow.
   Separate shared meeting summaries from private mentor notes.

Before migration, back up existing data and validate the migration on an isolated
copy. Retain identifiers and verify counts, relationships, attendance, and marks
before and after. Use additive columns/backfills before enforcing constraints.
Student membership in a KRITI project must not change historical SVC team marks.
Do not reset or reseed the working database to perform the migration.

## Delivery sequence

Each phase includes its database changes, services, permissions, validation,
responsive UI, loading/empty/error states, and relevant tests. Keep the app runnable.

| Phase | Deliverable | Demonstrable completion |
|---|---|---|
| 0. Baseline and pilot brief | Capture current behaviour, back up data, identify real KRITI programmes/member types, map current roles, repair stale verification assumptions and framework tooling | Existing SVC workflows remain reproducible; pilot scope and migration mapping are written down |
| 1. KRITI portal and assignments | KRITI shell/home, shared Google sign-in, member account linkage, initial programme membership, scoped access, coordinator allocation screen | Coordinator assigns a mentor; member sees My Mentor; mentor sees only allocated members/teams; unrelated records are denied by direct URL and service access |
| 2. Complete mentorship workflow | Schedule, reschedule and cancel individual/team meetings; participant list, location or meeting URL, upcoming/history views, completed status, shared notes, follow-up tasks, restricted notes, in-app notifications | A mentor schedules a meeting and it appears in both dashboards; a changed time updates both; shared follow-ups are visible to participants; private notes stay restricted |
| 3. KRITI work tracker | Programme projects/initiatives, owners and members, tasks, due dates, priorities/status, list/board views, overdue and blocked work on dashboards | Lead creates a project and task; assigned member updates it; lead sees the same live progress and overdue items |
| 4. SVC student self-service | Bring existing SVC pages into the programme context; student attendance, permitted team deliverable submission, feedback, published marks | Student submits a deliverable; authorised TA evaluates it; student sees permitted feedback/results; another team's records stay inaccessible |
| 5. Operations and shared rollout | Agreed request categories and approvers, announcements/resources, actionable reports, notification delivery, managed Postgres deployment, backup/restore and pilot validation | Member submits a KRITI request, responsible person decides it, member tracks status/history; pilot users complete their real workflows on the shared deployment |

Milestone 1 is the end of Phase 2: a working central portal with connected member,
mentor, and coordinator experiences. Milestone 2 adds KRITI-wide work tracking.
SVC continues to function throughout.

Meeting rules should cover organiser permissions, participant visibility,
overlapping bookings, timezone-aware timestamps (including Dubai), cancellations,
and no-show/completed states. Manual meeting links and calendar export are enough
initially; automatic Google Calendar/Meet integration can follow after the core
workflow is reliable. Email reminders require delivery configuration and retries;
do not present an in-app notification as a delivered email.

Requests should start with the categories KRITI actually needs, such as a resource
or event approval if confirmed. Use submitted, under review, approved, rejected,
and cancelled states, an explicit responsible approver, and a decision history.
Use guided forms only when multiple steps or policy checks justify them.

## Scope decisions before implementation

- Name the KRITI programmes/workstreams and identify the first pilot participants.
- Confirm whether mentorship is individual, team-based, or both. The proposal
  supports both; do not automatically assign every team mentor as a personal mentor.
- Confirm whether KRITI includes non-student members or external mentors. Current
  Google sign-in is restricted to configured BITS domains; external access needs
  an explicit invitation/authentication policy.
- Select the first request categories and responsible approvers. Campus leave,
  wellness grievances, and gate passes remain reference features unless requested.
- Confirm who can read shared and private mentorship records and organisation reports.

These decisions refine the proposal; they do not justify discarding the working SVC app.

## Inspection and validation results

- TypeScript: npm run typecheck passed.
- Automated tests: 146 tests passed across 7 suites; temporary test databases were used.
- ESLint: npx eslint . passed. The package's npm run lint command still points to
  next lint, which the bundled Next.js 16 documentation says to replace with ESLint CLI.
- Runtime: started the SVC app on localhost:3001; 123 of 124 read-only HTTP smoke
  checks passed. The failed check expects the exact pre-semester empty-attendance
  message. Investigate its current-data assumption before using it as a regression gate.
- The first smoke invocation hit an unrelated portfolio app on port 3000; its
  results were discarded after identifying the process and page title.
- Browser preview navigation timed out, so no visual or interactive browser
  verification is claimed. HTTP smoke checks do not prove client interactions or Google OAuth.
- Runtime warns that middleware.ts is deprecated in favour of proxy.ts. Include
  this migration and its route-protection verification in baseline maintenance.
- No production build, actual Google sign-in, email delivery, or deployment was verified.
- No application feature code or existing data was changed for this planning task.

Reference implementation files: src/lib/db/schema.ts,
src/lib/auth/permissions.ts, src/lib/auth/session.ts,
src/lib/services/cohort.ts, src/lib/services/teams.ts,
src/components/layout/app-shell.tsx, src/components/layout/nav-config.ts,
src/app/(public)/page.tsx, and src/app/(app)/dashboard/page.tsx.
