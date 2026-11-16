# Group conversations

The Groups discussion view uses the available workspace height, with a fixed
group header and composer and a separately scrolling conversation. The group
list collapses on desktop and opens as a drawer on phones. It includes unread
message counts, mention counts, recent-message previews and a group-name filter.

Messages use initial avatars, date separators and grouped consecutive updates
from the same author. Reply, react and pin controls appear on hover or keyboard
focus; phones use the message menu. Threads, pinned decisions, shared files and
links, search and membership settings open in side panels. Opening a panel
preserves the main conversation and its draft.

The composer supports Enter to send, Shift+Enter for a newline, keyboard-selected
mentions, bold/code text, safe HTTPS links and three attachments of up to 5 MB
each. Supported formats match Work: PDF, Word, Excel, PowerPoint, CSV, text, PNG
and JPEG. A failed send retains the draft and files. Message IDs make retries
idempotent, including when the response was lost after a successful save.

“Create work from message” opens the normal Work form with a prefilled title and
brief. The creator reviews its owner, reviewer, viewers and programme before
creating work. Existing delegation rules apply. Sharing a task does not grant
access to the original private group.

Only active group members can read messages, search history, post, react or
download attachments. Only the creator manages membership, group details,
archive/restore and pinned decisions. Other members can leave. Archived groups
retain readable history and files but cannot receive new messages or reactions.
The creator remains responsible for the group and can archive it instead of
leaving. Removing a member revokes file access as well as conversation access.

Migration `0010_organic_human_fly.sql` adds mention IDs, reactions and attachment
reservations. It preserves existing messages, membership and pins. Hosted file
bytes go directly to the existing private Blob store; local development stores
validated bytes in the isolated local database. Downloads always use an
authenticated application endpoint. Unclaimed uploads expire and the existing
daily cleanup job removes them after an additional day of grace.

Visible conversations poll every five seconds, including while a draft is being
typed. This release does not add a WebSocket service or send email/push
notifications. Mentions appear as unread badges within Groups. Read markers
advance through the last message loaded when “Mark read” is selected, so later
arrivals are not silently marked read.

Verification includes service tests against migrated disposable Postgres
databases and `npm run test:chat-browser` against a separate local fixture.
The browser check covers hydration, keyboard entry, draft preservation during
refresh, a lost-response retry, mentions, reactions, pins, threads, private file
downloads, shared links, full-history search, Work prefilling, renaming, mobile
navigation, keyboard focus and denied outsider access. Test fixtures never run
against the working database or production.
