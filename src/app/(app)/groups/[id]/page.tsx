import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/session';
import { getGroup, listContacts } from '@/lib/services/collaboration';
import { NotFoundError } from '@/lib/errors';
import { WorkForm } from '@/components/workspace/work-form';
import { DiscussionRefresh } from '@/components/workspace/discussion-refresh';
import { WorkText } from '@/components/workspace/work-text';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { formatDateTime } from '@/lib/format';
import {
  messageAction,
  groupSettingsAction,
  groupReadAction,
} from '../../collaboration-actions';
export const metadata = { title: 'Discussion' };
export default async function GroupPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireUser();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!z.string().uuid().safeParse(id).success) notFound();
  const page = Math.min(
    10000,
    Math.max(0, Number.parseInt(query.page ?? '0', 10) || 0),
  );
  const parentId = query.thread;
  if (parentId && !z.string().uuid().safeParse(parentId).success) notFound();
  let detail;
  try {
    detail = await getGroup(user, id, page, parentId);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  const { group, members, messages, parent, pinned, hasOlder } = detail;
  const owner = group.ownerId === user.id;
  const contacts = owner ? await listContacts(user) : [];
  const settings = (operation: string, target = '') => (
    <>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="operation" value={operation} />
      <input type="hidden" name="target" value={target} />
    </>
  );
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {!page ? <DiscussionRefresh /> : null}
      <header>
        <Link href="/groups" className="text-sm text-muted-foreground">
          ← Groups
        </Link>
        <div className="mt-4 flex flex-wrap justify-between gap-3">
          <div>
            <h1 className="break-words text-2xl font-semibold tracking-tight">
              {group.name}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {group.description || 'Private group'} · {members.length} members
              {group.isArchived ? ' · Archived' : ''}
            </p>
          </div>
          <form action={groupReadAction}>
            <input type="hidden" name="id" value={id} />
            <Button variant="ghost" size="sm">
              Mark read
            </Button>
          </form>
        </div>
      </header>
      {pinned.length ? (
        <details className="border-y border-border py-3">
          <summary className="cursor-pointer text-xs text-muted-foreground">
            Pinned decisions · {pinned.length}
          </summary>
          <ul className="mt-3 space-y-2">
            {pinned.map((message) => (
              <li
                key={message.id}
                className="whitespace-pre-wrap break-words text-sm"
              >
                <WorkText text={message.body}/>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {parent ? (
        <div className="space-y-2">
          <Link href={`/groups/${id}`} className="text-xs text-primary">
            ← All discussions
          </Link>
          <p className="whitespace-pre-wrap break-words border-l-2 border-primary pl-4 text-sm">
            {parent.body}
          </p>
        </div>
      ) : null}
      <div className="divide-y divide-border">
        {messages.length ? (
          messages.map(({ message, authorName }) => (
            <article key={message.id} className="space-y-2 py-4">
              <div className="flex flex-wrap justify-between gap-2">
                <h2 className="text-sm font-medium">{authorName}</h2>
                <time className="text-xs text-muted-foreground">
                  {formatDateTime(message.createdAt)}
                </time>
              </div>
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                {message.body}
              </p>
              <div className="flex flex-wrap items-center gap-4">
                {!parentId ? (
                  <Link
                    href={`/groups/${id}?thread=${message.id}`}
                    className="text-xs text-muted-foreground"
                  >
                    Open thread →
                  </Link>
                ) : null}
                {owner ? (
                  <details>
                    <summary className="cursor-pointer text-xs text-muted-foreground">
                      {message.isPinned ? 'Pinned' : 'Pin decision'}
                    </summary>
                    <WorkForm
                      action={groupSettingsAction}
                      submitLabel={message.isPinned ? 'Unpin' : 'Pin'}
                      className="mt-2"
                    >
                      {settings(message.isPinned ? 'unpin' : 'pin', message.id)}
                    </WorkForm>
                  </details>
                ) : null}
              </div>
            </article>
          ))
        ) : (
          <p className="py-10 text-sm text-muted-foreground">
            {parentId ? 'No replies yet.' : 'Start the discussion.'}
          </p>
        )}
      </div>
      <nav
        aria-label="Message history"
        className="flex gap-5 text-xs text-primary"
      >
        {hasOlder ? (
          <Link
            href={`/groups/${id}?page=${page + 1}${parentId ? `&thread=${parentId}` : ''}`}
          >
            Older messages
          </Link>
        ) : null}
        {page > 0 ? (
          <Link
            href={`/groups/${id}?page=${page - 1}${parentId ? `&thread=${parentId}` : ''}`}
          >
            More recent
          </Link>
        ) : null}
      </nav>
      {!group.isArchived ? (
        <WorkForm
          key={parentId ?? 'root'}
          resetOnSuccess
          action={messageAction}
          submitLabel={parentId ? 'Reply' : 'Send message'}
        >
          <input type="hidden" name="groupId" value={id} />
          <input type="hidden" name="parentId" value={parentId ?? ''} />
          <Label htmlFor="body" className="sr-only">
            Message
          </Label>
          <Textarea
            id="body"
            name="body"
            required
            maxLength={4000}
            rows={3}
            placeholder="Share an update, decision or work link…"
          />
        </WorkForm>
      ) : null}
      <details className="border-t border-border pt-4">
        <summary className="cursor-pointer text-sm text-muted-foreground">
          People & group settings
        </summary>
        <ul className="mt-4 space-y-3">
          {members.map((person) => (
            <li
              key={person.id}
              className="flex flex-wrap items-center justify-between gap-2 text-sm"
            >
              <span>
                {person.fullName}
                {person.id === group.ownerId ? ' · Creator' : ''}
              </span>
              {owner && person.id !== user.id ? (
                <WorkForm action={groupSettingsAction} submitLabel="Remove">
                  {settings('remove', person.id)}
                </WorkForm>
              ) : null}
            </li>
          ))}
        </ul>
        {owner ? (
          <div className="mt-5 space-y-5">
            <WorkForm action={groupSettingsAction} submitLabel="Add member">
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="operation" value="add" />
              <Label htmlFor="member-target">Invite a person</Label>
              <select
                id="member-target"
                name="target"
                required
                className="h-9 max-w-full rounded-md border border-input bg-background px-3 text-sm"
                defaultValue=""
              >
                <option value="" disabled>
                  Choose a person
                </option>
                {contacts
                  .filter(
                    (person) =>
                      !members.some((member) => member.id === person.id),
                  )
                  .map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.fullName}
                    </option>
                  ))}
              </select>
            </WorkForm>
            <WorkForm
              action={groupSettingsAction}
              submitLabel={group.isArchived ? 'Restore group' : 'Archive group'}
            >
              {settings(group.isArchived ? 'restore' : 'archive')}
            </WorkForm>
          </div>
        ) : null}
      </details>
    </div>
  );
}
