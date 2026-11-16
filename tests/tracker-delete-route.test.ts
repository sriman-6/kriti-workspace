import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ForbiddenError } from '@/lib/errors';
const state = vi.hoisted(() => ({ user: { id: 'manager' } as { id: string } | null, remove: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({ getCurrentUser: async () => state.user }));
vi.mock('@/lib/services/tracker', () => ({
  deleteTracker: state.remove,
  getTracker: vi.fn(), saveTrackerRow: vi.fn(), archiveTrackerRow: vi.fn(),
  createTrackerSheet: vi.fn(), addTrackerColumn: vi.fn(), updateTracker: vi.fn(),
  getTrackerHistory: vi.fn(), getTrackerResources: vi.fn(),
}));
vi.mock('@/lib/services/workspace', () => ({ configureProgrammeMember: vi.fn() }));
const { POST } = await import('@/app/api/trackers/[id]/route');
const id = randomUUID();
const deletion = { version: 2, confirmation: 'DELETE' };
const request = (body: unknown, origin = 'http://localhost:3002') => new Request(`http://localhost:3002/api/trackers/${id}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', origin }, body: JSON.stringify(body),
});
const params = { params: Promise.resolve({ id }) };
beforeEach(() => { state.user = { id: 'manager' }; state.remove.mockReset().mockResolvedValue(undefined); });
describe('tracker deletion HTTP boundary', () => {
  it('rejects anonymous and cross-origin deletion without calling the service', async () => {
    state.user = null;
    expect((await POST(request({ operation: 'delete', deletion }), params)).status).toBe(401);
    state.user = { id: 'manager' };
    expect((await POST(request({ operation: 'delete', deletion }, 'https://other.example'), params)).status).toBe(403);
    expect(state.remove).not.toHaveBeenCalled();
  });
  it('requires explicit confirmation and a valid current-version value', async () => {
    for (const invalid of [{ version: 2 }, { version: 2, confirmation: 'delete' }, { version: -1, confirmation: 'DELETE' }]) {
      expect((await POST(request({ operation: 'delete', deletion: invalid }), params)).status).toBe(400);
    }
    expect(state.remove).not.toHaveBeenCalled();
  });
  it('enforces service authorization and only returns success after deletion completes', async () => {
    state.remove.mockRejectedValueOnce(new ForbiddenError('Only people who manage this tracker can delete it.'));
    expect((await POST(request({ operation: 'delete', deletion }), params)).status).toBe(403);
    const response = await POST(request({ operation: 'delete', deletion }), params);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(state.remove).toHaveBeenLastCalledWith(state.user, id, deletion);
  });
});
