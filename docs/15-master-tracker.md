# Master Tracker

Programmes and projects now open into a spreadsheet-style tracker. The directory
shows compact rows with stage, responsible leads, visible open work and latest
activity. Descriptions and people/access controls are in a side panel. Existing
programme stages start as “Set stage”; the migration does not guess business
status or event dates.

The tracker contains existing task records plus activity, milestone, decision,
website update, field story, reference and related-tracker rows. Tasks retain
their original owner/reviewer, visibility, submissions and review transitions;
they are the same records seen in My Work. Creating a task from a tracker carries
its programme and related-sheet context into the ordinary Work form. Moving work
to another programme clears an old sheet placement unless a valid new placement
is explicitly supplied.

Members can add their own tracker records. A record's author, responsible person,
or programme management can edit it. Assigning records to other people and
managing columns/related trackers require programme management. Existing Head
and technical configuration permissions remain in force. Programme access is
checked again by services for every read, edit, upload and download.

Status, responsible person, date and custom values can be edited in table cells.
Long notes, links and uploads open in a row panel. Custom columns support text,
dates, numbers and links; each tracker can have up to 12. Displayed columns can
be hidden for the current view. Tables support search, type filters, sorting,
25-row display pages and horizontal scrolling within the table on phones.
Archiving/restoring a row is recoverable and retains its history and attachments.

Related trackers use the same programme membership, with their own columns and
rows. A linked row opens each child tracker. Users can also attach HTTPS links
to Google Docs, Sheets, Drive folders, websites, or links to KRITI records.
External documents retain their provider's access controls. The application
records website/story status and published links; it does not publish content
to the public KRITI website.

Tracker attachments use the existing private Blob store in production and local
database storage in development. Up to three supported files of 5 MB each can be
added per save. Tokens are owner/programme/path/size bound, finalization validates
private bytes and claims each reservation once, and downloads check current
programme access. Old attachments remain available when newer versions are added.
The existing daily cleanup job includes expired unclaimed tracker uploads.

Change history records actor and save time separately from the entered event
date. It retains snapshots of row notes, status and custom values. It also
includes existing Work events only for tasks the requesting user may read.
Edits use version checks; stale/failed saves retain the browser draft. New-row
IDs make exact retries safe after a lost response.

Ideas appear as a Master Tracker tab only for `head`, `associate_head` and
`nucleus`. Other roles, including an Intern with the technical `super_admin`
account role, receive no ideas in service queries and cannot create/read/share
them through direct routes or actions. Sharing choices are limited to active
members of those three roles. Existing private/shared idea scopes remain in
force within the allowed roles. Head activation remains required to turn an
idea into an initiative. Existing idea records are retained unchanged.

Migration `0011_dry_xorn.sql` adds tracker structures and placement metadata
without deleting existing programmes, work, files, memberships or ideas.
Verification uses isolated migrated databases and the guarded
`npm run test:tracker-browser` fixture, including the 5 MB private file flow,
inline editing, nested trackers/tasks, stale edits, retries, Ideas denial,
row ownership, archive/restore and mobile layout.
