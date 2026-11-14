import { z } from 'zod';
export const memberIds = z
  .string()
  .max(10000)
  .transform((value) => [...new Set(value.split(',').filter(Boolean))])
  .pipe(z.array(z.string().uuid()).max(100));
export const meetingSchema = z
  .object({
    title: z.string().trim().min(3).max(160),
    agenda: z.string().trim().max(8000),
    start: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
    end: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
    timezone: z.enum(['Asia/Kolkata', 'Asia/Dubai']),
    location: z.string().trim().max(300),
    joinUrl: z
      .string()
      .trim()
      .refine(
        (value) =>
          !value ||
          (/^https:\/\//.test(value) &&
            z.string().url().safeParse(value).success),
        'Use an HTTPS meeting link.',
      ),
    memberIds,
  })
  .refine((value) => value.end > value.start, {
    path: ['end'],
    message: 'End time must follow start time.',
  });
export type MeetingInput = z.infer<typeof meetingSchema>;
export const ideaSchema = z.object({
  title: z.string().trim().min(3).max(160),
  body: z.string().trim().max(15000),
  memberIds,
});
export const groupSchema = z
  .object({
    name: z.string().trim().min(3).max(120),
    description: z.string().trim().max(1000),
    memberIds,
  })
  .refine((value) => value.memberIds.length > 0, {
    path: ['memberIds'],
    message: 'Invite at least one person.',
  });
