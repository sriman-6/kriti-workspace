import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/session';
import { env } from '@/lib/env';
import { isDomainError } from '@/lib/errors';
import { reserveWorkUploads } from '@/lib/services/workspace';
import { assertSameOrigin, readUploadJson } from '@/lib/http/upload-request';
import { MAX_FILE_BYTES, MAX_SUBMISSION_FILES } from '@/lib/workspace';

export const runtime = 'nodejs';
const reservation = z.object({
  taskId: z.uuid(), version: z.number().int().nonnegative(),
  files: z.array(z.object({ name: z.string().min(1).max(255), size: z.number().int().min(1).max(MAX_FILE_BYTES) })).min(1).max(MAX_SUBMISSION_FILES),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Sign in before uploading.' }, { status: 401 });
  if (env.workFileStorage !== 'vercel-blob')
    return Response.json({ error: 'Direct uploads are not enabled.' }, { status: 409 });
  try {
    assertSameOrigin(request);
    const parsed = reservation.safeParse(await readUploadJson(request));
    if (!parsed.success) return Response.json({ error: 'Choose up to three supported files, at most 5 MB each.' }, { status: 400 });
    const uploads = await reserveWorkUploads(user, parsed.data);
    return Response.json({ uploads }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (isDomainError(error)) return Response.json({ error: error.message }, { status: 403 });
    throw error;
  }
}
