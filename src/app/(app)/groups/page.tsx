import Link from 'next/link';
import { requireUser } from '@/lib/auth/session';
import { listGroups, listContacts } from '@/lib/services/collaboration';
import { WorkForm } from '@/components/workspace/work-form';
import { MemberPicker } from '@/components/workspace/member-picker';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { groupAction } from '../collaboration-actions';
export const metadata = { title: 'Groups' };
export default async function GroupsPage() {
  const user = await requireUser();
  const [groups, contacts] = await Promise.all([
    listGroups(user),
    listContacts(user),
  ]);
  return (
    <div className="mx-auto max-w-3xl space-y-7">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Groups</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Work discussions with the people involved.
        </p>
      </header>
      <details className="rounded-lg border border-border p-4">
        <summary className="cursor-pointer text-sm font-medium">
          Create a group
        </summary>
        <WorkForm
          action={groupAction}
          submitLabel="Create group"
          className="mt-5"
        >
          <Label htmlFor="group-name">Name</Label>
          <Input
            id="group-name"
            name="name"
            required
            minLength={3}
            maxLength={120}
          />
          <Label htmlFor="group-description">Purpose</Label>
          <Textarea
            id="group-description"
            name="description"
            maxLength={1000}
            rows={2}
          />
          <MemberPicker
            people={contacts.filter((person) => person.id !== user.id)}
          />
        </WorkForm>
      </details>
      <div className="divide-y divide-border">
        {groups.length ? (
          groups.map(({ group, lastReadAt }) => (
            <Link
              key={group.id}
              href={`/groups/${group.id}`}
              className="flex items-start justify-between gap-3 py-4"
            >
              <div>
                <h2 className="text-sm font-medium">{group.name}</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {group.description || 'Private work group'}
                </p>
              </div>
              <span className="text-xs text-muted-foreground">
                {group.isArchived
                  ? 'Archived'
                  : !lastReadAt || group.updatedAt > lastReadAt
                    ? 'New activity'
                    : ''}
              </span>
            </Link>
          ))
        ) : (
          <p className="py-12 text-sm text-muted-foreground">
            Create a work group or join one by invitation.
          </p>
        )}
      </div>
    </div>
  );
}
