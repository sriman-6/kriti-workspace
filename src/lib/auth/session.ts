import 'server-only';

import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { SignJWT, jwtVerify } from 'jose';

import { db, users, type User } from '@/lib/db';
import { env, assertProductionConfig } from '@/lib/env';
import { OAUTH_STATE_COOKIE } from './google-oauth';
import { logger } from '@/lib/logger';

const COOKIE_NAME = 'kriti_session';
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7; // 7 days

const secretKey = new TextEncoder().encode(env.sessionSecret);

/**
 * Sessions are a signed JWT in an httpOnly cookie holding only the user id.
 * Roles and campus are read from the database on each request, so deactivating
 * a user or changing their role takes effect immediately rather than at the
 * next sign-in.
 */

export async function createSession(userId: string): Promise<void> {
  assertProductionConfig();
  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(secretKey);

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DURATION_SECONDS,
  });
}

/**
 * Clears every trace of the signed-in identity.
 *
 * That is the session cookie and the one-time OAuth state cookie. Google
 * sign-in holds no other browser state — the token exchange happens
 * server-side and nothing from Google is persisted in the browser.
 */
export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();

  // Overwrite-and-expire rather than `delete(name)`. A cookie is identified by
  // (name, domain, path), so a delete that does not repeat the attributes it
  // was written with can silently miss and leave the session alive. The
  // session cookie is set with `path: '/'`, so clearing it must say so too.
  const expire = (name: string): void => {
    cookieStore.set(name, '', {
      path: '/',
      maxAge: 0,
      expires: new Date(0),
      httpOnly: true,
      secure: env.isProduction,
      sameSite: 'lax',
    });
  };

  expire(COOKIE_NAME);

  // A half-finished sign-in can leave this behind; clear it so a stale value
  // cannot collide with the next attempt.
  expire(OAUTH_STATE_COOKIE);
}

/**
 * The signed-in user, or null. Cached for the lifetime of a request so that a
 * page rendering several server components hits the database once.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const cookieStore = await cookies();
  assertProductionConfig();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  let userId: string;
  try {
    const { payload } = await jwtVerify(token, secretKey);
    if (typeof payload.sub !== 'string') return null;
    userId = payload.sub;
  } catch {
    // Expired or tampered token: treat as signed out rather than erroring.
    return null;
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    logger.warn('Session referenced a user that no longer exists', { userId });
    return null;
  }

  if (!user.isActive) {
    logger.warn('Deactivated user attempted access', {
      userId,
      email: user.email,
    });
    return null;
  }

  return user;
});

/** For pages and actions that require a signed-in user. Redirects if there is none. */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect('/');
  return user;
}
