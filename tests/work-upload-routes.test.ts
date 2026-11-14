import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPayloadFromClientToken } from '@vercel/blob/client';
import { ForbiddenError } from '@/lib/errors';
const state = vi.hoisted(() => ({
  user: { id: 'owner' } as { id: string } | null,
  mode: { workFileStorage: 'vercel-blob' },
  reserve: vi.fn(), authorize: vi.fn(), download: vi.fn(), open: vi.fn(), cleanup: vi.fn(),
}));
vi.mock('@/lib/auth/session', () => ({ getCurrentUser: async () => state.user }));
vi.mock('@/lib/env', () => ({ env: state.mode, assertProductionConfig: vi.fn() }));
vi.mock('@/lib/services/workspace', () => ({ reserveWorkUploads: state.reserve, authorizeWorkUpload: state.authorize, downloadWorkFile: state.download, cleanupWorkUploads: state.cleanup }));
vi.mock('@/lib/storage/work-blob', () => ({ openWorkBlob: state.open }));
const { POST: reserve } = await import('@/app/api/work/uploads/reserve/route');
const { POST: token } = await import('@/app/api/work/uploads/route');
const { GET: download } = await import('@/app/api/work/files/[id]/route');
const { GET: cleanup } = await import('@/app/api/cron/uploads/route');
const id = randomUUID(), pathname = `work/${randomUUID()}/${randomUUID()}.pdf`;
const tokenBody = { type: 'blob.generate-client-token', payload: { pathname, clientPayload: id, multipart: false } };
function request(body: unknown, origin = 'http://localhost:3002') {
  return new Request('http://localhost:3002/api/work/uploads', {
    method: 'POST', headers: { 'Content-Type': 'application/json', origin }, body: JSON.stringify(body),
  });
}
beforeEach(() => {
  state.user = { id: 'owner' }; state.mode.workFileStorage = 'vercel-blob';
  state.reserve.mockReset().mockResolvedValue([{ id, blobPath: pathname }]);
  state.authorize.mockReset().mockResolvedValue({ maximumSizeInBytes: 1024, allowedContentTypes: ['application/pdf'],
    validUntil: Date.now() + 300000, allowOverwrite: false, addRandomSuffix: false });
  state.download.mockReset(); state.open.mockReset(); state.cleanup.mockReset().mockResolvedValue(1);
  // Synthetic signing credential, valid nowhere; no network or real credentials.
  vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'vercel_blob_rw_teststore_synthetic-signing-key');
});
afterEach(() => vi.unstubAllEnvs());

describe('upload HTTP boundaries', () => {
  it('requires sign-in for reservations and tokens', async () => {
    state.user = null;
    expect((await reserve(request({}))).status).toBe(401);
    expect((await token(request(tokenBody))).status).toBe(401);
    expect(state.authorize).not.toHaveBeenCalled();
  });
  it('rejects cross-origin, oversized and malformed token requests', async () => {
    expect((await token(request(tokenBody, 'https://other.example'))).status).toBe(403);
    expect((await token(request({ padding: 'x'.repeat(17000) }))).status).toBe(403);
    expect((await token(request({ ...tokenBody, payload: { ...tokenBody.payload, multipart: true } }))).status).toBe(403);
    expect((await token(request({ type: 'blob.upload-completed' }))).status).toBe(403);
    expect(state.authorize).not.toHaveBeenCalled();
  });
  it('signs a real SDK client token with the server-selected path, size, type and immutability limits', async () => {
    const response = await token(request(tokenBody));
    expect(response.status).toBe(200);
    const result = await response.json() as { clientToken: string };
    const payload = getPayloadFromClientToken(result.clientToken);
    expect(payload).toMatchObject({ pathname, maximumSizeInBytes: 1024, allowedContentTypes: ['application/pdf'], allowOverwrite: false, addRandomSuffix: false });
    expect(result.clientToken).not.toContain('synthetic-signing-key');
    expect(state.authorize).toHaveBeenCalledWith(state.user, id, pathname);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });
  it('denies unauthorized token scope and validates reservation metadata', async () => {
    state.authorize.mockRejectedValueOnce(new ForbiddenError('Only the task owner can upload.'));
    expect((await token(request(tokenBody))).status).toBe(403);
    expect((await reserve(request({ taskId: id, version: 0, files: [{ name: 'notes.pdf', size: 1024 }] }))).status).toBe(200);
    expect((await reserve(request({ taskId: id, version: 0, files: Array(4).fill({ name: 'notes.pdf', size: 1024 }) }))).status).toBe(400);
  });
  it('requires the scheduled-job secret before cleanup can run', async () => {
    vi.stubEnv('CRON_SECRET', 'local-test-cron-secret');
    expect((await cleanup(new Request('http://localhost:3002/api/cron/uploads'))).status).toBe(401);
    expect(state.cleanup).not.toHaveBeenCalled();
    expect((await cleanup(new Request('http://localhost:3002/api/cron/uploads', { headers: { authorization: 'Bearer local-test-cron-secret' } }))).status).toBe(200);
    expect(state.cleanup).toHaveBeenCalledOnce();
  });
});

describe('private file streaming', () => {
  const params = { params: Promise.resolve({ id }) };
  it('checks authorization before touching Blob and denies outsiders without revealing a storage URL', async () => {
    state.download.mockRejectedValueOnce(new ForbiddenError());
    const response = await download(new Request('http://localhost:3002'), params);
    expect(response.status).toBe(404); expect(state.open).not.toHaveBeenCalled();
  });
  it('streams a 5 MB private object with download protections and no fixed response length', async () => {
    const size = 5 * 1024 * 1024;
    state.download.mockResolvedValue({ name: 'private.pdf', size, contentType: 'application/pdf', blobPath: pathname, content: null });
    state.open.mockResolvedValue({ size, stream: new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(size)); controller.close(); } }) });
    const response = await download(new Request('http://localhost:3002'), params);
    expect(response.body).toBeInstanceOf(ReadableStream);
    expect((await response.arrayBuffer()).byteLength).toBe(size);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('content-disposition')).toContain('attachment');
    expect(response.headers.has('content-length')).toBe(false);
  });
  it('continues to stream existing database attachments', async () => {
    state.download.mockResolvedValue({ name: 'old.csv', size: 3, contentType: 'text/csv', blobPath: null, content: Buffer.from('abc') });
    const response = await download(new Request('http://localhost:3002'), params);
    expect(await response.text()).toBe('abc'); expect(state.open).not.toHaveBeenCalled();
  });
});
