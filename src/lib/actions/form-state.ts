import 'server-only';

import type { z } from 'zod';

import { isDomainError } from '@/lib/errors';
import { logger } from '@/lib/logger';

/**
 * Every server action in the app returns this shape, so every form handles
 * success and failure identically. `fieldErrors` drives inline messages next
 * to the offending input.
 *
 * Shared across features (teams, sessions, and onward) rather than defined
 * per feature — this is genuinely reused, not speculative abstraction.
 */
export type FormState = {
  status: 'idle' | 'success' | 'error';
  message: string | null;
  fieldErrors?: Record<string, string[]>;
};

export const initialFormState: FormState = { status: 'idle', message: null };

/**
 * Shared plumbing: parse with Zod, call the service, run side effects, map
 * errors. Written once so no individual action can forget a step.
 */
export async function runAction<Schema extends z.ZodType>(
  schema: Schema,
  formData: FormData,
  handler: (input: z.infer<Schema>) => Promise<void>,
  successMessage: string,
): Promise<FormState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Please correct the highlighted fields.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  try {
    await handler(parsed.data);
    return { status: 'success', message: successMessage };
  } catch (error) {
    if (isDomainError(error)) {
      return { status: 'error', message: error.message };
    }
    logger.error('Action failed', error);
    return {
      status: 'error',
      message: 'Something went wrong saving that. Nothing was changed.',
    };
  }
}
