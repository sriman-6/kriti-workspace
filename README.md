# KRITI Workspace

A central workspace for KRITI: scoped programme access, task delegation, private
work submissions, versioned reviews, progress updates and notifications.

The former SVC management application has been retired at the user's request.
Its screens, services, source data and course-specific tables have been removed.
Historical migrations remain so existing installations can upgrade safely.
The pre-change local data and notes are archived under
`.backups/pre-kriti-workspace/` (gitignored).

## Current working release

- A minimal dashboard, Work, Programmes, People, Meetings, Ideas and Groups.
- Head oversight across official work; programme leads/managers delegate only
  within assigned programmes. Members see their assignments, own work and work shared with them.
- Every member can create their own work, choose additional viewers across active KRITI
  members, and change visibility later. Head and programme oversight remain in place.
- Delegated tasks have a distinct named reviewer. Review is optional for self-created
  work; completion without review is recorded as the owner's completion, not acceptance.
- Programme creation is limited to Head, Associate Head, Nucleus Member, Manager and
  Program Head responsibilities. Intern, Administrative Support and Student accounts
  cannot create programmes by default, including when they have technical administration access.
  A separately audited account-specific grant can enable programme creation without
  changing the person's KRITI responsibility. The existing Intern account has this
  explicit user-requested grant; other Intern accounts do not.
  Creators become leads of their new programmes; other programme access stays scoped.
- Assignment editing, deadlines, priority, progress/blockers and comments/history.
- PDF, Word, Excel, PowerPoint, image, CSV and text uploads; HTTPS work links,
  including Google Docs/Sheets/Drive. Three files of up to 5 MB per version.
- Named-reviewer acceptance or change requests; earlier versions and feedback
  remain intact. Stale browser submissions cannot silently overwrite newer work.
- Private, authorised downloads and in-app assignment/review notifications.
- Account and programme responsibility setup; BITS Google sign-in, dark mode,
  responsive layouts, pending/error/empty states.
- Head, Program Head, Manager and Administrative Support can register new members
  from People. Delegated onboarding creates Interns or Student Members; changes to
  existing accounts and senior responsibilities require Head/technical-admin access.
- External Google addresses require explicit approval for the exact registered
  account. Unregistered, unapproved and disabled accounts cannot sign in.
- Private work groups with messages, threads, clickable work links, pinned
  decisions, membership controls, archive/restore and five-second active-view
  refresh. Message drafts are preserved while other people post.
- Meetings with explicit India/Dubai timezones, conflict checks, participant
  responses, rescheduling/cancellation, minutes and private calendar exports.
- A private-by-default ideas notebook with selected sharing. Head activation
  creates an initiative workspace and an accountable lead with scoped task access.
- A searchable files/links library that retains the originating assignment,
  submission version, uploader and review status.

Email delivery, automatic Google Calendar/Meet provisioning, nested project
structures and expanded reporting remain follow-up work. The sidebar exposes
working features only. Group refresh uses polling, not a WebSocket service.
The [role/screen blueprint](docs/12-kriti-role-screen-blueprint.md) describes the
broader product; the standalone scope update at its top takes precedence.

## Run locally

```sh
npm install
npm run setup
npm run dev -- --port 3001
```

Google sign-in requires `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and a matching
redirect URI (`http://localhost:3001/api/auth/callback` for that port). Use a strong
`SESSION_SECRET`; `.env.example` lists the configuration. An authenticated BITS
identity must also have an active account. An external Google identity additionally
requires approval on that exact account. An email domain alone grants no access.

The provided Head account is `head.kriti@bits-pilani.ac.in`. The existing user's
KRITI profile is Intern; their explicit technical administration capability is
retained separately. No programme assignments or operational tasks are invented.
Nine further team members were provisioned from user-confirmed names and emails;
there are 11 active configured accounts. Student onboarding was explicitly deferred.

For the first Head account on an existing local installation with an active
technical administrator, stop the application and run:

```sh
npx tsx scripts/provision-workspace.ts --actor ADMIN_EMAIL --name "Head name" --email HEAD_EMAIL --role head
```

After that, use People to add responsibilities and Programmes to assign scope.
For an explicitly approved external Google account, the local provisioning command
requires `--allow-external-google`; the same approval is an explicit checkbox in People.
For a fresh, empty database, explicitly initialise the first Head/administrator:

```sh
npx tsx scripts/provision-workspace.ts --bootstrap-admin --name "Head name" --email HEAD_EMAIL --role head
```

This bootstrap refuses to run once any account exists. `setup` does not seed dummy users.

## Data and deployment

Drizzle/Postgres schema; embedded PGlite for local development when `DATABASE_URL`
is absent, and postgres.js for a configured Postgres connection. The production
application needs a managed Postgres database, real OAuth credentials and a secret.

**Only one process may access a given PGlite directory at a time.** Stop the dev
server before migrating or provisioning. Do not reset data to fix an application
error. `KRITI_LOCAL_DB_DIR` selects an isolated directory for verification; tests
and HTTP fixtures never need the working database.

Local development stores uploads as private Postgres `bytea` records in the same
transaction as their submission. Existing database attachments remain readable.
Shared document links do not automatically grant Google Drive access.

### Private uploads on Vercel

Set `WORK_FILE_STORAGE=vercel-blob` and connect a **private** Vercel Blob store.
Configure its `BLOB_READ_WRITE_TOKEN` as a server-only environment secret. This
SDK's client-token API requires that token; `BLOB_STORE_ID` and OIDC alone do not
authorize this upload flow. Do not expose the token through a `NEXT_PUBLIC_` key.

The browser sends each file directly to private Blob, retaining three files of
up to 5 MB each without putting those bytes through a Server Action request.
The app reserves owner/task/version-specific upload paths, issues five-minute
tokens with overwriting disabled, and re-reads and validates the private bytes
before attaching them to a submission. Claims and submission history are saved
atomically. Failed form validation can reuse already uploaded files; stale,
expired, duplicated or someone else's upload references are rejected.

Downloads for both storage types stream through the authenticated application
route. Raw storage URLs are not published in work pages or the library. Back up
the hosted database **and** the private Blob store once cloud storage is in use.

Set a separate, random `CRON_SECRET` of at least 32 characters on Vercel. The
daily job in `vercel.json` calls `/api/cron/uploads`; it removes only unclaimed
uploads whose one-hour reservation expired more than a day ago, in batches of
100. Submitted files are retained. Direct uploads require JavaScript; links and
the existing minimal work form remain available alongside files.

Migration `0009` adds pending-upload metadata and a private Blob reference to
files, preserving existing file bytes. Apply migrations before starting the
updated app (`npm run db:migrate`, with the local app stopped for PGlite).
Vercel also requires a hosted Postgres database and the production auth settings;
never use the local PGlite directory as deployed storage. Cloud provisioning and
a live private-store upload test are separate deployment steps.

## Checks

Use Node.js 24 for development and deployment. Install the checked-in dependency
tree with `npm ci`. Scoped overrides replace vulnerable transitive tooling:
Drizzle's legacy esbuild loader uses esbuild 0.25.12, and the TypeScript ESLint
parser uses minimatch 11.0.3. Vercel's CLI configuration dependency shares the
patched application Zod version. Keep these overrides until upstream dependencies
adopt patched versions; verify migration generation and linting when changing them.

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

For read-only checks against the local working app, run
`npx tsx scripts/workspace-state.ts` with the app stopped, then start the app and
run `npm run smoke`. The state check prepares a local account manifest; no secrets
are written to it. A session secret stays in `.env.local`, which is gitignored.

Integration tests migrate disposable PGlite databases. A full HTTP check exercises
the actual Server Action forms with separate Head, owner, reviewer and outsider
sessions, uploads a PDF, checks download access, requests revision, resubmits a
Google link, and accepts it. It also checks private groups/messages, idea sharing
and activation, meeting invitations, RSVP, calendar export and minutes. It also
exercises self-created work, multiple selected viewers, completion without
review, removal of viewer/file access, and rejection of intern programme creation.
To run it,
choose a **fresh** fixture directory:

```powershell
$env:KRITI_LOCAL_DB_DIR='.backups/http-check-UNIQUE'
npx tsx scripts/workspace-http-fixture.ts
npm run dev -- --port 3002
# In a second terminal, with the same directory:
$env:KRITI_LOCAL_DB_DIR='.backups/http-check-UNIQUE'
$env:SMOKE_URL='http://localhost:3002'
npx tsx scripts/workspace-http-check.ts
```

Stop this isolated server before starting the working app. These HTTP checks
exercise server-rendered forms and mutations; they do not substitute for a real
Google OAuth login or an interactive browser accessibility review.

For the direct-upload form's hydrated browser check, restart the isolated HTTP
server with `WORK_FILE_STORAGE=vercel-blob`, then run `npm run test:uploads-browser`
with the same `KRITI_LOCAL_DB_DIR`. It uses installed Chrome by default; select
another installed Playwright channel with `PLAYWRIGHT_CHANNEL`. The check verifies
that client/server validation failures preserve drafts and file selection, then
completes link-only work. It makes no calls to a real Blob store. File transport,
token constraints, streamed reads and upload ownership are covered separately by
the unit/integration suites; verify an actual private-store upload after provisioning.

## Structure

`src/app/` owns routes and Server Actions; `src/components/workspace/` owns the
minimal work UI; `src/lib/services/workspace.ts` enforces access and transitions;
`src/lib/schemas/work.ts` validates input; `src/lib/db/` owns schema and migrations.
Presentation components never import the database directly.
