import { describeWorkFile, validateWorkFileContent } from '@/lib/work-files';
import { MAX_SUBMISSION_FILES } from '@/lib/workspace';

export type PreparedWorkFiles = { fingerprint: string; ids: string[]; expiresAt: number };
type Reservation = { id: string; blobPath: string; contentType: string };

export async function prepareWorkFiles(
  context: { taskId: string; version: number },
  files: File[],
  progress: (message: string) => void,
  cached: PreparedWorkFiles | null,
): Promise<PreparedWorkFiles> {
  if (files.length > MAX_SUBMISSION_FILES) throw new Error('Upload at most three files per submission.');
  const fingerprints: string[] = [];
  for (const file of files) {
    const metadata = describeWorkFile(file.name, file.size);
    const bytes = await file.arrayBuffer();
    validateWorkFileContent(metadata, new Uint8Array(bytes));
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    fingerprints.push(`${metadata.name}:${file.size}:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`);
  }
  const fingerprint = JSON.stringify([context.taskId, context.version, ...fingerprints]);
  if (cached?.fingerprint === fingerprint && cached.expiresAt > Date.now()) return cached;
  if (!files.length) return { fingerprint, ids: [], expiresAt: Date.now() };
  let response: Response;
  try {
    response = await fetch('/api/work/uploads/reserve', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...context, files: files.map((file) => ({ name: file.name, size: file.size })) }),
    });
  } catch { throw new Error('Unable to prepare uploads. Check your connection and try again.'); }
  if (!response.headers.get('content-type')?.startsWith('application/json'))
    throw new Error('Your session may have expired. Sign in again before submitting work.');
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error ?? 'Unable to prepare uploads. Refresh this page and try again.');
  }
  const { uploads } = await response.json() as { uploads: Reservation[] };
  if (uploads.length !== files.length) throw new Error('Unable to prepare uploads. Please try again.');
  const { upload } = await import('@vercel/blob/client');
  for (let index = 0; index < files.length; index++) {
    const reservation = uploads[index]!;
    try {
      await upload(reservation.blobPath, files[index]!, {
        access: 'private', handleUploadUrl: '/api/work/uploads',
        clientPayload: reservation.id, contentType: reservation.contentType,
        multipart: false,
        onUploadProgress: ({ percentage }) => progress(`Uploading ${index + 1} of ${files.length} · ${Math.round(percentage)}%`),
      });
    } catch { throw new Error('File upload failed. Your work has not been submitted. Please try again.'); }
  }
  return { fingerprint, ids: uploads.map((item) => item.id), expiresAt: Date.now() + 45 * 60 * 1000 };
}
