import 'server-only';
import { ForbiddenError } from '@/lib/errors';

export function assertSameOrigin(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin)
    throw new ForbiddenError('Refresh this page before uploading.');
}

export async function readUploadJson(request: Request, maximumBytes = 16 * 1024): Promise<unknown> {
  if (!request.headers.get('content-type')?.startsWith('application/json') || !request.body)
    throw new ForbiddenError('Send a valid upload request.');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.length;
      if (size > maximumBytes) {
        await reader.cancel();
        throw new ForbiddenError('The upload request is too large.');
      }
      chunks.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks, size).toString('utf8')); }
  catch { throw new ForbiddenError('Send a valid upload request.'); }
}
