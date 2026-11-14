import { afterEach, describe, expect, it, vi } from 'vitest';
const sdk = vi.hoisted(() => ({ get: vi.fn(), head: vi.fn(), del: vi.fn() }));
vi.mock('@vercel/blob', async () => ({
  ...await vi.importActual<typeof import('@vercel/blob')>('@vercel/blob'),
  get: sdk.get, head: sdk.head, del: sdk.del,
}));
import { openWorkBlob, readWorkBlob } from '@/lib/storage/work-blob';
afterEach(() => vi.resetAllMocks());
function result(size: number, chunks: string[], cancelled = vi.fn()) {
  return { statusCode: 200, blob: { size }, stream: new ReadableStream<Uint8Array>({
    start(controller) { for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk)); controller.close(); },
    cancel: cancelled,
  }) };
}
describe('private Blob adapter', () => {
  it('uses private, fresh reads and reconstructs a bounded upload stream', async () => {
    sdk.head.mockResolvedValue({ size: 6 });
    sdk.get.mockResolvedValue(result(6, ['abc', 'def']));
    expect((await readWorkBlob('work/known.csv', 6)).toString()).toBe('abcdef');
    expect(sdk.get).toHaveBeenCalledWith('work/known.csv', { access: 'private', useCache: false });
  });
  it('accepts a compressed/chunked response whose SDK transport size is zero', async () => {
    sdk.head.mockResolvedValue({ size: 6 });
    sdk.get.mockResolvedValue(result(0, ['abc', 'def']));
    expect((await readWorkBlob('work/chunked.txt', 6)).toString()).toBe('abcdef');
    expect(sdk.head).toHaveBeenCalledWith('work/chunked.txt');
  });
  it('rejects missing, truncated and larger-than-declared responses', async () => {
    sdk.head.mockResolvedValue({ size: 3 });
    sdk.get.mockResolvedValueOnce(null);
    await expect(openWorkBlob('work/missing.csv')).rejects.toThrow();
    sdk.get.mockResolvedValueOnce(result(3, ['ab']));
    await expect(readWorkBlob('work/short.csv', 3)).rejects.toThrow('incomplete');
    sdk.get.mockResolvedValueOnce(result(3, ['abcd']));
    await expect(readWorkBlob('work/long.csv', 3)).rejects.toThrow('allowed size');
    sdk.head.mockResolvedValueOnce({ size: 4 });
    sdk.get.mockResolvedValueOnce(result(4, ['abcd']));
    await expect(readWorkBlob('work/wrong.csv', 3)).rejects.toThrow('does not match');
  });
});
