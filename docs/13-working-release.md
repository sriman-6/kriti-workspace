# KRITI standalone working release

13 November 2026. Built in the existing Desktop workspace after the approved
role/screen plan; the user subsequently requested complete retirement of SVC.

## Delivered

- Minimal, role-aware dashboard and navigation; secondary actions use expandable sections.
- Head oversight and programme-scoped delegation; distinct owner, assigner and reviewer.
- All members can create their own work, set deadlines and select additional viewers
  across active KRITI members. Visibility can be updated even after completion. Existing
  owner/creator/reviewer, Head and programme oversight permissions remain in effect.
- Reviewers are optional for self-created work. Owner-recorded completion without review
  is distinguished from reviewer acceptance; a written completion update is sufficient
  when no reviewer is selected. Delegated work still requires a distinct reviewer.
- Only Head, Associate Head, Nucleus Member, Manager and Program Head responsibilities
  can create programmes, independently of technical admin capability. Creators become
  leads of their new programmes and can configure that programme's members.
- An explicit, audited account-specific programme-creation grant was subsequently
  requested for the existing Intern account. Its Intern responsibility is unchanged;
  other Intern/Administrative Support/Student accounts keep their default restriction.
  Migration 0008 stores this grant in the workspace profile, defaulting to false.
  `scripts/set-programme-creation.ts --actor ADMIN_EMAIL --email MEMBER_EMAIL --revoke`
  removes an account exception without changing responsibilities or existing memberships.
- Tasks, due dates, search/filter views, assignment editing, blockers, comments and history.
- Private file uploads and HTTPS links, immutable submission versions, requested revisions,
  named-reviewer decisions, stale-update protection and in-app work notifications.
- A searchable submission library with private downloads and original task context.
- Account/responsibility setup and active/disabled sign-in; programme membership setup.
- Meetings with explicit IST/GST times, conflict protection, RSVP, rescheduling, cancellation,
  minutes, calendar export and an authorised follow-up assignment path.
- Private work groups, threaded text discussion, clickable HTTPS links, creator-managed
  members, pinned decisions, archive/restore, activity markers and active-view polling.
  Drafts are retained when new messages arrive.
- Private-by-default ideas, selected sharing, author-controlled editing and Head activation
  into an initiative with a named lead and corresponding delegation scope.

Head and Intern accounts are provisioned using the user-confirmed identities. Nine
additional confirmed team members were onboarded on 14 November 2026: two Associate
Heads, four Nucleus Members, one Program Head, one Manager and Administrative Support.
There are 11 active configured accounts. Students were explicitly deferred. No
operational tasks, meetings, groups, ideas or unverified team accounts were seeded.
Other KRITI roles can be configured in People and granted scope in Programmes.

At the user's subsequent explicit request, a labelled **[TEST] KRITI Workflow Pilot**
programme was created in the actual local workspace. Two programme tasks and one general
self-created test task are completed, with four submission versions and three stored CSV files. Programme/task creation and the
initial upload were exercised in the signed-in browser; role transitions used a synthetic
local reviewer. No real colleague was used to approve test work. The synthetic reviewer
was disabled and removed from programme access afterward. At the user's cleanup request,
the labelled programme, three tasks, four submission versions, three files, ten test
notifications, task history and synthetic reviewer were removed from the working database.
A cleanup audit and private backups remain. All 11 real configured accounts and the
user's account-specific programme-creation grant were verified unchanged.

Head, Program Head, Manager and Administrative Support have member-onboarding access
in People. Delegated onboarding can create new Intern/Student accounts; existing-account
changes and senior responsibility grants remain with Head/technical administrators.
The user-confirmed Administrative Support Gmail address has explicit external-Google
approval. Approval is per registered address, not a domain-wide Gmail exception.
Google email verification, active registration and OAuth state checks remain mandatory.
Migration 0007 adds the approval flag, defaulting to false for existing accounts.

## SVC retirement and data

The course routes, services, assessment/attendance logic, source CSVs, obsolete tests
and course documentation were removed. The standalone schema has 16 current tables.
An incremental migration drops the 11 course-specific tables and course-only enum
values, retires the SVC programme, and disables course-only accounts without configured
KRITI responsibilities. Historical migrations remain for existing installations.

The original database and source notes are backed up in `.backups/pre-kriti-workspace/`.
Before retirement, all 12 original table counts and record hashes were compared across
the additive workspace migration and matched. Retirement was then explicitly authorised.
The backup is not part of Git or any public application route.

## Verification

- 76 automated tests across identity, work and collaboration behaviour, including
  self-created work, cross-programme sharing, revocation and all eight role restrictions
  for programme creation.
- Callback tests cover approved/unapproved/unregistered external Google identities,
  disabled accounts, unregistered BITS identities and forged OAuth state. Onboarding
  tests cover all eight roles, senior-role escalation attempts and explicit email approval.
- All 89 read-only smoke checks passed across the 11 real configured accounts.
  Isolated HTTP tests verified Program Head, Manager and Administrative Support member
  creation forms, explicit external email approval and rejection of forged Head grants.
  The signed-in browser showed all 11 expected people and the updated registration form.
- TypeScript, ESLint and optimized Next.js production build passed.
- An isolated database was migrated from scratch. HTTP checks exercised the real Server
  Action forms through assignment, PDF upload/download, denied outsider download, revision,
  link resubmission and acceptance, preserving feedback and historical versions.
- The same HTTP flow checked private groups/messages, private and shared ideas, initiative
  activation and lead scope, meeting invitation/RSVP, private calendar download and minutes.
- HTTP checks also exercised self-creation with multiple viewers, unreviewed completion,
  shared file downloads, revoked page/library/file access and server rejection of intern
  programme creation. The signed-in Intern browser showed the Create work form, searchable
  sharing controls and no programme creation form. Migration 0006 adds viewer IDs and
  allows a missing reviewer without changing existing assignments.
- Retired course routes were checked with an authenticated session and returned 404.
- Live Google sign-in completed with the registered Intern BITS account and reached the
  authenticated dashboard. Overview, Work, Programmes, People, Meetings, Ideas, Groups
  and Files & links were checked in that real browser session. The mobile dashboard and
  navigation were inspected at 390 px; the mobile account menu's accessible name was fixed.
  Mutating work and collaboration flows were verified through isolated HTTP tests.
- A dedicated Google Cloud project (`kriti-workspace`) and OAuth web client
  (`KRITI Local Workspace`) were created under the KRITI-owned Google account.
  The only redirect URI is `http://localhost:3001/api/auth/callback`. Credentials are
  stored in the ignored `.env.local` file. The live flow completes without the previous
  redirect mismatch. The restarted app passed all 17 read-only workspace smoke checks.

## Practical limits and remaining work

- This is a local working release, not a hosted deployment. Google OAuth callback URLs must
  match the actual host/port. Wider rollout still needs real team onboarding and a full
  interactive browser/accessibility pass with populated programme data and every role.
- Pilot uploads use private Postgres `bytea` storage (3 files, 5 MB each per submission).
  Private object storage is a later volume upgrade; do not introduce public file URLs.
- Group messages refresh every five seconds while the view is visible and the user is not
  typing. There is no WebSocket/push service, voice/video calling or automatic email delivery.
- Meeting links are supplied by the organiser; calendar entries are downloads. Google
  Calendar/Meet provisioning is not configured.
- Initiative workspaces reuse the programme membership/task mechanism. Nested projects,
  advanced portfolio reporting, custom multi-stage approvals and governance views remain later work.
- Compatible dependency updates moved Next.js to 16.4.6 and resolved its reported critical
  advisory. The remaining npm audit findings include major-version upgrades for Drizzle,
  Zod and Vitest/tinypool, plus development-tool dependencies. Review these deliberately
  before production deployment; no forced major-version upgrade was applied.

Suggested commit: `feat: replace SVC with standalone KRITI workspace and collaboration flows`
