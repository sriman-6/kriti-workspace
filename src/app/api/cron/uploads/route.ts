import { timingSafeEqual } from 'node:crypto';
import { cleanupWorkUploads } from '@/lib/services/workspace';
import { assertProductionConfig } from '@/lib/env';

export const runtime = 'nodejs';
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const actual = Buffer.from(request.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${secret ?? ''}`);
  if (!secret || actual.length !== expected.length || !timingSafeEqual(actual, expected))
    return new Response('Unauthorized.', { status: 401 });
  assertProductionConfig();
  return Response.json({ removed: await cleanupWorkUploads() }, { headers: { 'Cache-Control': 'no-store' } });
}
