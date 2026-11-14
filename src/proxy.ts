import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

/**
 * First line of route protection.
 *
 * This checks only that a **valid, unexpired session cookie exists** — it does
 * not read the database, because middleware runs on the edge runtime where the
 * database driver is unavailable. That is deliberate and safe: it turns away
 * anonymous traffic cheaply, and every protected page still calls
 * `requireUser()`, which re-reads the row and re-checks the role and active
 * flag on each request. Middleware is the cheap outer gate; the real
 * authorisation is in the services.
 */

const COOKIE_NAME = 'kriti_session';

const DEV_SESSION_SECRET = 'kriti-development-secret-not-for-production-use';
const secretKey = new TextEncoder().encode(process.env.SESSION_SECRET ?? DEV_SESSION_SECRET);

/** Routes reachable without a session. Everything else requires one. */
const PUBLIC_PATHS = ['/', '/access-denied', '/api/cron/uploads'];
const PUBLIC_PREFIXES = ['/api/auth/'];

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname, search } = request.nextUrl;

  if (isPublic(pathname)) return NextResponse.next();

  const token = request.cookies.get(COOKIE_NAME)?.value;
  let signedIn = false;

  if (token && (process.env.NODE_ENV !== 'production' || process.env.SESSION_SECRET)) {
    try {
      await jwtVerify(token, secretKey);
      signedIn = true;
    } catch {
      // Expired or tampered: treated as signed out.
      signedIn = false;
    }
  }

  if (signedIn) return NextResponse.next();

  // Send them to the landing page, remembering where they were headed so the
  // sign-in can return them there.
  const url = request.nextUrl.clone();
  url.pathname = '/';
  url.search = pathname === '/dashboard' ? '' : `?next=${encodeURIComponent(pathname + search)}`;

  const response = NextResponse.redirect(url);
  // An expired cookie is cleared here so it cannot keep triggering this path.
  if (token) response.cookies.delete(COOKIE_NAME);
  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except Next internals and static assets. The public routes
     * above are allowed through inside the middleware rather than excluded
     * here, so the list stays in one place.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
