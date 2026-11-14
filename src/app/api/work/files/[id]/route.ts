import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/session';
import { downloadWorkFile } from '@/lib/services/workspace';
import { isDomainError } from '@/lib/errors';
import { openWorkBlob } from '@/lib/storage/work-blob';

export const runtime = 'nodejs';
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user)
    return new Response('Sign in to download this file.', { status: 401 });
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success)
    return new Response('File unavailable.', { status: 404 });
  try {
    const file = await downloadWorkFile(user, id);
    let body: ReadableStream<Uint8Array> | Uint8Array;
    if (file.blobPath) {
      const blob = await openWorkBlob(file.blobPath);
      if (blob.size !== file.size) {
        await blob.stream.cancel();
        return new Response('File unavailable.', { status: 404 });
      }
      body = blob.stream;
    } else {
      if (!file.content) return new Response('File unavailable.', { status: 404 });
      // A stream also keeps existing database files within Vercel's response limit.
      const bytes = new Uint8Array(file.content);
      let offset = 0;
      body = new ReadableStream({ pull(controller) {
        if (offset >= bytes.length) { controller.close(); return; }
        controller.enqueue(bytes.subarray(offset, offset + 64 * 1024));
        offset += 64 * 1024;
      } });
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
