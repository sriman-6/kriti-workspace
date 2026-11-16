import { z } from 'zod';
import {
  PROGRAMME_NAME_MAX_LENGTH,
  ROW_STATUSES,
  TRACKER_KINDS,
  TRACKER_STAGES,
  validDate,
  validTrackerLink,
} from '@/lib/tracker';
const optionalId = z.uuid().nullable().optional();
export const trackerRowInput = z.object({
  id: z.uuid(),
  sheetId: optionalId,
  version: z.number().int().nonnegative().optional(),
  title: z.string().trim().min(1, 'Add a title.').max(200),
  kind: z
    .enum(
      Object.keys(TRACKER_KINDS) as [
        keyof typeof TRACKER_KINDS,
        ...Array<keyof typeof TRACKER_KINDS>,
      ],
    )
    .default('update'),
  status: z
    .enum(
      Object.keys(ROW_STATUSES) as [
        keyof typeof ROW_STATUSES,
        ...Array<keyof typeof ROW_STATUSES>,
      ],
    )
    .default('planned'),
  ownerId: optionalId,
  eventOn: z
    .string()
    .refine((value) => !value || validDate(value), 'Choose a valid date.')
    .nullable()
    .optional(),
  notes: z.string().max(15000).default(''),
  links: z
    .array(
      z
        .string()
        .max(2000)
        .refine(
          validTrackerLink,
          'Use an HTTPS link or a KRITI workspace link.',
        ),
    )
    .max(15)
    .default([]),
  values: z.record(z.string().max(60), z.string().max(2000)).default({}),
  uploadIds: z.array(z.uuid()).max(3).default([]),
});
export const trackerSettingsInput = z.object({
  name: z.string().trim().min(3).max(PROGRAMME_NAME_MAX_LENGTH, `Use a name of up to ${PROGRAMME_NAME_MAX_LENGTH} characters.`),
  description: z.string().trim().max(2000),
  stage: z.enum(
    Object.keys(TRACKER_STAGES) as [
      keyof typeof TRACKER_STAGES,
      ...Array<keyof typeof TRACKER_STAGES>,
    ],
  ),
  version: z.number().int().nonnegative(),
});
export const trackerColumnInput = z.object({
  label: z.string().trim().min(1).max(50),
  type: z.enum(['text', 'date', 'number', 'url']),
});
export const trackerDeleteInput = z.object({
  version: z.number().int().nonnegative(),
  confirmation: z.literal('DELETE', { error: 'Type DELETE to confirm.' }),
});
export type TrackerRowInput = z.infer<typeof trackerRowInput>;
