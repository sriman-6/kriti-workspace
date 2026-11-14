import Link from 'next/link';
import { requireUser } from '@/lib/auth/session';
import { listIdeas, listContacts } from '@/lib/services/collaboration';
import { WorkForm } from '@/components/workspace/work-form';
import { MemberPicker } from '@/components/workspace/member-picker';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ideaAction } from '../collaboration-actions';
export const metadata = { title: 'Ideas' };
export default async function IdeasPage() {
  const user = await requireUser();
  const [ideas, contacts] = await Promise.all([
    listIdeas(user),
    listContacts(user),
  ]);
  return (
    <div className="mx-auto max-w-3xl space-y-7">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Ideas</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Capture a thought. Give it shape when you’re ready.
        </p>
      </header>
      <details className="rounded-lg border border-border p-4">
        <summary className="cursor-pointer text-sm font-medium">
          Capture an idea
        </summary>
        <WorkForm action={ideaAction} submitLabel="Save idea" className="mt-5">
          <Label htmlFor="idea-title">Title</Label>
          <Input
            id="idea-title"
            name="title"
            minLength={3}
            maxLength={160}
            required
          />
          <Label htmlFor="idea-body">Rough notes</Label>
          <Textarea id="idea-body" name="body" maxLength={15000} rows={5} />
          <details>
            <summary className="cursor-pointer text-sm text-muted-foreground">
              Share with people · private by default
            </summary>
            <div className="mt-4">
              <MemberPicker
                people={contacts.filter((person) => person.id !== user.id)}
                label="People who can read this idea"
              />
            </div>
          </details>
        </WorkForm>
      </details>
      <div className="divide-y divide-border">
        {ideas.length ? (
          ideas.map((idea) => (
            <Link
              key={idea.id}
              href={`/ideas/${idea.id}`}
              className="block py-4"
            >
              <h2 className="text-sm font-medium">{idea.title}</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {idea.initiativeId
                  ? 'Activated as an initiative'
                  : idea.authorId === user.id
                    ? 'Your idea'
                    : 'Shared with you'}
              </p>
            </Link>
          ))
        ) : (
          <p className="py-12 text-sm text-muted-foreground">
            Your notes and ideas shared with you will appear here.
          </p>
        )}
      </div>
    </div>
  );
}
