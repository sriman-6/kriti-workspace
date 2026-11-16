import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/session';
import {
  getChat,
  listChatGroups,
  sendChatMessage,
  setChatReaction,
  changeChatSettings,
  readChat,
} from '@/lib/services/chat';
import { updateGroup } from '@/lib/services/collaboration';
import { assertSameOrigin, readUploadJson } from '@/lib/http/upload-request';
import { isDomainError, NotFoundError } from '@/lib/errors';
import { logger } from '@/lib/logger';

const operation = z.discriminatedUnion('operation', [
  z.object({
    operation: z.literal('send'),
    id: z.uuid(),
    body: z.string().max(4000),
    parentId: z.uuid().optional(),
    uploadIds: z.array(z.uuid()).max(3).default([]),
  }),
  z.object({
    operation: z.literal('react'),
    messageId: z.uuid(),
    emoji: z.string().max(10),
    active: z.boolean(),
  }),
  z.object({
    operation: z.literal('rename'),
    name: z.string().trim().min(3).max(120),
    description: z.string().trim().max(1000),
  }),
  z.object({ operation: z.literal('leave') }),
  z.object({ operation: z.literal('read'), through: z.uuid() }),
  z.object({ operation: z.enum(['add', 'remove']), target: z.uuid() }),
  z.object({ operation: z.enum(['pin', 'unpin']), target: z.uuid() }),
  z.object({ operation: z.enum(['archive', 'restore']) }),
]);
const headers = { 'Cache-Control': 'private, no-store' };
function failure(error: unknown) {
  if (isDomainError(error))
    return Response.json(
      { error: error.message },
      { status: error instanceof NotFoundError ? 404 : 403, headers },
    );
  logger.error('Group request failed', error);
  return Response.json(
    { error: 'Unable to update this conversation. Please try again.' },
    { status: 503, headers },
  );
}
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user)
    return Response.json(
      { error: 'Sign in again to view this conversation.' },
      { status: 401, headers },
    );
  const { id } = await params;
  const query = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = z
    .object({
      thread: z.uuid().optional(),
      before: z.uuid().optional(),
      search: z.string().max(120).optional(),
      resources: z.literal('1').optional(),
      message: z.uuid().optional(),
    })
    .safeParse(query);
  if (!z.uuid().safeParse(id).success || !parsed.success)
    return Response.json(
      { error: 'Invalid conversation.' },
      { status: 400, headers },
    );
  try {
    const [detail, groups] = await Promise.all([
      getChat(user, id, parsed.data),
      listChatGroups(user),
    ]);
    return Response.json({ detail, groups }, { headers });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user)
    return Response.json(
      { error: 'Sign in again. Your draft is still here.' },
      { status: 401, headers },
    );
  const { id } = await params;
  try {
    assertSameOrigin(request);
    const parsed = operation.safeParse(await readUploadJson(request));
    if (!z.uuid().safeParse(id).success || !parsed.success)
      return Response.json(
        { error: 'Check the message or settings and try again.' },
        { status: 400, headers },
      );
    const input = parsed.data;
    if (input.operation === 'send') await sendChatMessage(user, id, input);
    else if (input.operation === 'react')
      await setChatReaction(
        user,
        id,
        input.messageId,
        input.emoji,
        input.active,
      );
    else if (input.operation === 'rename' || input.operation === 'leave')
      await changeChatSettings(user, id, input);
    else if (input.operation === 'read')
      await readChat(user, id, input.through);
    else
      await updateGroup(user, id, {
        memberId:
          input.operation === 'add' || input.operation === 'remove'
            ? input.target
            : undefined,
        remove: input.operation === 'remove',
        pinId:
          input.operation === 'pin' || input.operation === 'unpin'
            ? input.target
            : undefined,
        pin: input.operation === 'pin',
        archive:
          input.operation === 'archive'
            ? true
            : input.operation === 'restore'
              ? false
              : undefined,
      });
    return Response.json({ ok: true }, { headers });
  } catch (error) {
    return failure(error);
  }
}
