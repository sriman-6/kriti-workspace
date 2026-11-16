import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import {
  getWorkspaceAccess,
  getWorkSharingPeople,
  listProgrammes,
} from '@/lib/services/workspace';
import { WorkForm } from '@/components/workspace/work-form';
import { TaskFields } from '@/components/workspace/task-fields';
import { createTaskAction } from '../actions';
import { getMeeting } from '@/lib/services/collaboration';
import { NotFoundError } from '@/lib/errors';
import { z } from 'zod';
import { getChatMessage } from '@/lib/services/chat';
import { plainMessage } from '@/lib/chat';

export const metadata = { title: 'Create work' };
export default async function NewTaskPage({
  searchParams,
}: {
  searchParams: Promise<{ meeting?: string; message?: string }>;
}) {
  const user = await requireUser();
  const [access, people, programmes] = await Promise.all([
    getWorkspaceAccess(user),
    getWorkSharingPeople(),
    listProgrammes(user),
  ]);
  const canAssign = access.isHead || access.memberships.some((member) => ['lead', 'manager'].includes(member.role));
  const assignable = programmes.filter(
    (programme) =>
      access.isHead ||
      access.memberships.some(
        (member) =>
          member.programmeId === programme.id &&
          ['lead', 'manager'].includes(member.role),
      ),
  );
  const source = await searchParams;
  let meetingBrief = '';
  let messageTitle = '';
  if (source.message) {
    if (!z.uuid().safeParse(source.message).success) notFound();
    try {
      const message = await getChatMessage(user, source.message);
      messageTitle = plainMessage(message.body).split('\n')[0]!.slice(0, 200);
      meetingBrief = `From a group discussion\n/groups/${message.groupId}?thread=${message.parentId ?? message.id}\n\n${plainMessage(message.body)}`;
    } catch (error) { if (error instanceof NotFoundError) notFound(); throw error; }
  }
  if (source.meeting) {
    if (!z.string().uuid().safeParse(source.meeting).success) notFound();
    try {
      const detail = await getMeeting(user, source.meeting);
      meetingBrief = `Follow-up to ${detail.meeting.title}\n/meetings/${detail.meeting.id}\n\n${detail.meeting.minutes}`;
    } catch (error) {
      if (error instanceof NotFoundError) notFound();
      throw error;
    }
  }
  return (
    <div className="mx-auto max-w-2xl space-y-7">
      <div>
        <Link
          href="/work"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Work
        </Link>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">
          Create work
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Add your own work and choose who can follow it. A reviewer is optional for your own work.
        </p>
      </div>
      <WorkForm action={createTaskAction} submitLabel="Create work">
        {source.message ? <p className="text-xs text-muted-foreground">Review the brief and choose who can see this work before creating it. The original group remains private.</p> : null}
        <TaskFields
          people={people}
          programmes={programmes}
          currentUserId={user.id}
          canAssignToOthers={canAssign}
          ownProgrammeIds={access.memberships.map((member) => member.programmeId)}
          delegateProgrammeIds={assignable.map((programme) => programme.id)}
          defaults={{ title: messageTitle, description: meetingBrief, ownerId: user.id }}
        />
      </WorkForm>
    </div>
  );
}
