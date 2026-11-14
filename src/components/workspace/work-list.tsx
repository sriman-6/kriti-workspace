import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { WORK_STATUS_LABELS, type WorkStatus } from '@/lib/workspace';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/format';

export function WorkStatusLabel({ status }: { status: WorkStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap text-xs',
        status === 'blocked'
          ? 'text-critical'
          : status === 'completed'
            ? 'text-positive'
            : status === 'submitted' || status === 'changes_requested'
              ? 'text-attention'
              : 'text-muted-foreground',
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {WORK_STATUS_LABELS[status]}
    </span>
  );
}
export function WorkList({
  tasks,
}: {
  tasks: {
    id: string;
    title: string;
    ownerName: string;
    reviewerName: string;
    dueOn: string | null;
    status: WorkStatus;
    programmeName: string;
  }[];
}) {
  return (
    <div className="divide-y divide-border">
      {tasks.map((task) => (
        <Link
          href={`/work/${task.id}`}
          key={task.id}
          className="group flex items-start gap-3 py-4 transition-colors hover:bg-accent/30"
        >
          <div className="min-w-0 flex-1">
            <p className="break-words text-sm font-medium group-hover:text-primary">
              {task.title}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {task.ownerName} · {task.programmeName}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <WorkStatusLabel status={task.status} />
            {task.dueOn ? (
              <span className="text-xs text-muted-foreground">
                {formatDate(task.dueOn)}
              </span>
            ) : null}
          </div>
          <ArrowUpRight
            aria-hidden
            className="mt-0.5 hidden size-3.5 shrink-0 text-muted-foreground sm:block"
          />
        </Link>
      ))}
    </div>
  );
}
