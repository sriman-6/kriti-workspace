import * as React from 'react';
import { AlertCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { isGoogleAuthConfigured } from '@/lib/env';

/** Sign-in failures are reported back as `?error=` on the landing page. */
const ERROR_MESSAGES: Record<string, string> = {
  google_not_configured:
    'Google sign-in is not configured on this deployment. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.',
  oauth_cancelled: 'Sign-in was cancelled. Try again when you are ready.',
  oauth_no_code: 'Google did not complete the sign-in. Please try again.',
  oauth_state: 'That sign-in link had expired. Please try again.',
  oauth_failed: 'Could not complete sign-in with Google. Please try again.',
};

/**
 * The admin entry point.
 *
 * Google is the only way in. There is deliberately no password, no second
 * form and no fallback picker — one door is easier to reason about and
 * leaves nothing to disable before going live.
 */
export function AdminSignIn({ error }: { error?: string }): React.JSX.Element {
  const message = error ? (ERROR_MESSAGES[error] ?? 'Sign-in failed. Please try again.') : null;

  return (
    <div className="space-y-3">
      {message ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md bg-critical-surface px-3 py-2 text-xs text-critical"
        >
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {message}
        </p>
      ) : null}

      {isGoogleAuthConfigured ? (
        <Button className="w-full" asChild>
          <a href="/api/auth/google">Continue with Google</a>
        </Button>
      ) : (
        <>
          <Button className="w-full" disabled>
            Continue with Google
          </Button>
          <p className="text-xs text-muted-foreground">Sign-in is being set up. Contact your workspace administrator for access.</p>
        </>
      )}
    </div>
  );
}
