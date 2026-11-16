import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/session';
import { env } from '@/lib/env';
import { isDomainError } from '@/lib/errors';
import { programmeFor, reserveTrackerUploads } from '@/lib/services/tracker';
import { assertSameOrigin, readUploadJson } from '@/lib/http/upload-request';
import { MAX_FILE_BYTES } from '@/lib/workspace';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user)
    return Response.json(
      { error: 'Sign in before uploading.' },
      { status: 401 },
    );
  try {
    assertSameOrigin(request);
    const input = z
      .object({
        programmeId: z.uuid(),
        files: z
          .array(
            z.object({
              name: z.string().min(1).max(255),
              size: z.number().int().min(1).max(MAX_FILE_BYTES),
            }),
          )
          .min(1)
          .max(3),
      })
      .parse(await readUploadJson(request));
    await programmeFor(user, input.programmeId);
    if (env.workFileStorage !== 'vercel-blob')
      return Response.json({ local: true });
    return Response.json(
      {
        uploads: await reserveTrackerUploads(
          user,
          input.programmeId,
          input.files,
        ),
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    if (isDomainError(error) || error instanceof z.ZodError)
      return Response.json({ error: error.message }, { status: 403 });
    throw error;
  }
}
