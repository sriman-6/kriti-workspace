import * as React from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

import type { FormState } from '@/lib/actions/form-state';

/** Inline error beneath a single field. */
export function FieldError({
  id,
  errors,
}: {
  id: string;
  errors: string[] | undefined;
}): React.JSX.Element | null {
  if (!errors || errors.length === 0) return null;
  return (
    <p id={id} className="text-xs text-critical">
      {errors[0]}
    </p>
  );
}

/** Form-level result banner, announced to assistive technology. */
export function FormAlert({ state }: { state: FormState }): React.JSX.Element | null {
  if (state.status === 'idle' || !state.message) return null;

  const isError = state.status === 'error';

  return (
    <p
      role={isError ? 'alert' : 'status'}
      className={
        isError
          ? 'flex items-center gap-2 rounded-md bg-critical-surface px-3 py-2 text-sm text-critical'
          : 'flex items-center gap-2 rounded-md bg-positive-surface px-3 py-2 text-sm text-positive'
      }
    >
      {isError ? (
        <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
      ) : (
        <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
      )}
      {state.message}
    </p>
  );
}
