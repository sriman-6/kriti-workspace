import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/session';
import { getMeeting, listContacts } from '@/lib/services/collaboration';
import { NotFoundError } from '@/lib/errors';
import { getWorkspaceAccess } from '@/lib/services/workspace';
import { WorkForm } from '@/components/workspace/work-form';
import { MeetingFields } from '@/components/workspace/meeting-fields';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  meetingAction,
  meetingResponseAction,
  meetingCloseAction,
} from '../../collaboration-actions';
export const metadata = { title: 'Meeting' };
function local(date: Date, zone: string) {
  return new Date(date.getTime() + (zone === 'Asia/Dubai' ? 240 : 330) * 60000)
    .toISOString()
    .slice(0, 16);
}
export default async function MeetingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  let detail;
  try {
    detail = await getMeeting(user, id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  const { meeting, participants, response } = detail;
  const owner = meeting.organizerId === user.id;
  const contacts = owner ? await listContacts(user) : [];
  const access=await getWorkspaceAccess(user);
  const canAssign=access.isHead||access.memberships.some(member=>['lead','manager'].includes(member.role));
  const when = new Intl.DateTimeFormat('en-IN', {
    timeZone: meeting.timezone,
    dateStyle: 'full',
    timeStyle: 'short',
  });
  return (
    <div className="mx-auto max-w-3xl space-y-7">
      <header>
        <Link href="/meetings" className="text-sm text-muted-foreground">
          ← Meetings
        </Link>
        <h1 className="mt-4 break-words text-2xl font-semibold tracking-tight">
          {meeting.title}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {when.format(meeting.startsAt)} ·{' '}
          {meeting.timezone === 'Asia/Dubai' ? 'GST' : 'IST'}
        </p>
        <p className="mt-1 text-xs capitalize text-muted-foreground">
          {meeting.status} ·{' '}
          {Math.round(
            (meeting.endsAt.getTime() - meeting.startsAt.getTime()) / 60000,
          )}{' '}
          minutes
        </p>
      </header>
      <a href={`/api/meetings/${id}/calendar`} className="inline-block text-sm text-primary">Download calendar entry ↓</a>
      {meeting.joinUrl ? (
        <a
          href={meeting.joinUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
        >
          Join meeting ↗
        </a>
      ) : null}
      {meeting.location ? <p className="text-sm">{meeting.location}</p> : null}
      {meeting.agenda ? (
        <section>
          <h2 className="text-sm font-medium">Agenda</h2>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">
            {meeting.agenda}
          </p>
        </section>
      ) : null}
      <section className="space-y-3 border-t border-border pt-5">
        <h2 className="text-sm font-medium">Participants</h2>
        {participants.map((person) => (
          <p key={person.id} className="flex justify-between gap-3 text-sm">
            <span>
              {person.fullName}
              {person.id === meeting.organizerId ? ' · Organiser' : ''}
            </span>
            <span className="text-xs capitalize text-muted-foreground">
              {person.response}
            </span>
          </p>
        ))}
      </section>
      {!owner && meeting.status === 'scheduled' ? (
        <WorkForm action={meetingResponseAction} submitLabel="Save response">
          <input type="hidden" name="id" value={id} />
          <Label htmlFor="response">Your response</Label>
          <select
            id="response"
            name="response"
            defaultValue={response === 'invited' ? 'accepted' : response}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="accepted">Accept</option>
            <option value="declined">Decline</option>
          </select>
        </WorkForm>
      ) : null}
      {meeting.minutes ? (
        <section className="border-t border-border pt-5">
          <h2 className="text-sm font-medium">Minutes & decisions</h2>
          <p className="mt-3 whitespace-pre-wrap break-words text-sm">
            {meeting.minutes}
          </p>
          {canAssign?<Link
            href={`/work/new?meeting=${id}`}
            className="mt-4 inline-block text-sm text-primary"
          >
            Assign a follow-up task →
          </Link>:null}
        </section>
      ) : null}
      {owner && meeting.status === 'scheduled' ? (
        <>
          <details className="border-t border-border pt-5">
            <summary className="cursor-pointer text-sm font-medium">
              Edit / reschedule
            </summary>
            <WorkForm
              key={meeting.version}
              action={meetingAction}
              submitLabel="Save meeting"
              className="mt-4"
            >
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="version" value={meeting.version} />
              <MeetingFields
                people={contacts.filter((person) => person.id !== user.id)}
                selected={participants.map((person) => person.id)}
                defaults={{
                  ...meeting,
                  start: local(meeting.startsAt, meeting.timezone),
                  end: local(meeting.endsAt, meeting.timezone),
                }}
              />
            </WorkForm>
          </details>
          <details className="border-t border-border pt-5">
            <summary className="cursor-pointer text-sm font-medium">
              Record outcome / cancel
            </summary>
            <WorkForm
              action={meetingCloseAction}
              submitLabel="Save outcome"
              className="mt-4"
            >
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="version" value={meeting.version} />
              <Label htmlFor="outcome">Outcome</Label>
              <select
                id="outcome"
                name="status"
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <Label htmlFor="minutes">
                Minutes, decisions and action items
              </Label>
              <Textarea
                id="minutes"
                name="minutes"
                maxLength={15000}
                rows={5}
              />
            </WorkForm>
          </details>
        </>
      ) : null}
    </div>
  );
}
