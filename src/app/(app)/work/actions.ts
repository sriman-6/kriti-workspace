'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { env } from '@/lib/env';
import { ForbiddenError } from '@/lib/errors';
import { requireUser } from '@/lib/auth/session';
import { runAction, type FormState } from '@/lib/actions/form-state';
import {
  taskSchema,
  submissionSchema,
  reviewSchema,
  progressSchema,
  programmeSchema,
  personSchema,
  membershipSchema,
  workSharingSchema,
} from '@/lib/schemas/work';
import {
  createWork,
  editWork,
  submitWork,
  validateWorkUploads,
  reviewWork,
  updateWorkProgress,
  addWorkComment,
  createProgramme,
  configureWorkspacePerson,
  configureProgrammeMember,
  markWorkNotificationsRead,
  shareWork,
} from '@/lib/services/workspace';

function refresh(taskId?: string) {
  revalidatePath('/programmes', 'layout');
  for (const path of ['/dashboard', '/work', '/people', '/programmes'])
    revalidatePath(path);
  if (taskId) revalidatePath(`/work/${taskId}`);
}
export async function createTaskAction(
  _state: FormState,
  data: FormData,
): Promise<FormState> {
  const user = await requireUser();
  let taskId = '';
  data.set('viewerIds', data.getAll('viewerIds').join(','));
  const state = await runAction(
    taskSchema,
    data,
    async (input) => {
      taskId = await createWork(user, input);
      refresh(taskId);
    },
    'Work created.',
  );
  if (state.status === 'success') redirect(`/work/${taskId}`);
  return state;
}
export async function editTaskAction(
  _state: FormState,
  data: FormData,
): Promise<FormState> {
  const user = await requireUser();
  data.set('viewerIds', data.getAll('viewerIds').join(','));
  return runAction(
    taskSchema.and(
      z.object({
        taskId: z.string().uuid(),
        version: z.coerce.number().int().min(0),
      }),
    ),
    data,
    async (input) => {
      await editWork(user, input.taskId, input.version, input);
      refresh(input.taskId);
    },
    'Assignment updated.',
  );
}
export async function shareTaskAction(_state: FormState, data: FormData): Promise<FormState> {
  const user = await requireUser();
  data.set('viewerIds', data.getAll('viewerIds').join(','));
  return runAction(workSharingSchema, data, async (input) => {
    await shareWork(user, input);
    refresh(input.taskId);
    revalidatePath('/library');
  }, 'Work visibility updated.');
}
export async function submitTaskAction(
  _state: FormState,
  data: FormData,
): Promise<FormState> {
  const user = await requireUser();
  return runAction(
    submissionSchema,
    data,
    async (input) => {
      const files = data.getAll('files').filter((item): item is File => item instanceof File && (item.size > 0 || item.name !== ''));
      if (env.workFileStorage === 'vercel-blob' && files.length)
        throw new ForbiddenError('Refresh the page to upload files directly.');
      let uploadIds: string[] = [];
      try {
        const raw = data.get('uploadIds') ?? '[]';
        if (typeof raw !== 'string' || raw.length > 200) throw new Error('Invalid upload references.');
        uploadIds = z.array(z.string().uuid()).max(3).parse(JSON.parse(raw));
      } catch { throw new ForbiddenError('Choose the files again before submitting.'); }
      const uploads = await validateWorkUploads(
        files,
      );
      await submitWork(user, input, uploads, uploadIds);
      refresh(input.taskId);
    },
    'Work saved.',
  );
}
export async function reviewTaskAction(
  _state: FormState,
  data: FormData,
): Promise<FormState> {
  const user = await requireUser();
  return runAction(
    reviewSchema,
    data,
    async (input) => {
      await reviewWork(user, input);
      refresh(input.taskId);
    },
    'Review recorded.',
  );
}
export async function progressTaskAction(
  _state: FormState,
  data: FormData,
): Promise<FormState> {
  const user = await requireUser();
  return runAction(
    progressSchema,
    data,
    async (input) => {
      await updateWorkProgress(user, input);
      refresh(input.taskId);
    },
    'Progress updated.',
  );
}
export async function commentTaskAction(
  _state: FormState,
  data: FormData,
): Promise<FormState> {
  const user = await requireUser();
  return runAction(
    z.object({
      taskId: z.string().uuid(),
      message: z.string().trim().min(1).max(2000),
    }),
    data,
    async (input) => {
      await addWorkComment(user, input.taskId, input.message);
      refresh(input.taskId);
    },
    'Update posted.',
  );
}
export async function programmeAction(
  _state: FormState,
  data: FormData,
): Promise<FormState> {
  const user = await requireUser();
  let programmeId = '';
  if (!data.get('code')) data.set('code', `P-${crypto.randomUUID().slice(0, 8).toUpperCase()}`);
  const state = await runAction(
    programmeSchema,
    data,
    async (input) => {
      programmeId = await createProgramme(user, input);
      refresh();
    },
    'Programme created.',
  );
  if (state.status === 'success') redirect(`/programmes/${programmeId}`);
  return state;
}
export async function personAction(
  _state: FormState,
  data: FormData,
): Promise<FormState> {
  const user = await requireUser();
  return runAction(
    personSchema,
    data,
    async (input) => {
      await configureWorkspacePerson(user, input);
      refresh();
      revalidatePath('/', 'layout');
    },
    'Workspace responsibility saved.',
  );
}
export async function membershipAction(
  _state: FormState,
  data: FormData,
): Promise<FormState> {
  const user = await requireUser();
  return runAction(
    membershipSchema,
    data,
    async (input) => {
      await configureProgrammeMember(user, input);
      refresh();
    },
    'Programme access saved.',
  );
}
export async function readNotificationsAction(): Promise<void> {
  const user = await requireUser();
  await markWorkNotificationsRead(user);
  refresh();
}
