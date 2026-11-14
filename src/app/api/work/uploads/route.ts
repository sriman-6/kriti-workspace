import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/session';
import { env } from '@/lib/env';
import { isDomainError, ForbiddenError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { authorizeWorkUpload } from '@/lib/services/workspace';
import { assertSameOrigin, readUploadJson } from '@/lib/http/upload-request';

export const runtime = 'nodejs';
const tokenRequest = z.object({
  type: z.literal('blob.generate-client-token'),
  payload: z.object({ pathname: z.string().max(300), clientPayload: z.string().uuid(), multipart: z.literal(false) }),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Sign in before uploading.' }, { status: 401 });
  if (env.workFileStorage !== 'vercel-blob')
    return Response.json({ error: 'Direct uploads are not enabled.' }, { status: 409 });
  try {
    assertSameOrigin(request);
    const parsed = tokenRequest.safeParse(await readUploadJson(request));
    if (!parsed.success) throw new ForbiddenError('This upload request is unavailable.');
    const result = await handleUpload({
      request, body: parsed.data as HandleUploadBody,
      onBeforeGenerateToken: async (pathname, clientPayload, multipart) => {
        if (multipart || !clientPayload) throw new ForbiddenError('This upload request is unavailable.');
        return authorizeWorkUpload(user, clientPayload, pathname);
      },
      // Finalization re-reads the private object itself. It does not depend on a
      // public callback, browser-supplied URLs or callback access to localhost.
    });
    return Response.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (isDomainError(error)) return Response.json({ error: error.message }, { status: 403 });
    logger.error('Private upload token failed', error);
    return Response.json({ error: 'File storage is unavailable. Please try again.' }, { status: 503 });
  }
}
