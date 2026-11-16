import { notFound } from 'next/navigation';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/session';
import { getTracker } from '@/lib/services/tracker';
import { getWorkSharingPeople } from '@/lib/services/workspace';
import { NotFoundError } from '@/lib/errors';
import { TrackerWorkspace } from '@/components/workspace/tracker-workspace';
export const metadata = { title: 'Tracker' };
export default async function TrackerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ sheet?: string }> }) {
  const user = await requireUser(); const [{id}, query] = await Promise.all([params, searchParams]);
  if (!z.uuid().safeParse(id).success || (query.sheet && !z.uuid().safeParse(query.sheet).success)) notFound();
  let detail;
  try { detail = await getTracker(user, id, query.sheet); } catch (error) { if (error instanceof NotFoundError) notFound(); throw error; }
  const people = detail.canManage ? await getWorkSharingPeople() : [];
  return <TrackerWorkspace key={`${id}:${query.sheet ?? 'main'}`} initial={detail} people={people} userId={user.id} />;
}
