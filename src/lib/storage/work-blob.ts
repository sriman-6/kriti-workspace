import 'server-only';
import { BlobNotFoundError, del, get, head } from '@vercel/blob';
import { ForbiddenError, NotFoundError } from '@/lib/errors';
import { MAX_FILE_BYTES } from '@/lib/workspace';

// Only server-generated pathnames from our database reach the SDK. Browser URLs
// and credentials are never accepted as storage references.
export async function openWorkBlob(pathname: string) {
  try {
    // Private text responses can be compressed/chunked with no Content-Length.
    // The SDK then reports get().blob.size = 0, despite streaming every byte.
    // Use canonical object metadata; validate the actual stream separately.
    const metadata = await head(pathname);
    const result = await get(pathname, { access: 'private', useCache: false });
    if (result?.statusCode !== 200) throw new NotFoundError();
    return { stream: result.stream, size: metadata.size };
  } catch (error) {
    if (error instanceof BlobNotFoundError) throw new NotFoundError();
    throw error;
  }
}

export async function readWorkBlob(pathname: string, expectedSize: number) {
  const result = await openWorkBlob(pathname);
  if (result.size !== expectedSize || result.size > MAX_FILE_BYTES) {
    await result.stream.cancel();
    throw new ForbiddenError('The uploaded file size does not match. Choose the file again.');
  }
  const reader = result.stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > expectedSize) {
        await reader.cancel();
        throw new ForbiddenError('The uploaded file exceeds its allowed size.');
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  if (size !== expectedSize) throw new ForbiddenError('The file upload is incomplete. Choose the file again.');
  return Buffer.concat(chunks, size);
}

export async function deleteWorkBlob(pathname: string) {
  await del(pathname);
}
