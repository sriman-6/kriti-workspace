import { NextResponse } from 'next/server';

import {
  buildAuthorizeUrl,
  createState,
  OAUTH_STATE_COOKIE,
} from '@/lib/auth/google-oauth';
import { isGoogleAuthConfigured } from '@/lib/env';
import { logger } from '@/lib/logger';

/** Where Google must send the user back. Must match the Cloud Console entry. */
export function callbackUrl(origin: string): string {
  return `${origin}/api/auth/callback`;
}

/**
 * Starts Google sign-in.
 *
 * A signed random state is stored in a short-lived cookie and echoed to
 * Google, so the callback can prove the response belongs to a flow this
 * application actually started.
 */
export async function GET(request: Request): Promise<NextResponse> {
  if (!isGoogleAuthConfigured) {
    return NextResponse.redirect(new URL('/?error=google_not_configured', request.url));
  }

  const { origin } = new URL(request.url);
  const state = createState();

  const response = NextResponse.redirect(buildAuthorizeUrl(callbackUrl(origin), state));

  response.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: origin.startsWith('https://'),
    sameSite: 'lax', // must survive Google's cross-site redirect back
    path: '/',
    maxAge: 600, // ten minutes is ample to complete a consent screen
  });

  logger.info('Google sign-in started');
  return response;
}
