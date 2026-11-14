import { afterEach, describe, expect, it, vi } from 'vitest';
import { isAllowedBitsEmail, isAllowedGoogleEmail, campusForEmail } from '@/lib/auth/domains';
import {
  createState,
  verifyState,
  buildAuthorizeUrl,
  exchangeCodeForIdentity,
} from '@/lib/auth/google-oauth';
afterEach(() => vi.unstubAllGlobals());
describe('registered institute identity', () => {
  it.each([
    'head.kriti@bits-pilani.ac.in',
    'member@pilani.bits-pilani.ac.in',
    'member@goa.bits-pilani.ac.in',
    'member@hyderabad.bits-pilani.ac.in',
    'member@dubai.bits-pilani.ac.in',
  ])('accepts official BITS domain: %s', (email) =>
    expect(isAllowedBitsEmail(email)).toBe(true),
  );
  it.each([
    'head.kriti@gmail.com',
    'someone@bits-pilani.ac.in.evil.com',
    'someone@notbits-pilani.ac.in',
    'someone',
  ])('rejects lookalike/external domain: %s', (email) =>
    expect(isAllowedBitsEmail(email)).toBe(false),
  );
  it('does not invent campus scope for institute accounts', () =>
    expect(campusForEmail('head.kriti@bits-pilani.ac.in')).toBeNull());
  it('approves only the exact external registered Google address', () => {
    const account = { email: 'approved@example.com', externalGoogleApproved: true };
    expect(isAllowedGoogleEmail('approved@example.com', account)).toBe(true);
    expect(isAllowedGoogleEmail('other@example.com', account)).toBe(false);
    expect(isAllowedGoogleEmail('approved+alias@example.com', account)).toBe(false);
    expect(isAllowedGoogleEmail('approved@example.com')).toBe(false);
    expect(isAllowedGoogleEmail('approved@example.com', { ...account, externalGoogleApproved: false })).toBe(false);
  });
  it('uses a signed matching OAuth state', () => {
    const state = createState();
    expect(verifyState(state, state)).toBe(true);
    expect(verifyState(state, createState())).toBe(false);
    expect(verifyState('forged.payload', 'forged.payload')).toBe(false);
    expect(verifyState(undefined, state)).toBe(false);
  });
  it('requests only identity scopes with an account chooser', () => {
    const url = new URL(
      buildAuthorizeUrl('http://localhost:3001/api/auth/callback', 'state'),
    );
    expect(url.searchParams.get('scope')).toBe('openid email profile');
    expect(url.searchParams.get('prompt')).toBe('select_account');
  });
  it.each([false, undefined])(
    'rejects an email without affirmative verification: %s',
    async (verified) => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValueOnce(Response.json({ access_token: 'test-token' }))
          .mockResolvedValueOnce(
            Response.json({
              email: 'head.kriti@bits-pilani.ac.in',
              email_verified: verified,
            }),
          ),
      );
      expect(
        await exchangeCodeForIdentity('code', 'http://localhost/callback'),
      ).toBeNull();
    },
  );
});
