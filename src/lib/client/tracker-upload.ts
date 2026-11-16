import { describeWorkFile, validateWorkFileContent } from '@/lib/work-files';

async function payload(response: Response) {
  const data = await response.json().catch(() => null);
  if (!response.ok || !data)
    throw new Error(
      data?.error ??
        'Unable to attach files. Check your connection and try again.',
    );
  return data;
}
export async function prepareTrackerFiles(
  programmeId: string,
  files: File[],
  progress: (text: string) => void,
): Promise<string[]> {
  if (!files.length) return [];
  if (files.length > 3)
    throw new Error('Attach up to three files per message.');
  for (const file of files) {
    const metadata = describeWorkFile(file.name, file.size);
    validateWorkFileContent(metadata, new Uint8Array(await file.arrayBuffer()));
  }
  const reservation = await payload(
    await fetch('/api/trackers/uploads/reserve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        programmeId,
        files: files.map(({ name, size }) => ({ name, size })),
      }),
    }),
  );
  if (reservation.local) {
    const data = new FormData();
    data.set('programmeId', programmeId);
    for (const file of files) data.append('files', file);
    progress('Attaching files…');
    const result = await payload(
      await fetch('/api/trackers/uploads', { method: 'POST', body: data }),
    );
    return result.uploads.map((file: { id: string }) => file.id);
  }
  const uploads = reservation.uploads as {
    id: string;
    blobPath: string;
    contentType: string;
  }[];
  if (uploads.length !== files.length)
    throw new Error('Unable to prepare files. Please try again.');
  const { upload } = await import('@vercel/blob/client');
  for (const [index, item] of uploads.entries()) {
    await upload(item.blobPath, files[index]!, {
      access: 'private',
      handleUploadUrl: '/api/trackers/uploads',
      clientPayload: item.id,
      contentType: item.contentType,
      multipart: false,
      onUploadProgress: ({ percentage }) =>
        progress(
          `Attaching ${index + 1} of ${files.length} · ${Math.round(percentage)}%`,
        ),
    });
  }
  return uploads.map((file) => file.id);
}
