import 'server-only';

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import { env } from '@/lib/env';

/**
 * Google OAuth 2.0, spoken directly.
 *
 * No auth provider sits in the middle: the application redirects to Google,
 * Google redirects back with a code, and the code is exchanged server-side for
 * the user's verified email. That email is then checked against the `users`
 * table, which is the only thing that grants access.
 *
 * Only three pieces of Google's response matter: `email`, `email_verified` and
 * `name`. Everything else is ignored.
 */

const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

export const OAUTH_STATE_COOKIE = 'kriti_oauth_state';

/**
 * CSRF protection. The state is a random nonce plus an HMAC of it, so the
 * callback can prove the value came from us without storing anything
 * server-side.
 */
export function createState(): string {
  const nonce = randomBytes(16).toString('base64url');
  const signature = createHmac('sha256', env.sessionSecret).update(nonce).digest('base64url');
  return `${nonce}.${signature}`;
}

export function verifyState(state: string | undefined, cookieState: string | undefined): boolean {
  if (!state || !cookieState) return false;

  // The value Google echoed back must be the one we set on the browser.
  const a = Buffer.from(state);
  const b = Buffer.from(cookieState);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;

  const [nonce, signature] = state.split('.');
  if (!nonce || !signature) return false;

  const expected = Buffer.from(
    createHmac('sha256', env.sessionSecret).update(nonce).digest('base64url'),
  );
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function buildAuthorizeUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: env.googleClientId ?? '',
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    // Always show the account chooser: on a shared machine, silently reusing
    // whichever Google account is signed in is the wrong default.
    prompt: 'select_account',
  });

  // KRITI spans institute and campus domains; verified identity and registration
  // are checked in the callback rather than narrowing the account picker.

  return `${AUTHORIZE_URL}?${params.toString()}`;
}

export type GoogleIdentity = { email: string; fullName: string | null };

/**
 * Exchanges the one-time code for the user's verified identity.
 * Returns null on any failure — the caller treats that as "sign-in failed".
 */
export async function exchangeCodeForIdentity(
  code: string,
  redirectUri: string,
): Promise<GoogleIdentity | null> {
  const tokenResponse = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.googleClientId ?? '',
      client_secret: env.googleClientSecret ?? '',
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenResponse.ok) return null;

  const token = (await tokenResponse.json()) as { access_token?: string };
  if (!token.access_token) return null;

  const userResponse = await fetch(USERINFO_URL, {
    headers: { authorization: `Bearer ${token.access_token}` },
  });

  if (!userResponse.ok) return null;

  const profile = (await userResponse.json()) as {
    email?: string;
    email_verified?: boolean;
    name?: string;
  };

  // An unverified address proves nothing about who is signing in.
  if (!profile.email || profile.email_verified !== true) return null;

  return {
    email: profile.email.toLowerCase(),
    fullName: profile.name?.trim() || null,
  };
}
