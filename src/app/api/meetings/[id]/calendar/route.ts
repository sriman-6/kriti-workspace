import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/session';
import { getMeeting } from '@/lib/services/collaboration';
import { isDomainError } from '@/lib/errors';
const escape = (value: string) =>
  value
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
const stamp = (date: Date) =>
  date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user)
    return new Response('Sign in to export this meeting.', { status: 401 });
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success)
    return new Response('Meeting unavailable.', { status: 404 });
  try {
    const { meeting } = await getMeeting(user, id);
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//KRITI//Workspace//EN',
      'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT',
      `UID:${id}@kriti.bits-pilani.ac.in`,
      `DTSTAMP:${stamp(new Date())}`,
      `DTSTART:${stamp(meeting.startsAt)}`,
      `DTEND:${stamp(meeting.endsAt)}`,
      `SUMMARY:${escape(meeting.title)}`,
      `DESCRIPTION:${escape(meeting.agenda)}`,
      `LOCATION:${escape(meeting.location)}`,
      `STATUS:${meeting.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED'}`,
      ...(meeting.joinUrl ? [`URL:${new URL(meeting.joinUrl).href}`] : []),
      'END:VEVENT',
      'END:VCALENDAR',
    ];
    const folded = lines.map((line) => {
      let result = '',
        width = 0;
      for (const char of line) {
        const bytes = Buffer.byteLength(char);
        if (width + bytes > 74) {
          result += '\r\n ';
          width = 1;
        }
        result += char;
        width += bytes;
      }
      return result;
    });
    return new Response(folded.join('\r\n') + '\r\n', {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'attachment; filename="kriti-meeting.ics"',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    if (isDomainError(error))
      return new Response('Meeting unavailable.', { status: 404 });
    throw error;
  }
}
