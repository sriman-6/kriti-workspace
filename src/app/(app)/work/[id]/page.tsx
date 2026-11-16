import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { Download, ExternalLink } from 'lucide-react';
import { requireUser } from '@/lib/auth/session';
import {
  getWorkDetail,
  getWorkSharingPeople,
  getWorkspaceAccess,
  canDelegate,
  listProgrammes,
} from '@/lib/services/workspace';
import { NotFoundError } from '@/lib/errors';
import { WorkForm } from '@/components/workspace/work-form';
import { TaskFields } from '@/components/workspace/task-fields';
import { WorkViewers } from '@/components/workspace/work-viewers';
import { WorkStatusLabel } from '@/components/workspace/work-list';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ACCEPTED_WORK_FILES } from '@/lib/workspace';
import { env } from '@/lib/env';
import { formatDate } from '@/lib/format';
import {
  submitTaskAction,
  reviewTaskAction,
  progressTaskAction,
  commentTaskAction,
  editTaskAction,
  shareTaskAction,
} from '../actions';

export const metadata = { title: 'Task workspace' };
export default async function TaskPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  let detail;
  try {
    detail = await getWorkDetail(user, id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  const { task, people, submissions, events, canEdit, canReview } = detail;
  const name = (id: string | null) =>
    id ? people.find((person) => person.id === id)?.fullName ?? 'Unavailable' : 'No review requested';
  const editable = !['submitted', 'completed', 'cancelled'].includes(
    task.status,
  );
  const [choices, programmes, access] = await Promise.all([
    canEdit ? getWorkSharingPeople() : [],
    listProgrammes(user),
    getWorkspaceAccess(user),
  ]);
  const trackerVisible = programmes.some((programme) => programme.id === task.programmeId);
  const hidden = (
    <>
      <input type="hidden" name="taskId" value={id} />
      <input type="hidden" name="version" value={task.version} />
    </>
  );
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header>
        <Link
          href="/work"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Work
        </Link>
        {trackerVisible ? <Link href={`/programmes/${task.programmeId}${task.trackerSheetId ? `?sheet=${task.trackerSheetId}` : ''}`} className="ml-4 text-sm text-primary hover:underline">Open programme tracker →</Link> : null}
        <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
          <h1 className="max-w-xl break-words text-2xl font-semibold tracking-tight">
            {task.title}
          </h1>
          <WorkStatusLabel status={task.status} />
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-x-5 gap-y-3 text-sm sm:grid-cols-4">
          {[
            ['Owner', name(task.ownerId)],
            ['Reviewer', name(task.reviewerId)],
            [task.assignerId === task.ownerId ? 'Created by' : 'Assigned by', name(task.assignerId)],
            ['Due', task.dueOn ? formatDate(task.dueOn) : 'No deadline'],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="mt-1">{value}</dd>
            </div>
          ))}
        </dl>
        {task.priority === 'high' ? (
          <p className="mt-3 text-xs font-medium text-attention">
            High priority
          </p>
        ) : null}
      </header>
      <details className="border-t border-border pt-4">
        <summary className="cursor-pointer text-sm font-medium">Who can see this work?</summary>
        <p className="mt-3 text-sm text-muted-foreground">
          Owner, creator{task.reviewerId ? ' and reviewer' : ''}; Head KRITI; and programme leads,
          managers, reviewers and advisers when linked to a programme.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Additional viewers: {task.viewerIds.length ? task.viewerIds.map(name).join(', ') : 'None selected'}.
        </p>
        {canEdit ? <WorkForm key={`sharing-${task.version}`} action={shareTaskAction} submitLabel="Save visibility" className="mt-4">
          {hidden}
          <WorkViewers people={choices.filter((person) => person.id !== task.ownerId)} selected={task.viewerIds} prefix="sharing" />
        </WorkForm> : null}
      </details>
      {task.description ? (
        <section className="border-t border-border pt-6">
          <h2 className="text-sm font-medium">Brief</h2>
          <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">
            {task.description}
          </p>
        </section>
      ) : null}
      {task.ownerId === user.id && editable ? (
        <section className="space-y-4 border-t border-border pt-6">
          <h2 className="text-base font-medium">Submit work</h2>
          <WorkForm
            key={`submit-${task.version}`}
            action={submitTaskAction}
            directUpload={env.workFileStorage === 'vercel-blob' ? { taskId: task.id, version: task.version } : undefined}
            submitLabel={task.reviewerId ? 'Submit for review' : 'Record completion'}
          >
            {hidden}
            <div className="space-y-1.5">
              <Label htmlFor="summary">Work update</Label>
              <Textarea
                id="summary"
                name="summary"
                required
                minLength={3}
                maxLength={10000}
                placeholder="What have you completed?"
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="files">
                Files{' '}
                <span className="font-normal text-muted-foreground">
                  (optional)
                </span>
              </Label>
              <Input
                id="files"
                name="files"
                type="file"
                multiple
                accept={ACCEPTED_WORK_FILES}
              />
              <p className="text-xs text-muted-foreground">
                PDF, Word, Excel, PowerPoint, images or text. Up to 3 files, 5
                MB each.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="links">
                Work links{' '}
                <span className="font-normal text-muted-foreground">
                  (optional)
                </span>
              </Label>
              <Textarea
                id="links"
                name="links"
                rows={2}
                placeholder="Google Docs, Sheets or other HTTPS links, one per line"
              />
              <p className="text-xs text-muted-foreground">
                {task.reviewerId ? 'Attach a file or link for review. ' : 'Files and links are optional when recording completion. '}
                Make sure people following this work can open shared
                documents.
              </p>
            </div>
          </WorkForm>
        </section>
      ) : null}
      <section className="space-y-4 border-t border-border pt-6">
        <h2 className="text-base font-medium">
          Submitted work{' '}
          {submissions.length ? (
            <span className="ml-1 text-sm text-muted-foreground">
              {submissions.length}{' '}
              {submissions.length === 1 ? 'version' : 'versions'}
            </span>
          ) : null}
        </h2>
        {!submissions.length ? (
          <p className="text-sm text-muted-foreground">
            No work submitted yet.
          </p>
        ) : (
          submissions.map((submission, index) => (
            <article
              key={submission.id}
              className="space-y-3 rounded-lg border border-border p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-medium">
                  Version {submission.version}{' '}
                  <span className="font-normal text-muted-foreground">
                    · {formatDate(submission.createdAt)}
                  </span>
                </h3>
                {submission.decision ? (
                  <span
                    className={`text-xs ${submission.decision === 'accepted' ? 'text-positive' : 'text-attention'}`}
                  >
                    {submission.decision === 'accepted'
                      ? 'Accepted'
                      : 'Changes requested'}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {task.reviewerId ? 'Awaiting review' : 'Completed by owner · no review requested'}
                  </span>
                )}
              </div>
              <p className="whitespace-pre-wrap break-words text-sm">
                {submission.summary}
              </p>
              {submission.files.map((file) => (
                <a
                  key={file.id}
                  href={`/api/work/files/${file.id}`}
                  className="flex items-center gap-2 break-all text-sm text-primary"
                >
                  <Download className="size-3.5 shrink-0" aria-hidden />
                  {file.name}
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {Math.max(1, Math.ceil(file.size / 1024))} KB
                  </span>
                </a>
              ))}
              {submission.links.map((link) => (
                <a
                  href={link}
                  key={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 break-all text-sm text-primary"
                >
                  <ExternalLink className="size-3.5 shrink-0" aria-hidden />
                  {link}
                </a>
              ))}
              {submission.feedback ? (
                <div className="border-l-2 border-border pl-3">
                  <p className="text-xs text-muted-foreground">
                    Reviewer feedback
                  </p>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm">
                    {submission.feedback}
                  </p>
                </div>
              ) : null}
              {index === 0 && canReview && task.status === 'submitted' ? (
                <div className="border-t border-border pt-4">
                  <WorkForm
                    key={`review-${task.version}`}
                    action={reviewTaskAction}
                    submitLabel="Save decision"
                  >
                    {hidden}
                    <div className="space-y-1.5">
                      <Label htmlFor="decision">Decision</Label>
                      <select
                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                        name="decision"
                        id="decision"
                      >
                        <option value="accepted">Accept work</option>
                        <option value="changes_requested">
                          Request changes
                        </option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="feedback">Feedback</Label>
                      <Textarea
                        id="feedback"
                        name="feedback"
                        maxLength={10000}
                        placeholder="Required when requesting changes"
                        rows={3}
                      />
                    </div>
                  </WorkForm>
                </div>
              ) : null}
            </article>
          ))
        )}
      </section>
      {editable && (task.ownerId === user.id || canEdit) ? (
        <details className="border-t border-border pt-5">
          <summary className="cursor-pointer text-sm font-medium">
            Update progress
          </summary>
          <WorkForm
            action={progressTaskAction}
            submitLabel="Update progress"
            className="mt-4"
          >
            {hidden}
            <div className="space-y-1.5">
              <Label htmlFor="progress-status">Status</Label>
              <select
                id="progress-status"
                name="status"
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {task.ownerId === user.id ? (
                  <>
                    <option value="in_progress">In progress</option>
                    <option value="blocked">Blocked</option>
                  </>
                ) : null}
                {canEdit ? (
                  <option value="cancelled">Cancel task</option>
                ) : null}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="progress-note">Note</Label>
              <Textarea
                id="progress-note"
                name="note"
                rows={2}
                maxLength={2000}
                placeholder="Describe blockers or changes"
              />
            </div>
          </WorkForm>
        </details>
      ) : null}
      {canEdit && editable ? (
        <details className="border-t border-border pt-5">
          <summary className="cursor-pointer text-sm font-medium">
            Edit assignment
          </summary>
          <WorkForm
            key={`edit-${task.version}`}
            action={editTaskAction}
            submitLabel="Save assignment"
            className="mt-4"
          >
            {hidden}
            <TaskFields
              prefix="edit"
              people={choices}
              programmes={programmes}
              defaults={{ ...task, trackerSheetId: trackerVisible ? task.trackerSheetId : null }}
              currentUserId={user.id}
              creatorId={task.assignerId}
              canAssignToOthers={access.isHead || access.memberships.some((member) => ['lead', 'manager'].includes(member.role))}
              ownProgrammeIds={access.memberships.map((member) => member.programmeId)}
              delegateProgrammeIds={programmes.filter((programme) => canDelegate(access, programme.id)).map((programme) => programme.id)}
            />
          </WorkForm>
        </details>
      ) : null}
      <section className="space-y-4 border-t border-border pt-6">
        <h2 className="text-base font-medium">Updates</h2>
        <WorkForm action={commentTaskAction} submitLabel="Post update">
          <input type="hidden" name="taskId" value={id} />
          <Label htmlFor="message" className="sr-only">
            Comment or update
          </Label>
          <Textarea
            id="message"
            name="message"
            required
            maxLength={2000}
            placeholder="Add context, ask a question or share an update"
            rows={2}
          />
        </WorkForm>
        <details>
          <summary className="cursor-pointer text-sm text-muted-foreground">
            History · {events.length} updates
          </summary>
          <ol className="mt-4 space-y-4">
            {events.map((event) => (
              <li key={event.id} className="border-l border-border pl-4">
                <p className="text-xs text-muted-foreground">
                  {event.actorName} · {formatDate(event.createdAt)}
                </p>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm">
                  {event.message}
                </p>
              </li>
            ))}
          </ol>
        </details>
      </section>
    </div>
  );
}
