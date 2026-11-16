import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/session';
import { env } from '@/lib/env';
import { isDomainError } from '@/lib/errors';
import { requireGroup, reserveChatUploads } from '@/lib/services/chat';
import { assertSameOrigin, readUploadJson } from '@/lib/http/upload-request';
import { MAX_FILE_BYTES } from '@/lib/workspace';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user)
    return Response.json(
      { error: 'Sign in again before attaching files.' },
      { status: 401 },
    );
  try {
    assertSameOrigin(request);
    const parsed = z
      .object({
        groupId: z.uuid(),
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
      .safeParse(await readUploadJson(request));
    if (!parsed.success)
      return Response.json(
        { error: 'Choose up to three supported files, at most 5 MB each.' },
        { status: 400 },
      );
    await requireGroup(user, parsed.data.groupId, undefined, true);
    if (env.workFileStorage !== 'vercel-blob')
      return Response.json({ local: true });
    return Response.json(
      {
        uploads: await reserveChatUploads(
          user,
          parsed.data.groupId,
          parsed.data.files,
        ),
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    if (isDomainError(error))
      return Response.json({ error: error.message }, { status: 403 });
    throw error;
  }
}
