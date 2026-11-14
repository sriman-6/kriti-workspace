import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  account: null as null | { id: string; email: string; isActive: boolean; externalGoogleApproved: boolean; role: string },
  identity: null as null | { email: string; fullName: string | null },
  createSession: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
}));
vi.mock('@/lib/db', () => ({
  users: { email: 'email', id: 'id' },
  db: {
    select: state.select,
    update: state.update,
  },
}));
vi.mock('@/lib/auth/session', () => ({ createSession: state.createSession }));
vi.mock('@/lib/env', () => ({ isGoogleAuthConfigured: true }));
vi.mock('@/lib/auth/google-oauth', () => ({
  OAUTH_STATE_COOKIE: 'kriti_oauth_state',
  verifyState: (returned: string, cookie: string) => returned === 'valid-state' && cookie === 'valid-state',
  exchangeCodeForIdentity: async () => state.identity,
}));
const { GET } = await import('@/app/api/auth/callback/route');

beforeEach(() => {
  state.account = null;
  state.identity = { email: 'member@gmail.com', fullName: 'Member' };
  state.createSession.mockReset();
  state.select.mockReset().mockImplementation(() => ({ from: () => ({ where: () => ({ limit: async () => state.account ? [state.account] : [] }) }) }));
  state.update.mockReset().mockReturnValue({ set: () => ({ where: async () => undefined }) });
});
const request = (validState = true) => new Request(
  `http://localhost:3001/api/auth/callback?code=verified-code&state=${validState ? 'valid-state' : 'forged'}`,
  { headers: { cookie: 'kriti_oauth_state=valid-state' } },
);
function account(extra = {}) {
  state.account = { id: 'registered-member', email: state.identity!.email, isActive: true, externalGoogleApproved: true, role: 'member', ...extra };
}

describe('registered Google callback authorization', () => {
  it('creates a session for the verified, explicitly approved external account', async () => {
    account();
    const result = await GET(request());
    expect(result.headers.get('location')).toBe('http://localhost:3001/dashboard');
    expect(state.createSession).toHaveBeenCalledWith('registered-member');
    expect(result.headers.get('set-cookie')).toContain('Max-Age=0');
  });
  it('does not admit an unregistered Gmail address', async () => {
    expect((await GET(request())).headers.get('location')).toContain('reason=domain');
    expect(state.createSession).not.toHaveBeenCalled();
  });
  it('rejects a registered external address without explicit approval', async () => {
    account({ externalGoogleApproved: false });
    expect((await GET(request())).headers.get('location')).toContain('reason=domain');
    expect(state.createSession).not.toHaveBeenCalled();
  });
  it('rejects a disabled approved external account', async () => {
    account({ isActive: false });
    expect((await GET(request())).headers.get('location')).toContain('reason=disabled');
    expect(state.createSession).not.toHaveBeenCalled();
  });
  it('keeps registration mandatory for a valid BITS identity', async () => {
    state.identity!.email = 'member@pilani.bits-pilani.ac.in';
    expect((await GET(request())).headers.get('location')).toContain('reason=not_authorised');
    expect(state.createSession).not.toHaveBeenCalled();
  });
  it('accepts a registered BITS account without the external flag', async () => {
    state.identity!.email = 'member@pilani.bits-pilani.ac.in';
    account({ externalGoogleApproved: false });
    expect((await GET(request())).headers.get('location')).toContain('/dashboard');
    expect(state.createSession).toHaveBeenCalled();
  });
  it('does not query accounts or create sessions after failed identity verification or forged state', async () => {
    expect((await GET(request(false))).headers.get('location')).toContain('oauth_state');
    state.identity = null;
    expect((await GET(request())).headers.get('location')).toContain('oauth_failed');
    expect(state.select).not.toHaveBeenCalled();
    expect(state.createSession).not.toHaveBeenCalled();
  });
});
