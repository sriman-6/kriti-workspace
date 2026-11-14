'use client';

import * as React from 'react';

/**
 * Runs a callback once, when a `useActionState` result transitions to success.
 *
 * Adjusting state during render — the usual way to respond to a changed value —
 * must not be used here: it re-runs the `useActionState` reducer, and React
 * rejects that with "Server Functions cannot be called during initial render".
 * An effect is the right tool, because closing a dialog and refreshing the
 * router are side effects, not derived state.
 *
 * `onSuccess` is a new closure on every render, so the effect re-runs often;
 * the status guard makes every run after the transition a no-op.
 */
export function useActionSuccess(status: string, onSuccess: () => void): void {
  const previousStatus = React.useRef(status);

  React.useEffect(() => {
    if (previousStatus.current === status) return;
    previousStatus.current = status;
    if (status === 'success') onSuccess();
  }, [status, onSuccess]);
}
