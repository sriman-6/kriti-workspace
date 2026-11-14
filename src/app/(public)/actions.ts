'use server';

import { redirect } from 'next/navigation';

import { destroySession } from '@/lib/auth/session';

/**
 * Sign out.
 *
 * Clears the session cookie and any leftover OAuth state, then returns to the
 * landing page. `redirect` from a Server Action makes the browser navigate,
 * which discards the client router cache along with it — so no stale
 * authenticated page can be shown by the back button.
 */
export async function signOut(): Promise<void> {
  await destroySession();
  redirect('/');
}
