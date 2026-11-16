'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  CheckCheck,
  ChevronDown,
  Files,
  Hash,
  LockKeyhole,
  PanelLeftClose,
  PanelLeftOpen,
  Pin,
  Search,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { plainMessage } from '@/lib/chat';
import type { ChatDetail, ChatGroup, ChatMessage } from '@/lib/services/chat';
import { ChatComposer, chatRequest } from './chat-composer';
import { ChatMessages } from './chat-messages';
import { ChatPanel } from './chat-panel';
import { ChatText } from './chat-text';
import { useChatFeed } from './use-chat-feed';

function GroupList({ groups, id, onNavigate }: { groups: ChatGroup[]; id: string; onNavigate?: () => void }) {
  const [search, setSearch] = useState('');
  return (
    <>
      <div className="flex h-16 shrink-0 items-center justify-between border-b px-4">
        <Link href="/groups" onClick={onNavigate} className="text-sm font-semibold">
          Groups
        </Link>
        <Link
          href="/groups?create=1"
          onClick={onNavigate}
          className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
        >
          New group
        </Link>
      </div>
      <div className="p-3">
        <Input
          aria-label="Find a group"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Find a group…"
          className="h-8 bg-background text-xs"
        />
      </div>
      <nav
        aria-label="Your groups"
        className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-3"
      >
        {groups
          .filter((group) =>
            group.name.toLowerCase().includes(search.toLowerCase()),
          )
          .map((group) => (
            <Link
              href={`/groups/${group.id}`}
              onClick={onNavigate}
              key={group.id}
              aria-current={group.id === id ? 'page' : undefined}
              className={`block rounded-lg px-3 py-2.5 hover:bg-accent ${group.id === id ? 'bg-accent' : ''}`}
            >
              <span className="flex items-center gap-2">
                <Hash className="size-3.5 shrink-0 text-muted-foreground" />
                <span
                  className={`truncate text-sm ${group.unread ? 'font-semibold' : 'font-medium'}`}
                >
                  {group.name}
                </span>
                {group.unread ? (
                  <span
                    className="ml-auto rounded-full bg-primary px-1.5 text-[10px] leading-4 text-primary-foreground"
                    aria-label={`${group.unread} unread messages`}
                  >
                    {group.unread > 99 ? '99+' : group.unread}
                  </span>
                ) : null}
              </span>
              <span className="mt-1 block truncate pl-5 text-xs text-muted-foreground">
                {group.archived
                  ? 'Archived'
                  : plainMessage(group.preview) || 'No messages yet'}
              </span>
              {group.mentions ? (
                <span className="mt-1 block pl-5 text-[10px] font-medium text-primary">
                  @ {group.mentions}{' '}
                  {group.mentions === 1 ? 'mention' : 'mentions'}
                </span>
              ) : null}
            </Link>
          ))}
      </nav>
    </>
  );
}

function Thread({
  groupId,
  root,
  owner,
  onError,
  onUpdate,
}: {
  groupId: string;
  root: ChatMessage;
  owner: boolean;
  onError: (text: string) => void;
  onUpdate: () => void;
}) {
  const feed = useChatFeed(groupId, null, root.parentId ?? root.id);
  const detail = feed.detail;
  const [error, setError] = useState('');
  async function action(input: object) {
    setError('');
    try {
      await chatRequest(groupId, input);
      await feed.refresh();
      const target = input as { messageId?: string; target?: string };
      if (target.messageId || target.target)
        await feed.refreshMessage(target.messageId ?? target.target!);
      onUpdate();
    } catch (cause) {
      const text =
        cause instanceof Error ? cause.message : 'Unable to update message.';
      setError(text);
      onError(text);
    }
  }
  return (
    <>
      {feed.error || error ? (
        <p role="alert" className="px-5 py-2 text-xs text-destructive">
          {feed.error || error}
        </p>
      ) : null}
      {detail ? (
        <>
          <ChatMessages
            messages={detail.messages}
            members={detail.members}
            owner={owner}
            archived={detail.group.isArchived}
            onAction={action}
            hasOlder={detail.hasOlder}
            loadOlder={feed.loadOlder}
            loadingOlder={feed.loadingOlder}
            parent={detail.parent}
            empty="No replies yet. Keep the discussion together here."
          />
          <ChatComposer
            groupId={groupId}
            parentId={root.parentId ?? root.id}
            members={detail.members}
            archived={detail.group.isArchived}
            onSent={(id) => {
              void feed.refreshMessage(id);
              onUpdate();
            }}
          />
        </>
      ) : (
        <p className="p-5 text-sm text-muted-foreground">Loading thread…</p>
      )}
    </>
  );
}

function SearchResults({
  groupId,
  search,
  onThread,
}: {
  groupId: string;
  search: string;
  onThread: (message: ChatMessage) => void;
}) {
  const feed = useChatFeed(groupId, null, undefined, search);
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
      {feed.error ? (
        <p role="alert" className="py-3 text-xs text-destructive">
          {feed.error}
        </p>
      ) : null}
      {!feed.detail ? (
        <p className="py-6 text-sm text-muted-foreground">Searching…</p>
      ) : (
        <>
          <p className="py-3 text-xs text-muted-foreground">
            {feed.detail.messages.length}
            {feed.detail.hasOlder ? '+' : ''} matching messages
          </p>
          <div className="space-y-2">
            {[...feed.detail.messages].reverse().map((message) => (
              <button
                key={message.id}
                className="block w-full rounded-lg border p-3 text-left hover:bg-accent"
                onClick={() => onThread(message)}
              >
                <span className="text-xs font-semibold">
                  {message.authorName}
                </span>
                <time className="ml-2 text-[10px] text-muted-foreground">
                  {new Date(message.createdAt).toLocaleDateString('en-IN', {
                    timeZone: 'Asia/Kolkata',
                  })}
                </time>
                <span className="mt-1 block whitespace-pre-wrap break-words text-sm">
                  <ChatText
                    text={message.body}
                    members={feed.detail!.members}
                  />
                </span>
                <span className="mt-2 block text-[10px] text-primary">
                  {message.parentId ? 'Open thread' : 'Open conversation'}
                </span>
              </button>
            ))}
          </div>
          {feed.detail.hasOlder ? (
            <Button
              variant="ghost"
              className="mt-3"
              size="sm"
              onClick={feed.loadOlder}
              disabled={feed.loadingOlder}
            >
              {feed.loadingOlder ? 'Loading…' : 'More results'}
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}

function SharedFiles({
  groupId,
  onThread,
}: {
  groupId: string;
  onThread: (message: ChatMessage) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [before, setBefore] = useState<string>();
  const [hasOlder, setHasOlder] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    void fetch(
      `/api/groups/${groupId}?resources=1${before ? `&before=${before}` : ''}`,
      { signal: controller.signal, cache: 'no-store' },
    )
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error ?? 'Unable to load files.');
        if (controller.signal.aborted) return;
        setMessages((previous) => {
          const rows = new Map(
            previous.map((message) => [message.id, message]),
          );
          for (const message of data.detail.messages as ChatMessage[])
            rows.set(message.id, message);
          return [...rows.values()].sort(
            (a, b) =>
              b.sortKey.localeCompare(a.sortKey) || b.id.localeCompare(a.id),
          );
        });
        setHasOlder(data.detail.hasOlder);
        setLoading(false);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) {
          setError(
            cause instanceof Error ? cause.message : 'Unable to load files.',
          );
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [groupId, before]);
  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
      <p className="text-xs text-muted-foreground">
        Files and links shared in this group. Only current members can download
        files.
      </p>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      {!loading && !messages.length ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          No shared files or links yet.
        </p>
      ) : null}
      {messages.map((message) => (
        <div key={message.id} className="space-y-2 rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">{message.authorName}</p>
          {message.files.map((file) => (
            <a
              key={file.id}
              href={`/api/groups/files/${file.id}`}
              download
              className="block break-words text-sm text-primary hover:underline"
            >
              {file.name}
            </a>
          ))}
          {[...new Set(message.body.match(/https:\/\/[^\s<>]+/g) ?? [])].map(
            (url) => {
              try {
                const parsed = new URL(url);
                if (parsed.username || parsed.password) return null;
                return (
                  <a
                    key={url}
                    href={parsed.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block truncate text-sm text-primary hover:underline"
                  >
                    {url}
                  </a>
                );
              } catch {
                return null;
              }
            },
          )}
          <button
            className="text-[11px] text-muted-foreground hover:underline"
            onClick={() => onThread(message)}
          >
            View conversation →
          </button>
        </div>
      ))}
      {loading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : hasOlder ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setLoading(true);
            setBefore(messages.at(-1)?.id);
          }}
        >
          Load more
        </Button>
      ) : null}
    </div>
  );
}

function GroupSettings({
  detail,
  contacts,
  userId,
  action,
}: {
  detail: ChatDetail;
  contacts: { id: string; fullName: string }[];
  userId: string;
  action: (input: object) => Promise<void>;
}) {
  const owner = detail.group.ownerId === userId;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [confirm, setConfirm] = useState<{
    label: string;
    input: object;
  } | null>(null);
  async function run(input: object) {
    setBusy(true);
    setError('');
    setSaved('');
    try {
      await action(input);
      setSaved('Saved');
      setConfirm(null);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Unable to save settings.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-5">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <LockKeyhole className="size-3.5" />
        Private group · {detail.members.length} members
      </div>
      {owner ? (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            void run({
              operation: 'rename',
              name: data.get('name'),
              description: data.get('description'),
            });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="chat-name">Name</Label>
            <Input
              id="chat-name"
              name="name"
              defaultValue={detail.group.name}
              required
              minLength={3}
              maxLength={120}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="chat-purpose">Purpose</Label>
            <Textarea
              id="chat-purpose"
              name="description"
              rows={2}
              defaultValue={detail.group.description}
              maxLength={1000}
            />
          </div>
          <Button size="sm" variant="outline" disabled={busy}>
            Save details
          </Button>
        </form>
      ) : (
        <p className="text-sm">
          {detail.group.description || 'A private space for work discussions.'}
        </p>
      )}
      <section>
        <h3 className="mb-3 text-xs font-semibold">Members</h3>
        <ul className="space-y-3">
          {detail.members.map((member) => (
            <li
              key={member.id}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <div>
                {member.fullName}
                {member.id === detail.group.ownerId ? (
                  <span className="block text-[10px] text-muted-foreground">
                    Group creator
                  </span>
                ) : null}
              </div>
              {owner && member.id !== userId ? (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() =>
                    setConfirm({
                      label: `Remove ${member.fullName} from this group? They will lose access to its messages and files.`,
                      input: { operation: 'remove', target: member.id },
                    })
                  }
                >
                  Remove
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
      {owner ? (
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            void run({ operation: 'add', target: data.get('target') });
          }}
        >
          <Label htmlFor="chat-invite">Add a member</Label>
          <select
            id="chat-invite"
            name="target"
            required
            defaultValue=""
            className="h-9 w-full rounded-md border bg-background px-2 text-sm"
          >
            <option value="" disabled>
              Choose a person
            </option>
            {contacts
              .filter(
                (person) =>
                  !detail.members.some((member) => member.id === person.id),
              )
              .map((person) => (
                <option key={person.id} value={person.id}>
                  {person.fullName}
                </option>
              ))}
          </select>
          <Button variant="outline" size="sm" disabled={busy}>
            Add member
          </Button>
        </form>
      ) : null}
      <div className="border-t pt-4">
        {owner ? (
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() =>
              detail.group.isArchived
                ? void run({ operation: 'restore' })
                : setConfirm({
                    label:
                      'Archive this group? Conversations and files stay available, and new messages will be paused.',
                    input: { operation: 'archive' },
                  })
            }
          >
            {detail.group.isArchived ? 'Restore group' : 'Archive group'}
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() =>
              setConfirm({
                label:
                  'Leave this group? You will lose access until the creator adds you again.',
                input: { operation: 'leave' },
              })
            }
          >
            Leave group
          </Button>
        )}
      </div>
      {confirm ? (
        <div role="alert" className="space-y-3 rounded-lg border p-3">
          <p className="text-sm">{confirm.label}</p>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={busy}
              onClick={() => void run(confirm.input)}
            >
              Confirm
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => setConfirm(null)}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      <p role="status" className="text-xs text-muted-foreground">
        {saved}
      </p>
    </div>
  );
}

export function ChatWorkspace({
  initial,
  initialGroups,
  contacts,
  userId,
  initialThread,
}: {
  initial: ChatDetail;
  initialGroups: ChatGroup[];
  contacts: { id: string; fullName: string }[];
  userId: string;
  initialThread?: ChatMessage | null;
}) {
  const router = useRouter();
  const feed = useChatFeed(initial.group.id, initial);
  const detail = feed.detail ?? initial;
  const groups = feed.groups ?? initialGroups;
  const [listOpen, setListOpen] = useState(true);
  const [mobileList, setMobileList] = useState(false);
  const [panel, setPanel] = useState<
    'settings' | 'search' | 'pins' | 'files' | null
  >(null);
  const [thread, setThread] = useState<ChatMessage | null>(
    initialThread ?? null,
  );
  const [search, setSearch] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [error, setError] = useState('');
  const owner = detail.group.ownerId === userId;
  async function action(input: object) {
    await chatRequest(detail.group.id, input);
    await feed.refresh();
    const target = input as {
      operation?: string;
      messageId?: string;
      target?: string;
    };
    if (
      target.operation === 'react' ||
      target.operation === 'pin' ||
      target.operation === 'unpin'
    )
      await feed.refreshMessage(target.messageId ?? target.target!);
  }
  async function messageAction(input: object) {
    setError('');
    try {
      await action(input);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Unable to update the message.',
      );
    }
  }
  function openThread(message: ChatMessage) {
    setPanel(null);
    setThread(message);
  }
  return (
    <div className="-mx-4 -my-6 flex h-[calc(100dvh-3.5rem)] min-h-0 overflow-hidden sm:-mx-6 lg:-mx-8">
      {listOpen ? (
        <aside className="hidden w-60 shrink-0 flex-col border-r bg-card/50 md:flex">
          <GroupList groups={groups} id={detail.group.id} />
        </aside>
      ) : null}
      <section
        className="flex min-w-0 flex-1 flex-col"
        aria-label={`${detail.group.name} group chat`}
      >
        <header className="flex min-h-16 shrink-0 items-center gap-2 border-b px-3 sm:px-5">
          <Button
            variant="ghost"
            size="icon-sm"
            className="hidden md:inline-flex"
            aria-label={listOpen ? 'Hide group list' : 'Show group list'}
            aria-expanded={listOpen}
            onClick={() => setListOpen(!listOpen)}
          >
            {listOpen ? (
              <PanelLeftClose className="size-4" />
            ) : (
              <PanelLeftOpen className="size-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="md:hidden"
            aria-label="Show group list"
            onClick={() => setMobileList(true)}
          >
            <PanelLeftOpen className="size-4" />
          </Button>
          <button
            onClick={() => {
              setThread(null);
              setPanel('settings');
            }}
            className="min-w-0 rounded-md px-1 py-1 text-left hover:bg-accent"
            aria-label={`Group details and members for ${detail.group.name}`}
          >
            <span className="flex items-center gap-1.5">
              <h1 className="truncate text-base font-semibold">
                {detail.group.name}
              </h1>
              <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
            </span>
            <span className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
              <LockKeyhole className="size-3" />
              {detail.members.length} members
              {detail.group.isArchived ? ' · Archived' : ''}
            </span>
          </button>
          <div className="ml-auto flex shrink-0 items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Search group messages"
              title="Search"
              onClick={() => {
                setThread(null);
                setPanel('search');
              }}
            >
              <Search className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Shared files and links"
              title="Files and links"
              onClick={() => {
                setThread(null);
                setPanel('files');
              }}
            >
              <Files className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Pinned decisions, ${detail.pinned.length}`}
              title="Pinned decisions"
              onClick={() => {
                setThread(null);
                setPanel('pins');
              }}
            >
              <Pin className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="hidden sm:inline-flex"
              aria-label="Group members and settings"
              title="Members and settings"
              onClick={() => {
                setThread(null);
                setPanel('settings');
              }}
            >
              <Users className="size-4" />
            </Button>
          </div>
        </header>
        {detail.group.description ? (
          <div className="flex shrink-0 items-center gap-2 border-b bg-muted/20 px-5 py-2">
            <p className="truncate text-xs text-muted-foreground">
              {detail.group.description}
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-6 shrink-0 gap-1.5 text-[11px]"
              disabled={!detail.latestId}
              onClick={() => {
                if (detail.latestId)
                  void messageAction({
                    operation: 'read',
                    through: detail.latestId,
                  });
              }}
            >
              <CheckCheck className="size-3.5" />
              Mark read
            </Button>
          </div>
        ) : (
          <div className="flex shrink-0 justify-end px-4 pt-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1.5 text-[11px]"
              disabled={!detail.latestId}
              onClick={() => {
                if (detail.latestId)
                  void messageAction({
                    operation: 'read',
                    through: detail.latestId,
                  });
              }}
            >
              <CheckCheck className="size-3.5" />
              Mark read
            </Button>
          </div>
        )}
        {error || feed.error ? (
          <div
            role="alert"
            className="flex items-center gap-2 border-b px-5 py-2 text-xs text-destructive"
          >
            <span>{error || feed.error}</span>
            <button
              className="ml-auto underline"
              onClick={() => {
                setError('');
                void feed.refresh();
              }}
            >
              Refresh
            </button>
          </div>
        ) : null}
        <ChatMessages
          messages={detail.messages}
          members={detail.members}
          owner={owner}
          archived={detail.group.isArchived}
          onThread={openThread}
          onAction={messageAction}
          hasOlder={detail.hasOlder}
          loadingOlder={feed.loadingOlder}
          loadOlder={feed.loadOlder}
        />
        <ChatComposer
          groupId={detail.group.id}
          members={detail.members}
          archived={detail.group.isArchived}
          onSent={(id) => void feed.refreshMessage(id)}
        />
      </section>
      <ChatPanel
        open={mobileList}
        onOpenChange={setMobileList}
        title="Your groups"
        side="left"
      >
        <GroupList groups={groups} id={detail.group.id} onNavigate={() => setMobileList(false)} />
      </ChatPanel>
      <ChatPanel
        open={Boolean(thread)}
        onOpenChange={(open) => {
          if (!open) setThread(null);
        }}
        title="Thread"
      >
        {thread ? (
          <Thread
            key={thread.parentId ?? thread.id}
            groupId={detail.group.id}
            root={thread}
            owner={owner}
            onError={setError}
            onUpdate={() => void feed.refresh()}
          />
        ) : null}
      </ChatPanel>
      <ChatPanel
        open={panel === 'settings'}
        onOpenChange={(open) => {
          if (!open) setPanel(null);
        }}
        title="Group details"
      >
        {panel === 'settings' ? (
          <GroupSettings
            detail={detail}
            contacts={contacts}
            userId={userId}
            action={async (input) => {
              if ((input as { operation?: string }).operation === 'leave') {
                await chatRequest(detail.group.id, input);
                router.push('/groups');
              } else await action(input);
            }}
          />
        ) : null}
      </ChatPanel>
      <ChatPanel
        open={panel === 'pins'}
        onOpenChange={(open) => {
          if (!open) setPanel(null);
        }}
        title="Pinned decisions"
      >
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
          {detail.pinned.length ? (
            detail.pinned.map((message) => (
              <button
                key={message.id}
                onClick={() => openThread(message)}
                className="block w-full space-y-2 rounded-lg border p-3 text-left hover:bg-accent"
              >
                <span className="block text-xs font-semibold">
                  {message.authorName}
                </span>
                <span className="block whitespace-pre-wrap break-words text-sm">
                  <ChatText
                    text={
                      message.body ||
                      message.files.map((file) => file.name).join(', ')
                    }
                    members={detail.members}
                  />
                </span>
                <span className="block text-[11px] text-primary">
                  View conversation →
                </span>
              </button>
            ))
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Pin important decisions from a message’s menu.
            </p>
          )}
        </div>
      </ChatPanel>
      <ChatPanel
        open={panel === 'search'}
        onOpenChange={(open) => {
          if (!open) setPanel(null);
        }}
        title="Search this group"
      >
        <form
          className="flex gap-2 border-b p-4"
          onSubmit={(event) => {
            event.preventDefault();
            setSubmittedSearch(search.trim());
          }}
        >
          <Input
            aria-label="Search all messages"
            placeholder="Search all messages…"
            maxLength={120}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <Button size="icon" aria-label="Search" disabled={!search.trim()}>
            <Search className="size-4" />
          </Button>
        </form>
        {panel === 'search' && submittedSearch ? (
          <SearchResults
            key={submittedSearch}
            groupId={detail.group.id}
            search={submittedSearch}
            onThread={openThread}
          />
        ) : (
          <p className="p-5 text-sm text-muted-foreground">
            Search messages across this group’s full history, including threads.
          </p>
        )}
      </ChatPanel>
      <ChatPanel
        open={panel === 'files'}
        onOpenChange={(open) => {
          if (!open) setPanel(null);
        }}
        title="Files and links"
      >
        {panel === 'files' ? (
          <SharedFiles groupId={detail.group.id} onThread={openThread} />
        ) : null}
      </ChatPanel>
    </div>
  );
}
