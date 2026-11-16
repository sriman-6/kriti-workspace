import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPayloadFromClientToken } from '@vercel/blob/client';
import { ForbiddenError } from '@/lib/errors';
const state = vi.hoisted(() => ({ user: { id: 'owner' } as { id: string } | null, mode: { workFileStorage: 'vercel-blob' }, scope: vi.fn(), reserve: vi.fn(), authorize: vi.fn(), download: vi.fn(), open: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({ getCurrentUser: async () => state.user }));
vi.mock('@/lib/env', () => ({ env: state.mode }));
vi.mock('@/lib/services/tracker', () => ({ programmeFor: state.scope, reserveTrackerUploads: state.reserve, authorizeTrackerUpload: state.authorize, downloadTrackerFile: state.download }));
vi.mock('@/lib/storage/work-blob', () => ({ openWorkBlob: state.open }));
const { POST: reserve } = await import('@/app/api/trackers/uploads/reserve/route');
const { POST: token } = await import('@/app/api/trackers/uploads/route');
const { GET: download } = await import('@/app/api/trackers/files/[id]/route');
const id = randomUUID(), programmeId = randomUUID(), pathname = `trackers/${programmeId}/${id}.pdf`;
const body = { type: 'blob.generate-client-token', payload: { pathname, clientPayload: id, multipart: false } };
function request(data: unknown, origin = 'http://localhost:3002') { return new Request('http://localhost:3002/api/trackers/uploads', { method: 'POST', headers: { 'Content-Type': 'application/json', origin }, body: JSON.stringify(data) }); }
beforeEach(() => {
  state.user = { id: 'owner' }; state.mode.workFileStorage = 'vercel-blob';
  state.scope.mockReset().mockResolvedValue({}); state.reserve.mockReset().mockResolvedValue([{ id, blobPath: pathname }]);
  state.authorize.mockReset().mockResolvedValue({ maximumSizeInBytes: 1024, allowedContentTypes: ['application/pdf'], validUntil: Date.now() + 300000, allowOverwrite: false, addRandomSuffix: false });
  state.download.mockReset(); state.open.mockReset();
  vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'vercel_blob_rw_teststore_synthetic-signing-key');
});
afterEach(() => vi.unstubAllEnvs());
describe('tracker upload HTTP boundary', () => {
  it('requires sign-in, same-origin requests and a current programme scope', async () => {
    state.user = null; expect((await reserve(request({}))).status).toBe(401); expect((await token(request(body))).status).toBe(401);
    state.user = { id: 'owner' }; expect((await token(request(body, 'https://other.example'))).status).toBe(403);
    state.scope.mockRejectedValueOnce(new ForbiddenError());
    expect((await reserve(request({ programmeId, files: [{ name: 'notes.pdf', size: 100 }] }))).status).toBe(403);
    expect(state.reserve).not.toHaveBeenCalled();
  });
  it('issues a scoped immutable SDK token and rejects callbacks, multipart and oversized requests', async () => {
    const response = await token(request(body)); expect(response.status).toBe(200);
    const result = await response.json();
    expect(getPayloadFromClientToken(result.clientToken)).toMatchObject({ pathname, maximumSizeInBytes: 1024, allowedContentTypes: ['application/pdf'], allowOverwrite: false, addRandomSuffix: false });
    expect(state.authorize).toHaveBeenCalledWith(state.user, id, pathname);
    expect((await token(request({ ...body, payload: { ...body.payload, multipart: true } }))).status).toBe(403);
    expect((await token(request({ type: 'blob.upload-completed' }))).status).toBe(403);
    expect((await token(request({ padding: 'x'.repeat(17000) }))).status).toBe(403);
  });
  it('passes programme reservations to the tracker service and denies excess size/count', async () => {
    const files = [{ name: 'notes.pdf', size: 100 }]; expect((await reserve(request({ programmeId, files }))).status).toBe(200);
    expect(state.reserve).toHaveBeenCalledWith(state.user, programmeId, files);
    expect((await reserve(request({ programmeId, files: Array(4).fill(files[0]) }))).status).toBe(403);
    expect((await reserve(request({ programmeId, files: [{ name: 'large.pdf', size: 5 * 1024 * 1024 + 1 }] }))).status).toBe(403);
  });
  it('checks membership before streaming private bytes and validates canonical object size', async () => {
    const params = { params: Promise.resolve({ id }) };
    state.download.mockRejectedValueOnce(new ForbiddenError()); expect((await download(new Request('http://localhost:3002'), params)).status).toBe(404); expect(state.open).not.toHaveBeenCalled();
    state.download.mockResolvedValue({ name: 'report.pdf', size: 5 * 1024 * 1024, contentType: 'application/pdf', blobPath: pathname });
    state.open.mockResolvedValue({ size: 5 * 1024 * 1024, stream: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(5 * 1024 * 1024)); controller.close(); } }) });
    const response = await download(new Request('http://localhost:3002'), params); expect((await response.arrayBuffer()).byteLength).toBe(5 * 1024 * 1024); expect(response.headers.get('cache-control')).toBe('private, no-store'); expect(response.headers.get('content-disposition')).toContain('attachment');
    state.open.mockResolvedValue({ size: 1, stream: new ReadableStream({ start(controller) { controller.close(); } }) });
    expect((await download(new Request('http://localhost:3002'), params)).status).toBe(404);
  });
});
