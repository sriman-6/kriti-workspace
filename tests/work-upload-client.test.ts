import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prepareWorkFiles } from '@/lib/client/work-upload';
const blob = vi.hoisted(() => ({ upload: vi.fn() }));
vi.mock('@vercel/blob/client', () => ({ upload: blob.upload }));
const context = { taskId: randomUUID(), version: 0 };
const fetchMock = vi.fn();
beforeEach(() => {
  blob.upload.mockReset().mockResolvedValue({});
  fetchMock.mockReset().mockImplementation(async (_url, options) => {
    const input = JSON.parse(options.body as string) as { files: { name: string }[] };
    return Response.json({ uploads: input.files.map(() => ({ id: randomUUID(), blobPath: `work/${randomUUID()}.csv`, contentType: 'text/csv' })) });
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('browser direct upload preparation', () => {
  it('uploads three 5 MB files privately while requests to the app contain only metadata', async () => {
    const contents = 'a'.repeat(5 * 1024 * 1024);
    const files = [1, 2, 3].map((index) => new File([contents], `data-${index}.csv`));
    const result = await prepareWorkFiles(context, files, vi.fn(), null);
    expect(result.ids).toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledOnce();
    const options = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(String(options.body).length).toBeLessThan(1024);
    expect(JSON.parse(String(options.body))).toMatchObject({ taskId: context.taskId, version: 0, files: [{ name: 'data-1.csv', size: contents.length }, { name: 'data-2.csv', size: contents.length }, { name: 'data-3.csv', size: contents.length }] });
    expect(blob.upload).toHaveBeenCalledTimes(3);
    for (const [, file, options] of blob.upload.mock.calls) {
      expect(file).toBeInstanceOf(File);
      expect(options).toMatchObject({ access: 'private', multipart: false, handleUploadUrl: '/api/work/uploads' });
    }
  });

  it('reuses completed uploads after validation errors and detects different bytes with identical names and sizes', async () => {
    const first = [new File(['abc'], 'notes.csv')];
    const cached = await prepareWorkFiles(context, first, vi.fn(), null);
    expect((await prepareWorkFiles(context, [new File(['abc'], 'notes.csv')], vi.fn(), cached)).ids).toEqual(cached.ids);
    expect(blob.upload).toHaveBeenCalledOnce();
    await prepareWorkFiles(context, [new File(['xyz'], 'notes.csv')], vi.fn(), cached);
    expect(blob.upload).toHaveBeenCalledTimes(2);
  });

  it('rejects unsupported, oversized, empty and false-signature files before contacting storage', async () => {
    for (const file of [new File(['x'], 'script.html'), new File(['x'.repeat(5 * 1024 * 1024 + 1)], 'large.csv'),
      new File([], 'empty.csv'), new File(['not a PDF'], 'fake.pdf')])
      await expect(prepareWorkFiles(context, [file], vi.fn(), null)).rejects.toThrow();
    await expect(prepareWorkFiles(context, Array(4).fill(new File(['x'], 'notes.csv')), vi.fn(), null)).rejects.toThrow('three');
    expect(fetchMock).not.toHaveBeenCalled(); expect(blob.upload).not.toHaveBeenCalled();
  });

  it('does not contact storage for link-only work', async () => {
    expect((await prepareWorkFiles(context, [], vi.fn(), null)).ids).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled(); expect(blob.upload).not.toHaveBeenCalled();
  });

  it('preserves reservation errors and reports expired sessions clearly', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ error: 'This work changed. Reload the page.' }, { status: 403 }));
    await expect(prepareWorkFiles(context, [new File(['x'], 'notes.csv')], vi.fn(), null)).rejects.toThrow('work changed');
    fetchMock.mockResolvedValueOnce(new Response('<html>Sign in</html>', { headers: { 'Content-Type': 'text/html' } }));
    await expect(prepareWorkFiles(context, [new File(['x'], 'notes.csv')], vi.fn(), null)).rejects.toThrow('session');
    expect(blob.upload).not.toHaveBeenCalled();
  });

  it('returns no submission references if an upload fails', async () => {
    blob.upload.mockRejectedValueOnce(new Error('provider error'));
    await expect(prepareWorkFiles(context, [new File(['x'], 'notes.csv')], vi.fn(), null)).rejects.toThrow('has not been submitted');
  });
});
