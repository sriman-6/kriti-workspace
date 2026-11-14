# KRITI workspace — role and screen blueprint

> **Standalone scope update, 13 November 2026:** The user explicitly removed
> SVC from the product. References below to retaining or integrating SVC are
> historical and superseded. KRITI is now a standalone workspace. The current
> working release includes delegation, uploads/links, versioned reviews, programme
> scope, people setup, work updates, notifications, private group discussions,
> meetings, an ideas notebook and initiative activation. Nested project hierarchy
> and expanded reporting remain later work. Screens should
> stay minimal, using progressive disclosure for secondary details and actions.

Planning revision: 13 November 2026. No application implementation is included.

## Confirmed scope and evidence

The user wants a KRITI-wide system for oversight, task delegation, meetings,
rough ideas and new initiatives, work submissions, and groups for communication.
Screens must reflect the responsibilities of each role, starting with Head, KRITI.

Explicit clarifications from this conversation:

- The Intern receives assignments and reviews from multiple people depending on the work.
- Both the Program Head and Manager oversee only specifically assigned programmes.
- Propose useful Nucleus Member responsibilities; do not leave the role undefined.

The [official team page](https://kriti.bits-pilani.ac.in/team.html?fromPage=1),
retrieved on 13 November 2026, lists Head, Associate Heads, Nucleus Members,
Program Head, Manager, Administrative Support, Intern, and Student Team. It also
lists the Vice Chancellor, Campus Directors, and Steering Committee. Its short
descriptions associate Associate Heads with campus operations, Nucleus Members
with research and teaching, and the operational roles with programme delivery
and administration. It does not establish internal reporting lines or software
permissions. Those below are proposals except where explicitly confirmed above.

The page identifies Prof. Tribeni Roy as Head; Prof. Joyjit Mukherjee and Prof.
Anasuya Ganguly as Associate Heads; Sk Aref Abdal as Program Head; Ankit Bhargava
as Manager; Monika Shirswal in Administrative Support; and Sriman Goud Panjala
as Intern. Directory entries inform onboarding; they must not automatically
create accounts or grant access. Names and roles remain editable records.

## The shared work model

KRITI contains programmes and initiatives. An initiative may be exploratory
before becoming a programme/project. Projects contain tasks. Each task has a
responsible owner, optional contributors, assigner, reviewer, due date, priority,
status, comments, and work submissions. Standalone tasks can exist without
forcing a programme or project, including confidential leadership work.

One task has one accountable owner and one current reviewer. Other people can
collaborate or advise. Multi-stage review is added only for workflows that need
it. Record reassignment and reviewer changes in history. Leadership can assign
work across programmes; programme roles delegate within their granted scope.

Meetings, discussions, files, and decisions link to this work. A file submitted
to a task appears in the same task for its owner, reviewer, and authorised lead.
Do not maintain separate copies for different dashboards.

Proposed task flow: Draft -> Assigned -> In progress -> Submitted for review ->
Completed. A review can return Changes requested; the next submission creates a
new version. Blocked, Cancelled, and Archived are explicit states. Completed
means accepted by the reviewer where review is required. Overdue is derived
from due date and completion, rather than a manually chosen status.

## Proposed responsibility and access model

| Role | Responsibility | Default work scope | Delegation and review |
|---|---|---|---|
| Head, KRITI | Set direction, oversee delivery and workload, allocate responsibility, resolve escalations | All official KRITI work and its progress | Assign/reassign across KRITI; name reviewers; review or explicitly take over a review with history; manage leadership delegation |
| Associate Head | Lead campus delivery and selected cross-campus initiatives; surface risks to Head | Own campus programmes and explicitly delegated portfolios | Assign and review within that portfolio; propose initiatives; escalate beyond scope |
| Nucleus Member | Faculty lead or subject adviser for selected initiatives; connect research/teaching to delivery | Own tasks, allocated projects, associated teams and deadlines | As project lead, plan/delegate/review within the project; as adviser, comment and recommend with final acceptance held by the named reviewer |
| Program Head | Plan and deliver assigned programmes, coordinate milestones and project leads | Specifically assigned programmes only (confirmed) | Assign/review work within those programmes; propose scope or milestone changes |
| Manager | Coordinate execution, logistics, partnerships, follow-ups and operational blockers | Specifically assigned programmes only (confirmed) | Delegate and review authorised operational work; coordinate meetings and escalate resource needs |
| Administrative Support | Carry out assigned scheduling, documentation, records and administrative requests | Assigned tasks, groups, and explicitly shared programme records | Submit work; manage designated logistics; no default authority to accept programme deliverables or allocate roles |
| Intern | Execute work from multiple assigners and keep deliverables current | Own tasks across assigners, joined projects/groups, relevant meetings | Submit versions, respond to feedback, propose ideas, flag blockers; reviewer follows each task rather than a single reporting manager |
| Student Team Member | Contribute to assigned activities/projects and track personal/team commitments | Own tasks and joined projects/groups | Submit work and updates; a designated project lead may receive a scoped delegation grant |

Nucleus Members are proposed as faculty initiative leads/advisers, not general
administrators. Their home should emphasise their projects, review requests,
student contributions, milestones, meetings, and own commitments. A person can
lead one project and advise another without receiving organisation-wide access.

The Program Head and Manager are distinct responsibilities in the same scoped
programme; do not infer that one automatically supervises the other. Task reviewer
and escalation owner make accountability explicit. Associate campus scope and
Head delegation still need operational validation during the pilot.

Institutional leaders and Steering Committee members do not automatically need
daily operational accounts. A later governance view can expose approved summaries,
milestones and meeting packs when invited, with separately granted access.

Role title, programme membership, project responsibility, and group membership
are separate grants. A person may hold several grants with one login. Technical
account maintenance is a separately delegated capability, not a consequence of
being the person implementing the software.

## Screen inventory: Head first

All role experiences share navigation conventions and components, while their
home layouts, default filters, available actions, and visible records differ.
Below is the initial complete screen inventory for the requested scope.

| # | Screen | Purpose and primary content | Role adaptation |
|---|---|---|---|
| 1 | Sign in and access state | BITS Google sign-in, invitation/account matching, access-denied and inactive-account states | Resolve all responsibilities into one account; no free choice of privileged role |
| 2 | Head overview | Programme health, overdue/blocked tasks, pending reviews, milestones, next meetings, recent decisions; quick Assign task, Schedule meeting, Capture idea | Head sees all official work; drill into any number to its underlying list |
| 3 | Associate Head overview | Campus/delegated initiative progress, workload, deadlines, reviews, escalations and meetings | No unrestricted organisation roll-up |
| 4 | Nucleus overview | Initiatives led/advised, own work, team contributions, next milestones, review queue, upcoming meetings | Project lead actions differ from adviser actions |
| 5 | Program Head overview | Assigned programme milestones, project health, owner coverage, submissions awaiting review, delivery risks | Assigned programmes only |
| 6 | Manager overview | Assigned programme execution, logistics, follow-ups, blocked tasks, operational reviews and meeting preparation | Assigned programmes only; prioritise operational action |
| 7 | Administrative Support overview | Today's administrative work, schedule actions, requested documents, pending confirmations, own deadlines | Assignment and explicitly shared record scope |
| 8 | Intern overview | Tasks grouped by assigner/programme, Today/This week/Overdue, review feedback, quick Submit work, upcoming meetings | Cross-assigner personal view with a named reviewer on every reviewed task |
| 9 | Student member overview | Own/team tasks, deadlines, submissions and feedback, meetings, relevant announcements | Enrolled SVC students additionally get their permitted course records |
| 10 | People and workload | Search people; per-person assigned/open/overdue/blocked/review tasks; upcoming commitments and programme filters | Head sees all; others see permitted teams. Activity counts measure work state, not automatic performance rankings |
| 11 | Person work profile | Responsibilities, permitted programmes/projects, assigned tasks, deliverables and meetings relevant to viewer | Includes own profile/preferences. Never expose private notes or unrelated meetings through a person lookup |
| 12 | Programmes index and programme workspace | Overview, projects, members, milestones, tasks, calendar, files, discussions, activity | Each tab observes programme scope and any more restrictive task/file visibility |
| 13 | Initiative/project workspace | Goal, owner, members, milestones, tasks, deliverables, issues, meetings, decisions and project discussion | Faculty lead/adviser modes; controlled cross-campus collaborators |
| 14 | My Work / All Work | List and board, search, owner/assigner/reviewer/programme/status/priority/due filters, saved personal views later | Personal focus for contributors; delegated/all-work views for leads and Head |
| 15 | Create/edit task and task detail | Brief, expected output, owner, contributors, reviewer, dates, priority, linked work, dependencies where needed, comments, blockers, submissions and history | Show only people/targets the assigner may delegate to; owner edits progress and submits, reviewer decides |
| 16 | Ideas notebook and idea detail | Quick rough note, rich text, links/files, tags, author, private/shared visibility, comments, status and Convert to initiative | Head has a prominent notebook; others may propose ideas. No requirement to complete a project form to capture a thought |
| 17 | Calendar and meeting detail | Agenda, participants, availability/conflicts, time and timezone, room/link, attachments, RSVP, reschedule/cancel, minutes, decisions and action items | Personal/authorised team views; scheduling authority follows role/delegation and invitation rules |
| 18 | Submit Work and submission history | Choose task, upload files or add links, summary, version, submitted time, review status, feedback and resubmit | Available to every contributor, including senior roles when they own work |
| 19 | Review inbox and review detail | Assigned review queue; brief versus submitted version; preview/download/open link; comments; accept or request changes with reasons | Named reviewers and explicitly delegated reviewers; Head can inspect official deliverables without silently impersonating reviewer |
| 20 | Groups and discussion | Joined groups, create group, member picker, messages, threads, mentions, files/links, pinned decisions, group settings and archive | Membership controls conversation access; task access still checked when linked in a group |
| 21 | Work library | Search/filter files and links by programme/project/task/uploader/type/date, current version, review status, provenance | One personal entry point; only authorised work. Submitted files remain attached to their original task/version |
| 22 | Notifications and inbox | Assignments, mentions, review feedback, due reminders, meeting changes; unread/read and actionable links | Relevant events only; avoid sending the same notice through every channel |
| 23 | Reports and escalation view | Progress by programme/person, milestone risk, overdue work, review ageing, completion trends, exports, decisions needing attention | Head sees KRITI; delegated leads see their scope; no private discussion text in reports |
| 24 | People, permissions and workspace settings | Invite/disable accounts, role/scope grants, programme/project membership, delegation, audit events, archive controls | Restricted to Head and explicitly authorised administrators; destructive changes have reviewable consequences |

Task forms, submission/review details, group creation, and meeting editors can be
drawers/dialogs rather than separate full-page routes. Final wireframes should
show the distinct user states: empty, loading, error, no access, overdue, blocked,
submitted, changes requested, accepted, cancelled and archived.

## The Head's primary experience

The Head's landing screen should answer: What is happening across KRITI? Who owns
it? What is late or blocked? What requires my decision? What is next?

Recommended order: attention list and quick actions; programme/initiative progress;
people and workload; pending decisions/reviews; upcoming meetings; recent work
and ideas. Every summary links to a filtered list. Selecting a person shows their
official assignments across programmes, deadlines, submissions and blockers.

The Head can create an idea in seconds, keep it private or share it with selected
people, then convert it to an initiative with an accountable lead. This preserves
the original idea and discussion. Initiative approval is separate from task review.

## One work-submission place

Provide a prominent Submit Work action and My Submissions view. Where launched
from a task, preselect that task. Offer Upload files or Add links, with an optional
summary. Support PDF, Word (.docx), Excel (.xlsx/.csv), and appropriate images or
presentations; support Google Docs, Sheets, Slides, and Drive links.

Store uploaded files in private object storage; keep metadata and associations
in Postgres. Set practical size/type limits, access-controlled downloads, upload
progress/failure/retry, and version history. PDF/image preview is an initial option;
Office files may download/open externally first. Do not promise an embedded Office
editor. A stored Google link does not grant the reviewer access; prompt the sender
to share it appropriately and let the reviewer report an inaccessible link.

Preserve each submitted version and its feedback. Replacing a working draft must
not overwrite a version already under review. A reviewer can accept or request
changes; the owner is notified; accepted work updates the task and leadership view.

## Slack-style groups, connected to work

Start with named, invitation-based groups with messages, threads, mentions,
attachments/links, unread indicators, pinned messages/decisions, membership
management and archive. Support programme/project groups and ad hoc groups, such
as an event planning group spanning roles. Members can create groups for work
they can access and invite eligible collaborators; cross-scope invitations that
would grant new work access require an authorised membership change.

Create task or Schedule meeting from a message using an explicit action. A chat
message containing an instruction is not automatically an assigned task. Link
decisions, work and follow-ups so chat does not become the only record of progress.

The Head's visibility into official KRITI work does not imply invisible access
to every private group or personal draft. Clearly label conversation membership
and access. Avoid duplicating group files into a less restricted shared library.
Start with groups; direct messages, voice/video calls, and a large integration
ecosystem can follow if needed. Real-time group text belongs in the initial scope,
with persistence, reconnect behaviour, and unread state.

## Revised implementation order

1. Finalise this screen/permission blueprint and wireframe the Head overview,
   task detail, Intern dashboard, Submit Work, Review inbox, meetings and group.
2. Deliver one complete delegation loop: shared identities and programme scope;
   Head or scoped lead assigns a task with reviewer; Intern receives it, submits
   a file/link; reviewer accepts or requests changes; Head sees the updated state.
   Include a minimal initiative/project context and important audit events.
3. Add the remaining role homes, programme/project management, workload views,
   faculty lead/adviser delegations, ideas notebook and expanded progress reports.
4. Add meetings with minutes/action items and group discussions tied to projects
   and tasks. Use notifications from the delegation loop across these features.
5. Expand the library, reminders, approvals, governance summaries if requested,
   and operational reporting; integrate the existing SVC features within their
   programme context and add student self-service without losing historical marks.
6. Pilot with representative roles, verify all access boundaries and core browser
   flows, then deploy with managed Postgres, private file storage, backups and
   dependable message/notification delivery.

This replaces the earlier mentorship-first priority. Mentorship remains a
programme capability, alongside KRITI-wide task and delivery management. Each
phase must remain runnable and finish a visible workflow across data, backend,
UI, validation and meaningful tests.

## Architecture implications

Retain the current Next.js/Drizzle service structure. The confirmed scope now
requires explicit users/person profiles, scoped role grants, programmes and
memberships, initiatives/projects and memberships, tasks and review assignments,
submission versions and file/link records, meetings and participants, groups and
members/messages, notifications and audit events. Private uploads need object
storage; realtime discussion needs a supported delivery mechanism with durable
messages. Choose providers during implementation, after deployment constraints
are known; this blueprint does not install or provision any service.

Existing SVC students/teams/cohort records must remain separate from general KRITI
project membership so changing a project team does not change historical grades.
Migrate existing identities and data incrementally using backups and an isolated
copy. All queries/actions/downloads/exports enforce scope on the server; hiding a
sidebar item is insufficient. Store responsibility grants as data, not names or
hardcoded email checks.

## Remaining proposals to validate in screen review

- Associate Head visibility: own campus plus delegated cross-campus initiatives.
- Nucleus faculty lead/adviser responsibilities as described above.
- Which programmes each Program Head and Manager is assigned to (scope is confirmed;
  actual assignments are not yet supplied).
- Who may finalise ideas into funded/active initiatives and when Head approval is needed.
- Private versus organisation-shared group policies and membership administration.
- File limits and any sensitive programme-specific document restrictions.

These are concrete proposed defaults to review, rather than undefined roles.
