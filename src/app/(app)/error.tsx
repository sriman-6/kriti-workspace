'use client';

import * as React from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

/**
 * Error boundary for every page inside the application shell. The shell itself
 * stays mounted, so navigation still works while a single page is broken.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.JSX.Element {
  React.useEffect(() => {
    // Server logs carry the stack; this records that the user actually saw it.
    console.error('Page error boundary caught:', error.message, error.digest ?? '');
  }, [error]);

  return (
    <div className="mx-auto max-w-lg py-12">
      <Card>
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
    </div>
  );
}
