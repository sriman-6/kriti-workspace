import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/session';
import { downloadTrackerFile } from '@/lib/services/tracker';
import { isDomainError } from '@/lib/errors';
import { openWorkBlob } from '@/lib/storage/work-blob';

export const runtime = 'nodejs';
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return new Response('Sign in to download.', { status: 401 });
  const { id } = await params;
  if (!z.uuid().safeParse(id).success)
    return new Response('File unavailable.', { status: 404 });
  try {
    const file = await downloadTrackerFile(user, id);
    let body: ReadableStream<Uint8Array>;
    if (file.blobPath) {
      const blob = await openWorkBlob(file.blobPath);
      if (blob.size !== file.size) {
        await blob.stream.cancel();
        return new Response('File unavailable.', { status: 404 });
      }
      body = blob.stream;
    } else {
      const bytes = Buffer.from(file.content ?? '', 'base64');
      if (bytes.length !== file.size)
        return new Response('File unavailable.', { status: 404 });
      body = new ReadableStream({
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        },
      });
    }
    return new Response(body, {
      headers: {
        'Content-Type': file.contentType,
        'Content-Disposition': `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(file.name).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16)}`)}`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      },
    });
  } catch (error) {
    if (isDomainError(error))
      return new Response('File unavailable.', { status: 404 });
    throw error;
  }
}
