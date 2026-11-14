'use client';

import * as React from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

/**
 * Error boundary for every route outside the authenticated app shell —
 * sign-in and the public QR check-in page. `(app)` has its own boundary with
 * the sidebar still mounted; these routes have no shell to keep alive.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.JSX.Element {
  React.useEffect(() => {
    console.error('Root error boundary caught:', error.message, error.digest ?? '');
  }, [error]);

  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardContent className="space-y-4 p-6 text-center">
          <AlertTriangle className="mx-auto size-7 text-critical" aria-hidden="true" />
          <div className="space-y-1">
            <h1 className="text-base font-semibold">Something went wrong</h1>
            <p className="text-sm text-muted-foreground">
              This page failed to load. Nothing was saved or changed.
            </p>
          </div>
          {error.digest ? (
            <p className="tabular font-mono text-xs text-muted-foreground">
              Reference: {error.digest}
            </p>
          ) : null}
          <Button onClick={reset}>
            <RotateCw className="size-4" />
            Try again
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
