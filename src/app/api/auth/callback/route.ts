import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';

import { db, users } from '@/lib/db';
import { createSession } from '@/lib/auth/session';
import { isAllowedGoogleEmail } from '@/lib/auth/domains';
import {
  exchangeCodeForIdentity,
  OAUTH_STATE_COOKIE,
  verifyState,
} from '@/lib/auth/google-oauth';
import { isGoogleAuthConfigured } from '@/lib/env';
import { logger } from '@/lib/logger';

/**
 * Where Google sends the user back. This is the gate.
 *
 * Four checks, in order, each of which must pass:
 *
 *   1. The `state` matches the one we set — this response belongs to a flow
 *      we started, not a forged request.
 *   2. Google exchanges the code for a **verified** email address.
 *   3. That email uses a BITS domain or has approval on its exact account.
 *   4. That email has an **active** row in `users`.
 *
 * Domain membership alone is not authorisation. Registration and account
 * approval are stored in the database, with no address allowlist in code.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const { origin } = url;

  /** Always clear the one-time state cookie, whatever the outcome. */
  const finish = (path: string): NextResponse => {
    const response = NextResponse.redirect(new URL(path, origin));
    response.cookies.set(OAUTH_STATE_COOKIE, '', { path: '/', maxAge: 0 });
    return response;
  };

  if (!isGoogleAuthConfigured) return finish('/?error=google_not_configured');

  const oauthError = url.searchParams.get('error');
  if (oauthError) {
    // The commonest value here is `access_denied` — the user pressed Cancel.
    logger.warn('Google returned an error', { error: oauthError });
    return finish('/?error=oauth_cancelled');
  }

  const code = url.searchParams.get('code');
  if (!code) return finish('/?error=oauth_no_code');

  // (1) CSRF
  const returnedState = url.searchParams.get('state') ?? undefined;
  const cookieState = request.headers
    .get('cookie')
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${OAUTH_STATE_COOKIE}=`))
    ?.slice(OAUTH_STATE_COOKIE.length + 1);

  if (!verifyState(returnedState, cookieState)) {
    logger.warn('Rejected an OAuth callback with a bad state');
    return finish('/?error=oauth_state');
  }

  // (2) Identity
  let identity;
  try {
    identity = await exchangeCodeForIdentity(code, `${origin}/api/auth/callback`);
  } catch (error) {
    logger.error('Google token exchange threw', error);
    return finish('/?error=oauth_failed');
  }

  if (!identity) {
    logger.error('Google token exchange returned no verified identity');
    return finish('/?error=oauth_failed');
  }

  const { email, fullName } = identity;

  const [account] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  // (3) BITS domains by default; approved external identities match one exact account.
  if (!isAllowedGoogleEmail(email, account)) {
    logger.warn('Rejected an unapproved external sign-in', { email });
    return finish(`/access-denied?reason=domain&email=${encodeURIComponent(email)}`);
  }

  // (4) Authorisation gate — the row decides, not the domain.
  if (!account) {
    logger.warn('Account with no registration attempted sign-in', { email });
    return finish(`/access-denied?reason=not_authorised&email=${encodeURIComponent(email)}`);
  }

  if (!account.isActive) {
    logger.warn('Disabled account attempted sign-in', { email });
    return finish(`/access-denied?reason=disabled&email=${encodeURIComponent(email)}`);
  }

  // Keep the display name fresh from Google, and record the visit.
  await db
    .update(users)
    .set({
      fullName: fullName || account.fullName,
      lastSeenAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(users.id, account.id));

  await createSession(account.id);
  logger.info('Member signed in with Google', { userId: account.id, role: account.role });

  return finish('/dashboard');
}
