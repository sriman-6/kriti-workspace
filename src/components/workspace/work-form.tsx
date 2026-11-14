'use client';

import { useActionState, useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { FormAlert } from '@/components/patterns/form-feedback';
import type { FormState } from '@/lib/actions/form-state';
import type { PreparedWorkFiles } from '@/lib/client/work-upload';

export function WorkForm({
  action,
  submitLabel,
  children,
  className = '',
  resetOnSuccess = false,
  directUpload,
}: {
  action: (state: FormState, data: FormData) => Promise<FormState>;
  submitLabel: string;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  directUpload?: { taskId: string; version: number };
}) {
  const [uploadProgress, setUploadProgress] = useState('');
  const prepared = useRef<PreparedWorkFiles | null>(null);
  const mayReset = useRef(false);
  const enhancedAction = async (previous: FormState, data: FormData): Promise<FormState> => {
    mayReset.current = false;
    try {
      const { prepareWorkFiles } = await import('@/lib/client/work-upload');
      const files = data.getAll('files').filter((file): file is File => file instanceof File && (file.size > 0 || file.name !== ''));
      setUploadProgress(files.length ? 'Preparing files…' : '');
      prepared.current = await prepareWorkFiles(directUpload!, files, setUploadProgress, prepared.current);
      data.delete('files');
      data.set('uploadIds', JSON.stringify(prepared.current.ids));
    } catch (error) {
      setUploadProgress('');
      return { status: 'error', message: error instanceof Error ? error.message : 'Unable to upload files. Please try again.' };
    }
    setUploadProgress('');
    const result = await action(previous, data);
    mayReset.current = result.status === 'success';
    if (result.status === 'success') prepared.current = null;
    return result;
  };
  const [state, formAction, pending] = useActionState(directUpload ? enhancedAction : action, {
    status: 'idle',
    message: null,
  });
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (resetOnSuccess && state.status === 'success') formRef.current?.reset();
  }, [resetOnSuccess, state]);
  return (
    <form
      ref={formRef}
      action={formAction}
      onReset={directUpload ? (event) => {
        // React resets uncontrolled form fields when an async action resolves,
        // including a handled validation error. Keep drafts and File selections.
        if (!mayReset.current) event.preventDefault();
      } : undefined}
      className={`space-y-4 ${className}`}
      aria-busy={pending}
    >
      <fieldset
        disabled={pending}
        className="min-w-0 space-y-4 disabled:opacity-60"
      >
        {children}
      </fieldset>
      <FormAlert state={state} />
      {directUpload ? <noscript>Enable JavaScript to submit work with private file uploads.</noscript> : null}
      {uploadProgress ? <p role="status" className="text-xs text-muted-foreground">{uploadProgress}</p> : null}
      {state.fieldErrors ? (
        <ul
          className="space-y-1 text-sm text-critical"
          aria-label="Fields to correct"
        >
          {Object.entries(state.fieldErrors).flatMap(([field, errors]) =>
            errors.map((error) => <li key={`${field}-${error}`}>{error}</li>),
          )}
        </ul>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? (uploadProgress ? 'Uploading…' : 'Saving…') : submitLabel}
      </Button>
    </form>
  );
}
