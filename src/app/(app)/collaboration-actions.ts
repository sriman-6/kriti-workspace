'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/session';
import { runAction, type FormState } from '@/lib/actions/form-state';
import {
  meetingSchema,
  ideaSchema,
  groupSchema,
} from '@/lib/schemas/collaboration';
import {
  saveMeeting,
  respondMeeting,
  closeMeeting,
  createGroup,
  postGroupMessage,
  updateGroup,
  markGroupRead,
  saveIdea,
  convertIdea,
} from '@/lib/services/collaboration';
const ids = z.object({
  id: z.string().uuid(),
  version: z.coerce.number().int().min(0),
});
function members(data: FormData) {
  const next = new FormData();
  for (const [key, value] of data)
    if (key !== 'memberIds') next.append(key, value);
  next.set(
    'memberIds',
    data
      .getAll('memberIds')
      .filter((value) => typeof value === 'string')
      .join(','),
  );
  return next;
}
function refresh() {
  for (const path of [
    '/dashboard',
    '/meetings',
    '/groups',
    '/ideas',
    '/programmes',
  ])
    revalidatePath(path, 'layout');
}
export async function meetingAction(
  _state: FormState,
  data: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const edit = Boolean(data.get('id'));
  let id = '';
  const state = await runAction(
    edit ? meetingSchema.and(ids) : meetingSchema,
    members(data),
    async (input) => {
      const identity = edit ? ids.parse(Object.fromEntries(data)) : null;
      id = await saveMeeting(user, input, identity?.id, identity?.version);
      refresh();
    },
    'Meeting saved.',
  );
  if (state.status === 'success') redirect(`/meetings/${id}`);
  return state;
}
export async function meetingResponseAction(
  _state: FormState,
  data: FormData,
): Promise<FormState> {
  const user = await requireUser();
  return runAction(
    z.object({
      id: z.string().uuid(),
      response: z.enum(['accepted', 'declined']),
    }),
    data,
    async (input) => {
      await respondMeeting(user, input.id, input.response);
      refresh();
    },
    'Response saved.',
  );
}
export async function meetingCloseAction(
  _state: FormState,
  data: FormData,
): Promise<FormState> {
  const user = await requireUser();
  return runAction(
    ids.extend({
      status: z.enum(['completed', 'cancelled']),
      minutes: z.string().trim().max(15000),
    }),
    data,
    async (input) => {
      await closeMeeting(
        user,
        input.id,
        input.version,
        input.status,
        input.minutes,
      );
      refresh();
    },
    'Meeting updated.',
  );
}
export async function groupAction(
  _state: FormState,
  data: FormData,
): Promise<FormState> {
  const user = await requireUser();
  let id = '';
  const state = await runAction(
    groupSchema,
    members(data),
    async (input) => {
      id = await createGroup(user, input);
      refresh();
    },
    'Group created.',
  );
  if (state.status === 'success') redirect(`/groups/${id}`);
  return state;
}
export async function messageAction(
  _state: FormState,
  data: FormData,
): Promise<FormState> {
  const user = await requireUser();
  return runAction(
    z.object({
      groupId: z.string().uuid(),
      body: z.string().trim().min(1).max(4000),
      parentId: z.union([z.string().uuid(), z.literal('')]).optional(),
    }),
    data,
    async (input) => {
      await postGroupMessage(
        user,
        input.groupId,
        input.body,
        input.parentId || undefined,
      );
      revalidatePath(`/groups/${input.groupId}`);
      revalidatePath('/groups');
    },
    'Message sent.',
  );
}
export async function groupSettingsAction(
  _state: FormState,
  data: FormData,
): Promise<FormState> {
  const user = await requireUser();
  return runAction(
    z.object({
      id: z.string().uuid(),
      operation: z.enum([
        'add',
        'remove',
        'archive',
        'restore',
        'pin',
        'unpin',
      ]),
      target: z.union([z.string().uuid(), z.literal('')]).default(''),
    }),
    data,
    async (input) => {
      await updateGroup(user, input.id, {
        memberId: ['add', 'remove'].includes(input.operation)
          ? z.string().uuid().parse(input.target)
          : undefined,
        remove: input.operation === 'remove',
        archive:
          input.operation === 'archive'
            ? true
            : input.operation === 'restore'
              ? false
              : undefined,
        pinId: ['pin', 'unpin'].includes(input.operation)
          ? z.string().uuid().parse(input.target)
          : undefined,
        pin: input.operation === 'pin',
      });
      revalidatePath(`/groups/${input.id}`);
      revalidatePath('/groups');
    },
    'Group updated.',
  );
}
export async function groupReadAction(data: FormData): Promise<void> {
  const user = await requireUser();
  const id = z.string().uuid().parse(data.get('id'));
  await markGroupRead(user, id);
  revalidatePath(`/groups/${id}`);
  revalidatePath('/groups');
}
export async function ideaAction(
  _state: FormState,
  data: FormData,
): Promise<FormState> {
  const user = await requireUser();
  let id = '';
  const edit = Boolean(data.get('id'));
  const state = await runAction(
    edit ? ideaSchema.and(ids) : ideaSchema,
    members(data),
    async (input) => {
      const identity = edit ? ids.parse(Object.fromEntries(data)) : null;
      id = await saveIdea(user, input, identity?.id, identity?.version);
      refresh();
    },
    'Idea saved.',
  );
  if (state.status === 'success') redirect(`/ideas/${id}`);
  return state;
}
export async function ideaConvertAction(
  _state: FormState,
  data: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const state = await runAction(
    z.object({ id: z.string().uuid(), leadId: z.string().uuid() }),
    data,
    async (input) => {
      await convertIdea(user, input.id, input.leadId);
      refresh();
    },
    'Initiative activated.',
  );
  if (state.status === 'success') redirect('/programmes');
  return state;
}
