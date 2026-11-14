import Link from 'next/link';
import { ArrowRight, Plus } from 'lucide-react';
import { requireUser } from '@/lib/auth/session';
import {
  getWorkspaceAccess,
  listWork,
  listWorkNotifications,
} from '@/lib/services/workspace';
import { WORKSPACE_ROLE_LABELS } from '@/lib/workspace';
import { WorkList } from '@/components/workspace/work-list';
import { Button } from '@/components/ui/button';
import { readNotificationsAction } from '../work/actions';
import { listMeetings } from '@/lib/services/collaboration';
import { formatDateTime } from '@/lib/format';

export const metadata = { title: 'Overview' };
export default async function DashboardPage() {
  const user = await requireUser();
  const [access, tasks, notifications, meetingRows] = await Promise.all([
    getWorkspaceAccess(user),
    listWork(user),
    listWorkNotifications(user),
    listMeetings(user),
  ]);
  const active = tasks.filter(
    (task) => !['completed', 'cancelled'].includes(task.status),
  );
  const reviews = tasks.filter(
    (task) => task.reviewerId === user.id && task.status === 'submitted',
  );
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const overdue = active.filter((task) => task.dueOn && task.dueOn < today);
  const scope = access.isHead
    ? 'All official KRITI work'
    : access.role === 'program_head' || access.role === 'manager'
      ? 'Your assigned programmes'
      : access.role === 'nucleus'
        ? 'Your initiatives and commitments'
        : 'Your assignments and commitments';
  const upcoming = meetingRows
    .filter(
      (row) =>
        row.meeting.status === 'scheduled' &&
        row.meeting.endsAt > new Date() &&
        row.response !== 'declined',
    )
    .slice(0, 3);
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-xs text-muted-foreground">
            {access.role
              ? WORKSPACE_ROLE_LABELS[access.role]
              : 'KRITI workspace'}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {access.isHead
              ? 'KRITI at a glance'
              : `Hello, ${user.fullName.split(' ')[0]}`}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">{scope}.</p>
        </div>
          <Button asChild>
            <Link href="/work/new">
              <Plus className="size-4" />
              Create work
            </Link>
          </Button>
      </header>
      <div className="flex flex-wrap gap-x-8 gap-y-3 border-y border-border py-4 text-sm">
        <Link href="/work">
          <span className="font-semibold tabular-nums">{active.length}</span>{' '}
          <span className="text-muted-foreground">open tasks</span>
        </Link>
        <Link href="/work?view=review">
          <span className="font-semibold tabular-nums">{reviews.length}</span>{' '}
          <span className="text-muted-foreground">to review</span>
        </Link>
        <span>
          <span
            className={
              overdue.length ? 'font-semibold text-attention' : 'font-semibold'
            }
          >
            {overdue.length}
          </span>{' '}
          <span className="text-muted-foreground">overdue</span>
        </span>
      </div>
      {notifications.length ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium">Updates for you</h2>
            <form action={readNotificationsAction}>
              <Button variant="ghost" size="sm">
                Mark all read
              </Button>
            </form>
          </div>
          <ul className="space-y-2">
            {notifications.slice(0, 4).map((item) => (
              <li key={item.id}>
                <Link
                  href={`/work/${item.taskId}`}
                  className="flex items-center justify-between gap-3 rounded-md bg-accent/40 px-3 py-2 text-sm"
                >
                  <span>{item.message}</span>
                  <ArrowRight className="size-3.5 shrink-0" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium">
            {access.isHead ? 'Current work' : 'Your current work'}
          </h2>
          <Link
            href="/work"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            View all →
          </Link>
        </div>
        {active.length ? (
          <WorkList tasks={active.slice(0, 7)} />
        ) : (
          <div className="py-14">
            <h3 className="text-base font-medium">A clear place to start.</h3>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
              Create your own work and choose who can follow it. Assignments, deadlines
              and work shared with you will also appear here.
            </p>
            <div className="mt-5 flex gap-3">
                <Button asChild>
                  <Link href="/work/new">Create work</Link>
                </Button>
              {access.canConfigure ? (
                <Button asChild>
                  <Link href="/people">Set up people</Link>
                </Button>
              ) : null}
            </div>
          </div>
        )}
      </section>
      {upcoming.length ? (
        <section className="space-y-3 border-t border-border pt-5">
          <h2 className="text-sm font-medium">Next meetings</h2>
          {upcoming.map(({ meeting }) => (
            <Link
              href={`/meetings/${meeting.id}`}
              key={meeting.id}
              className="flex flex-wrap justify-between gap-3 text-sm"
            >
              <span>{meeting.title}</span>
              <span className="text-xs text-muted-foreground">
                {formatDateTime(meeting.startsAt)} IST
              </span>
            </Link>
          ))}
        </section>
      ) : null}
    </div>
  );
}
