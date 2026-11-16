import { z } from 'zod';
import { PROGRAMME_ROLES, WORKSPACE_ROLES } from '@/lib/workspace';
import { PROGRAMME_NAME_MAX_LENGTH } from '@/lib/tracker';

const optionalId = z
  .union([z.string().uuid(), z.literal(''), z.null()])
  .transform((value) => value || null);
const viewerList = z.array(z.string().uuid()).max(100, 'Choose at most 100 viewers.');
const viewerIds = z.union([
  z.string().max(10000).transform((value) => value.split(',').filter(Boolean)),
  viewerList,
]).default([]).pipe(viewerList).transform((ids) => [...new Set(ids)]);
export const workSharingSchema = z.object({
  taskId: z.string().uuid(),
  version: z.coerce.number().int().min(0),
  viewerIds,
});
const dueOn = z
  .string()
  .refine(
    (value) =>
      !value ||
      (/^\d{4}-\d{2}-\d{2}$/.test(value) &&
        !Number.isNaN(Date.parse(value)) &&
        new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value),
    'Choose a valid date.',
  )
  .transform((value) => value || null);
export const taskSchema = z
  .object({
    title: z.string().trim().min(3, 'Give the task a clear title.').max(200),
    description: z.string().trim().max(10000).default(''),
    programmeId: optionalId,
    trackerSheetId: optionalId.optional(),
    ownerId: z.string().uuid('Choose an owner.'),
    reviewerId: optionalId,
    viewerIds,
    dueOn,
    priority: z.enum(['normal', 'high']).default('normal'),
  })
  .refine((value) => value.ownerId !== value.reviewerId, {
    path: ['reviewerId'],
    message: 'Choose a reviewer other than the owner.',
  });
export const submissionSchema = z.object({
  taskId: z.string().uuid(),
  version: z.coerce.number().int().min(0),
  summary: z
    .string()
    .trim()
    .min(3, 'Add a short update for your reviewer.')
    .max(10000),
  links: z
    .string()
    .trim()
    .max(10000)
    .transform((value) =>
      value
        .split(/\r?\n/)
        .map((link) => link.trim())
        .filter(Boolean),
    )
    .refine((links) => links.length <= 5, 'Add at most five links.')
    .refine(
      (links) =>
        links.every((link) => {
          try {
            const url = new URL(link);
            return url.protocol === 'https:' && !url.username && !url.password;
          } catch {
            return false;
          }
        }),
      'Use a full HTTPS link, one per line.',
    ),
});
export const reviewSchema = z
  .object({
    taskId: z.string().uuid(),
    version: z.coerce.number().int().positive(),
    decision: z.enum(['accepted', 'changes_requested']),
    feedback: z.string().trim().max(10000),
  })
  .refine(
    (value) =>
      value.decision !== 'changes_requested' || value.feedback.length >= 3,
    { path: ['feedback'], message: 'Explain what needs to change.' },
  );
export const progressSchema = z
  .object({
    taskId: z.string().uuid(),
    version: z.coerce.number().int().min(0),
    status: z.enum(['in_progress', 'blocked', 'cancelled']),
    note: z.string().trim().max(2000).default(''),
  })
  .refine((value) => value.status !== 'blocked' || value.note.length >= 3, {
    path: ['note'],
    message: 'Describe the blocker.',
  });
export const programmeSchema = z.object({
  name: z.string().trim().min(3).max(PROGRAMME_NAME_MAX_LENGTH, `Use a name of up to ${PROGRAMME_NAME_MAX_LENGTH} characters.`),
  code: z
    .string()
    .trim()
    .min(2)
    .max(30)
    .regex(/^[a-zA-Z0-9-]+$/, 'Use letters, numbers and hyphens.'),
  description: z.string().trim().max(2000),
  kind: z.enum(['programme', 'project']).default('programme'),
  stage: z.enum(['unset', 'planning', 'ongoing', 'completed', 'on_hold']).default('unset'),
});
export const personSchema = z.object({
  fullName: z.string().trim().min(2).max(150),
  email: z
    .string()
    .trim()
    .email()
    .transform((value) => value.toLowerCase()),
  role: z.enum(WORKSPACE_ROLES),
  access: z.enum(['active', 'inactive']).default('active'),
  externalEmailApproval: z.enum(['no', 'yes']).default('no'),
});
export const membershipSchema = z.object({
  programmeId: z.string().uuid(),
  userId: z.string().uuid(),
  role: z.enum(PROGRAMME_ROLES),
});
export type TaskInput = Omit<z.infer<typeof taskSchema>, 'viewerIds'> & { viewerIds?: string[] };
export type SubmissionInput = z.infer<typeof submissionSchema>;
export type ReviewInput = z.infer<typeof reviewSchema>;
export type ProgressInput = z.infer<typeof progressSchema>;
