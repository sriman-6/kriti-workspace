import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/session';
import { getIdea, listContacts } from '@/lib/services/collaboration';
import { getWorkspaceAccess } from '@/lib/services/workspace';
import { NotFoundError } from '@/lib/errors';
import { WorkForm } from '@/components/workspace/work-form';
import { MemberPicker } from '@/components/workspace/member-picker';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ideaAction, ideaConvertAction } from '../../collaboration-actions';
export const metadata = { title: 'Idea' };
export default async function IdeaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  let detail;
  try {
    detail = await getIdea(user, id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  const { idea, members } = detail;
  const [access, contacts] = await Promise.all([
    getWorkspaceAccess(user),
    listContacts(user),
  ]);
  return (
    <div className="mx-auto max-w-3xl space-y-7">
      <header>
        <Link href="/ideas" className="text-sm text-muted-foreground">
          ← Ideas
        </Link>
        <h1 className="mt-4 break-words text-2xl font-semibold tracking-tight">
          {idea.title}
        </h1>
        <p className="mt-2 text-xs text-muted-foreground">
          {members.length
            ? `Shared with ${members.map((person) => person.fullName).join(', ')}`
            : 'Private to the author'}
        </p>
      </header>
      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
        {idea.body || 'No notes yet.'}
      </p>
      {idea.initiativeId ? (
        <Link
          href={`/work?programme=${idea.initiativeId}`}
          className="text-sm text-primary"
        >
          Open initiative work →
        </Link>
      ) : access.isHead ? (
        <details className="border-t border-border pt-5">
          <summary className="cursor-pointer text-sm font-medium">
            Activate as an initiative
          </summary>
          <WorkForm
            action={ideaConvertAction}
            submitLabel="Activate initiative"
            className="mt-4"
          >
            <input type="hidden" name="id" value={id} />
            <Label htmlFor="leadId">Accountable lead</Label>
            <select
              id="leadId"
              name="leadId"
              required
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              defaultValue=""
            >
              <option value="" disabled>
                Choose a lead
              </option>
              {contacts.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.fullName}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              The lead can delegate initiative tasks. Existing collaborators
              become members.
            </p>
          </WorkForm>
        </details>
      ) : null}
      {idea.authorId === user.id ? (
        <details className="border-t border-border pt-5">
          <summary className="cursor-pointer text-sm font-medium">
            Edit notes / sharing
          </summary>
          <WorkForm
            action={ideaAction}
            submitLabel="Save idea"
            className="mt-4"
          >
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="version" value={idea.version} />
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              name="title"
              required
              minLength={3}
              maxLength={160}
              defaultValue={idea.title}
            />
            <Label htmlFor="body">Notes</Label>
            <Textarea
              id="body"
              name="body"
              rows={6}
              maxLength={15000}
              defaultValue={idea.body}
            />
            <MemberPicker
              people={contacts.filter((person) => person.id !== user.id)}
              selected={members.map((person) => person.id)}
              label="Shared with"
            />
          </WorkForm>
        </details>
      ) : null}
    </div>
  );
}
