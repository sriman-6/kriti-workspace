import Link from 'next/link';
import { Plus } from 'lucide-react';
import { requireUser } from '@/lib/auth/session';
import {
  listWork,
  listProgrammes,
} from '@/lib/services/workspace';
import { WorkList } from '@/components/workspace/work-list';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { WORK_STATUS_LABELS } from '@/lib/workspace';

export const metadata = { title: 'Work' };
export default async function WorkPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const [all, programmes, query] = await Promise.all([
    listWork(user),
    listProgrammes(user),
    searchParams,
  ]);
  const value = (key: string) =>
    typeof query[key] === 'string' ? (query[key] as string) : '';
  const view = value('view');
  const status = value('status');
  const search = value('q').toLowerCase();
  const programme = value('programme');
  const owner = value('owner');
  const overdue = value('overdue') === '1';
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const tasks = all.filter(
    (task) =>
      (view !== 'mine' || task.ownerId === user.id) &&
      (view !== 'review' ||
        (task.reviewerId === user.id && task.status === 'submitted')) &&
      (!status || task.status === status) &&
      (!programme || task.programmeId === programme) &&
      (!owner || task.ownerId === owner) &&
      (!overdue ||
        Boolean(
          task.dueOn &&
          task.dueOn < today &&
          !['completed', 'cancelled'].includes(task.status),
        )) &&
      (!search ||
        `${task.title} ${task.ownerName} ${task.reviewerName}`
          .toLowerCase()
          .includes(search)),
  );
  return (
    <div className="mx-auto max-w-5xl space-y-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {view === 'review'
              ? 'Review inbox'
              : view === 'mine'
                ? 'My work'
                : 'My Work'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {view === 'review'
              ? 'Submissions waiting for your decision.'
              : 'Assignments, deadlines and the work behind them.'}
          </p>
        </div>
          <Button asChild>
            <Link href="/work/new">
              <Plus className="size-4" />
              Create work
            </Link>
          </Button>
      </div>
      <nav
        aria-label="Work views"
        className="flex flex-wrap gap-5 border-b border-border pb-3 text-sm"
      >
        {[
          ['', 'All visible'],
          ['mine', 'Assigned to me'],
          ['review', 'To review'],
        ].map(([key, label]) => (
          <Link
            key={key}
            href={key ? `/work?view=${key}` : '/work'}
            aria-current={view === key ? 'page' : undefined}
            className={
              view === key
                ? 'font-medium text-foreground'
                : 'text-muted-foreground'
            }
          >
            {label}
          </Link>
        ))}
      </nav>
      <Link href="/library" className="inline-block text-xs text-muted-foreground hover:text-foreground">All submitted files & links →</Link>
      <form className="flex flex-wrap items-center gap-2" method="get">
        <input type="hidden" name="view" value={view} />
        {owner ? <input type="hidden" name="owner" value={owner} /> : null}
        {overdue ? <input type="hidden" name="overdue" value="1" /> : null}
        <Input
          name="q"
          aria-label="Search work"
          placeholder="Search work or people"
          defaultValue={value('q')}
          className="max-w-xs"
        />
        <select
          aria-label="Filter status"
          name="status"
          defaultValue={status}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="">All statuses</option>
          {Object.entries(WORK_STATUS_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter programme"
          name="programme"
          defaultValue={programme}
          className="h-9 max-w-full rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="">All programmes</option>
          {programmes.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <Button variant="secondary" type="submit">
          Apply
        </Button>
        {search || status || programme || owner || overdue ? (
          <Button asChild variant="ghost">
            <Link href={view ? `/work?view=${view}` : '/work'}>Clear</Link>
          </Button>
        ) : null}
      </form>
      {tasks.length ? (
        <>
          <p className="text-xs text-muted-foreground">
            {tasks.length} {tasks.length === 1 ? 'task' : 'tasks'}
          </p>
          <WorkList tasks={tasks} />
        </>
      ) : (
        <div className="py-16 text-center">
          <h2 className="text-base font-medium">
            {all.length ? 'No matching work' : 'No work yet'}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {all.length
              ? 'Try another filter.'
              : 'Create your own work, or follow assignments and work shared with you here.'}
          </p>
        </div>
      )}
    </div>
  );
}
