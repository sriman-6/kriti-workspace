import Link from 'next/link';
import { requireUser } from '@/lib/auth/session';
import { listMeetings, listContacts } from '@/lib/services/collaboration';
import { WorkForm } from '@/components/workspace/work-form';
import { MeetingFields } from '@/components/workspace/meeting-fields';
import { meetingAction } from '../collaboration-actions';
export const metadata = { title: 'Meetings' };
export default async function MeetingsPage() {
  const user = await requireUser();
  const [rows, contacts] = await Promise.all([
    listMeetings(user),
    listContacts(user),
  ]);
  const format = (date: Date, zone: string) =>
    new Intl.DateTimeFormat('en-IN', {
      timeZone: zone,
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  return (
    <div className="mx-auto max-w-3xl space-y-7">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Meetings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          People, agendas and the next commitments.
        </p>
      </header>
      <details className="rounded-lg border border-border p-4">
        <summary className="cursor-pointer text-sm font-medium">
          Schedule a meeting
        </summary>
        <WorkForm
          action={meetingAction}
          submitLabel="Schedule meeting"
          className="mt-5"
        >
          <MeetingFields
            people={contacts.filter((person) => person.id !== user.id)}
          />
        </WorkForm>
      </details>
      <div className="divide-y divide-border">
        {rows.length ? (
          rows.map(({ meeting, response }) => (
            <Link
              key={meeting.id}
              href={`/meetings/${meeting.id}`}
              className="flex flex-wrap items-start justify-between gap-3 py-4"
            >
              <div>
                <h2 className="text-sm font-medium">{meeting.title}</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {format(meeting.startsAt, meeting.timezone)} ·{' '}
                  {meeting.timezone === 'Asia/Dubai' ? 'GST' : 'IST'}
                </p>
              </div>
              <span className="text-xs capitalize text-muted-foreground">
                {meeting.status === 'scheduled' ? response : meeting.status}
              </span>
            </Link>
          ))
        ) : (
          <p className="py-12 text-sm text-muted-foreground">
            No meeting invitations yet.
          </p>
        )}
      </div>
    </div>
  );
}
