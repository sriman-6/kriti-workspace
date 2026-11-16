import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/session';
import { env } from '@/lib/env';
import { isDomainError, ForbiddenError } from '@/lib/errors';
import {
  authorizeTrackerUpload,
  reserveTrackerUploads,
} from '@/lib/services/tracker';
import { assertSameOrigin, readUploadJson } from '@/lib/http/upload-request';

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
    if (env.workFileStorage === 'database') {
      if (Number(request.headers.get('content-length') ?? 0) > 16 * 1024 * 1024)
        throw new ForbiddenError(
          'Choose up to three files, at most 5 MB each.',
        );
      const data = await request.formData();
      const id = z.uuid().parse(data.get('programmeId'));
      const files = data
        .getAll('files')
        .filter((file): file is File => file instanceof File);
      return Response.json({
        uploads: await reserveTrackerUploads(
          user,
          id,
          files.map(({ name, size }) => ({ name, size })),
          files,
        ),
      });
    }
    const parsed = z
      .object({
        type: z.literal('blob.generate-client-token'),
        payload: z.object({
          pathname: z.string().max(300),
          clientPayload: z.uuid(),
          multipart: z.literal(false),
        }),
      })
      .safeParse(await readUploadJson(request));
    if (!parsed.success)
      throw new ForbiddenError('This upload is unavailable.');
    const result = await handleUpload({
      request,
      body: parsed.data as HandleUploadBody,
      onBeforeGenerateToken: async (pathname, payload, multipart) => {
        if (!payload || multipart)
          throw new ForbiddenError('This upload is unavailable.');
        return authorizeTrackerUpload(user, payload, pathname);
      },
    });
    return Response.json(result, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    if (isDomainError(error))
      return Response.json({ error: error.message }, { status: 403 });
    return Response.json(
      { error: 'Unable to attach this file. Please try again.' },
      { status: 503 },
    );
  }
}
