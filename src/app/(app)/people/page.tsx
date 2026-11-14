import Link from 'next/link';
import { requireUser } from '@/lib/auth/session';
import {
  getWorkspaceAccess,
  getWorkspacePeople,
  listWork,
} from '@/lib/services/workspace';
import { WORKSPACE_ROLES, WORKSPACE_ROLE_LABELS } from '@/lib/workspace';
import { WorkForm } from '@/components/workspace/work-form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { personAction } from '../work/actions';

export const metadata = { title: 'People' };
export default async function PeoplePage() {
  const user = await requireUser();
  const [access, people, tasks] = await Promise.all([
    getWorkspaceAccess(user),
    getWorkspacePeople(user),
    listWork(user),
  ]);
  return (
    <div className="mx-auto max-w-5xl space-y-7">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">People</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Responsibilities and work across your visible team.
        </p>
      </header>
      {access.canManagePeople ? (
        <details className="rounded-lg border border-border p-4">
          <summary className="cursor-pointer text-sm font-medium">
            {access.canConfigure ? 'Add a person or update responsibility' : 'Add a member'}
          </summary>
          <WorkForm
            action={personAction}
            submitLabel="Save responsibility"
            className="mt-5 max-w-xl"
          >
            <div className="space-y-1.5">
              <Label htmlFor="person-name">Full name</Label>
              <Input
                id="person-name"
                name="fullName"
                required
                minLength={2}
                maxLength={150}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="person-email">Google sign-in email</Label>
              <Input id="person-email" name="email" type="email" required />
              <p className="text-xs text-muted-foreground">
                {access.canConfigure ? 'An existing email updates that person’s workspace responsibility. ' : 'Add a new Intern or Student Member. '}
                Use their BITS email, or explicitly approve the exact external Google account below.
              </p>
              <label className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
                <input type="checkbox" name="externalEmailApproval" value="yes" className="mt-0.5" />
                I approve this exact external Google email for KRITI access. Registration and Google verification are still required.
              </label>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="person-role">Responsibility</Label>
              <select
                id="person-role"
                name="role"
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                defaultValue="intern"
              >
                {WORKSPACE_ROLES.filter((role) => access.canConfigure || ['intern', 'student'].includes(role)).map((role) => (
                  <option key={role} value={role}>
                    {WORKSPACE_ROLE_LABELS[role]}
                  </option>
                ))}
              </select>
            </div>
            {access.canConfigure ? <details>
              <summary className="cursor-pointer text-sm text-muted-foreground">
                Account access
              </summary>
              <div className="mt-3 space-y-1.5">
                <Label htmlFor="person-access">Sign-in</Label>
                <select
                  id="person-access"
                  name="access"
                  defaultValue="active"
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Disabled</option>
                </select>
                <p className="text-xs text-muted-foreground">
                  Disabling sign-in retains the person’s work and review
                  history.
                </p>
              </div>
            </details> : null}
          </WorkForm>
        </details>
      ) : null}
      <div className="divide-y divide-border">
        {people.map((person) => {
          const active = tasks.filter(
            (task) =>
              task.ownerId === person.id &&
              !['completed', 'cancelled'].includes(task.status),
          );
          return (
            <div
              key={person.id}
              className="flex flex-wrap items-center justify-between gap-3 py-4"
            >
              <div>
                <h2 className="text-sm font-medium">
                  {person.fullName}
                  {person.id === user.id ? (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      You
                    </span>
                  ) : null}
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {person.workspaceRole
                    ? WORKSPACE_ROLE_LABELS[person.workspaceRole]
                    : 'No workspace responsibility'}
                  {!person.isActive ? ' · Inactive' : ''}
                </p>
              </div>
              <Link
                href={`/work?owner=${person.id}`}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                {active.length} visible open tasks →
              </Link>
            </div>
          );
        })}
      </div>
      {access.canConfigure ? (
        <p className="text-xs text-muted-foreground">
          Assign programme access in{' '}
          <Link href="/programmes" className="underline">
            Programmes
          </Link>
          . Responsibilities and programme access are managed separately.
        </p>
      ) : null}
    </div>
  );
}
