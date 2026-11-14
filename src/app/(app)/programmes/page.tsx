import Link from 'next/link';
import { requireUser } from '@/lib/auth/session';
import {
  getWorkspaceAccess,
  listProgrammes,
  getWorkSharingPeople,
  canDelegate,
  listMemberships,
  listWork,
} from '@/lib/services/workspace';
import { PROGRAMME_ROLES } from '@/lib/workspace';
import { WorkForm } from '@/components/workspace/work-form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { programmeAction, membershipAction } from '../work/actions';

export const metadata = { title: 'Programmes' };
export default async function ProgrammesPage() {
  const user = await requireUser();
  const [access, programmes, people, memberships, tasks] = await Promise.all([
    getWorkspaceAccess(user),
    listProgrammes(user),
    getWorkSharingPeople(),
    listMemberships(user),
    listWork(user),
  ]);
  const selectClass =
    'h-9 w-full rounded-md border border-input bg-background px-3 text-sm';
  return (
    <div className="mx-auto max-w-5xl space-y-7">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Programmes & initiatives
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Shared work with clearly assigned responsibilities.
        </p>
      </header>
      {access.canCreateProgrammes ? (
        <details className="rounded-lg border border-border p-4">
          <summary className="cursor-pointer text-sm font-medium">
            Create a programme
          </summary>
          <WorkForm
            action={programmeAction}
            submitLabel="Create programme"
            className="mt-5 max-w-xl"
          >
            <div className="space-y-1.5">
              <Label htmlFor="programme-name">Name</Label>
              <Input
                id="programme-name"
                name="name"
                required
                minLength={3}
                maxLength={120}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="programme-code">Short code</Label>
              <Input
                id="programme-code"
                name="code"
                required
                minLength={2}
                maxLength={30}
                placeholder="For example, OUTREACH"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="programme-description">Description</Label>
              <Textarea
                id="programme-description"
                name="description"
                maxLength={2000}
                rows={2}
              />
            </div>
          </WorkForm>
        </details>
      ) : null}
      {!programmes.length ? (
        <p className="py-12 text-sm text-muted-foreground">
          {access.canCreateProgrammes
            ? 'Create your first programme to organise team access and work.'
            : 'No programmes assigned yet. Direct task assignments still appear in Work.'}
        </p>
      ) : (
        <div className="divide-y divide-border">
          {programmes.map((programme) => {
            const members = memberships.filter(
              (member) => member.programmeId === programme.id,
            );
            const open = tasks.filter(
              (task) =>
                task.programmeId === programme.id &&
                !['completed', 'cancelled'].includes(task.status),
            );
            return (
              <section key={programme.id} className="space-y-4 py-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-medium">{programme.name}</h2>
                    {programme.description ? (
                      <p className="mt-1 max-w-lg text-sm text-muted-foreground">
                        {programme.description}
                      </p>
                    ) : null}
                    <p className="mt-2 text-xs text-muted-foreground">
                      {programme.code} · {members.length} members ·{' '}
                      {open.length} visible open tasks
                    </p>
                  </div>
                  <Link
                    href={`/work?programme=${programme.id}`}
                    className="text-sm text-primary"
                  >
                    Open work →
                  </Link>
                </div>
                <details>
                  <summary className="cursor-pointer text-sm text-muted-foreground">
                    People & access
                  </summary>
                  <ul className="mt-3 space-y-2">
                    {members.map((member) => (
                      <li key={member.id} className="text-sm">
                        {people.find((person) => person.id === member.userId)
                          ?.fullName ?? 'Programme member'}
                        <span className="ml-2 text-xs capitalize text-muted-foreground">
                          {member.role}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {access.canConfigure || canDelegate(access, programme.id) ? (
                    <WorkForm
                      action={membershipAction}
                      submitLabel="Save programme access"
                      className="mt-5 max-w-xl"
                    >
                      <input
                        type="hidden"
                        name="programmeId"
                        value={programme.id}
                      />
                      <div className="space-y-1.5">
                        <Label htmlFor={`${programme.id}-person`}>Person</Label>
                        <select
                          className={selectClass}
                          id={`${programme.id}-person`}
                          name="userId"
                          defaultValue=""
                          required
                        >
                          <option disabled value="">
                            Choose a person
                          </option>
                          {people.map((person) => (
                              <option key={person.id} value={person.id}>
                                {person.fullName}
                              </option>
                            ))}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`${programme.id}-role`}>
                          Programme responsibility
                        </Label>
                        <select
                          className={selectClass}
                          id={`${programme.id}-role`}
                          name="role"
                          defaultValue="member"
                        >
                          {PROGRAMME_ROLES.map((role) => (
                            <option key={role} value={role}>
                              {role.charAt(0).toUpperCase() + role.slice(1)}
                            </option>
                          ))}
                        </select>
                        <p className="text-xs text-muted-foreground">
                          Leads and managers delegate work in this programme.
                          Reviewers and advisers can see its work. Members see
                          their own assignments.
                        </p>
                      </div>
                    </WorkForm>
                  ) : null}
                </details>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
