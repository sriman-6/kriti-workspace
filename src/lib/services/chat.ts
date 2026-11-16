import 'server-only';
import { randomUUID } from 'node:crypto';
import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  gt,
  inArray,
  isNull,
  lt,
  sql,
} from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  discussionGroups,
  groupMembers,
  groupMessages,
  groupReactions,
  groupUploads,
  users,
  type User,
} from '@/lib/db/schema';
import { ForbiddenError, NotFoundError } from '@/lib/errors';
import { describeWorkFile, validateWorkFileContent } from '@/lib/work-files';
import { readWorkBlob, deleteWorkBlob } from '@/lib/storage/work-blob';
import { CHAT_REACTIONS, mentionIds } from '@/lib/chat';

type Connection = Pick<typeof db, 'select' | 'insert' | 'update' | 'delete'>;
export async function requireGroup(
  user: User,
  id: string,
  connection: Connection = db,
  writable = false,
) {
  const [row] = await connection
    .select({ group: discussionGroups, member: groupMembers })
    .from(discussionGroups)
    .innerJoin(groupMembers, eq(groupMembers.groupId, discussionGroups.id))
    .where(
      and(
        eq(discussionGroups.id, id),
        eq(groupMembers.userId, user.id),
        eq(groupMembers.isActive, true),
      ),
    );
  if (!row) throw new NotFoundError('That group is unavailable.');
  if (writable && row.group.isArchived)
    throw new ForbiddenError('This group is archived.');
  return row;
}

export async function listChatGroups(user: User) {
  const rows = await db
    .select({
      id: discussionGroups.id,
      name: discussionGroups.name,
      archived: discussionGroups.isArchived,
      preview: sql<string>`coalesce((select body from group_messages m where m.group_id = ${discussionGroups.id} order by m.created_at desc, m.id desc limit 1), ${discussionGroups.description})`,
      unread: sql<number>`(select count(*)::int from group_messages m where m.group_id = ${discussionGroups.id} and m.author_id <> ${user.id} and (${groupMembers.lastReadAt} is null or m.created_at > ${groupMembers.lastReadAt}))`,
      mentions: sql<number>`(select count(*)::int from group_messages m where m.group_id = ${discussionGroups.id} and m.author_id <> ${user.id} and ${user.id}::uuid = any(m.mention_ids) and (${groupMembers.lastReadAt} is null or m.created_at > ${groupMembers.lastReadAt}))`,
    })
    .from(discussionGroups)
    .innerJoin(groupMembers, eq(groupMembers.groupId, discussionGroups.id))
    .where(
      and(eq(groupMembers.userId, user.id), eq(groupMembers.isActive, true)),
    )
    .orderBy(desc(discussionGroups.updatedAt));
  return rows;
}

export async function getChatMessage(user: User, id: string) {
  const [message] = await db
    .select()
    .from(groupMessages)
    .where(eq(groupMessages.id, id));
  if (!message) throw new NotFoundError('That message is unavailable.');
  await requireGroup(user, message.groupId);
  return message;
}

async function hydrate(
  user: User,
  rows: (typeof groupMessages.$inferSelect & {
    authorName: string;
    sortKey?: string;
  })[],
) {
  if (!rows.length) return [];
  const ids = rows.map((message) => message.id);
  const [files, reactions, replies] = await Promise.all([
    db
      .select({
        id: groupUploads.id,
        messageId: groupUploads.messageId,
        name: groupUploads.name,
        size: groupUploads.size,
        contentType: groupUploads.contentType,
      })
      .from(groupUploads)
      .where(inArray(groupUploads.messageId, ids)),
    db
      .select()
      .from(groupReactions)
      .where(inArray(groupReactions.messageId, ids)),
    db
      .select({
        parentId: groupMessages.parentId,
        count: sql<number>`count(*)::int`,
      })
      .from(groupMessages)
      .where(inArray(groupMessages.parentId, ids))
      .groupBy(groupMessages.parentId),
  ]);
  return rows.map((message) => ({
    id: message.id,
    body: message.body,
    parentId: message.parentId,
    authorId: message.authorId,
    authorName: message.authorName,
    createdAt: message.createdAt.toISOString(),
    sortKey:
      message.sortKey ?? message.createdAt.toISOString().replace('Z', '000Z'),
    isPinned: message.isPinned,
    replyCount: replies.find((row) => row.parentId === message.id)?.count ?? 0,
    files: files
      .filter((file) => file.messageId === message.id)
      .map(({ id, name, size, contentType }) => ({
        id,
        name,
        size,
        contentType,
      })),
    reactions: CHAT_REACTIONS.map((emoji) => ({
      emoji,
      count: reactions.filter(
        (row) => row.messageId === message.id && row.emoji === emoji,
      ).length,
      mine: reactions.some(
        (row) =>
          row.messageId === message.id &&
          row.emoji === emoji &&
          row.userId === user.id,
      ),
    })).filter((row) => row.count > 0),
  }));
}

export async function getChat(
  user: User,
  id: string,
  options: {
    thread?: string;
    before?: string;
    search?: string;
    resources?: string;
    message?: string;
  } = {},
) {
  const { group } = await requireGroup(user, id);
  const members = await db
    .select({ id: users.id, fullName: users.fullName })
    .from(groupMembers)
    .innerJoin(users, eq(users.id, groupMembers.userId))
    .where(
      and(
        eq(groupMembers.groupId, id),
        eq(groupMembers.isActive, true),
        eq(users.isActive, true),
      ),
    )
    .orderBy(asc(users.fullName));
  let parent = null;
  if (options.thread) {
    const message = await getChatMessage(user, options.thread);
    if (message.groupId !== id || message.parentId)
      throw new NotFoundError('That thread is unavailable.');
    const [author] = await db
      .select({ name: users.fullName })
      .from(users)
      .where(eq(users.id, message.authorId));
    parent =
      (
        await hydrate(user, [
          { ...message, authorName: author?.name ?? 'Member' },
        ])
      )[0] ?? null;
  }
  let cursor;
  if (options.before) {
    cursor = await getChatMessage(user, options.before);
    if (cursor.groupId !== id) throw new NotFoundError();
  }
  const query = options.search?.trim().slice(0, 120);
  const [rows, pins, latest] = await Promise.all([
    db
      .select({
        ...getTableColumns(groupMessages),
        authorName: users.fullName,
        sortKey: sql<string>`to_char(${groupMessages.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
      })
      .from(groupMessages)
      .innerJoin(users, eq(users.id, groupMessages.authorId))
      .where(
        and(
          eq(groupMessages.groupId, id),
          options.message
            ? eq(groupMessages.id, options.message)
            : options.resources
              ? sql`(${groupMessages.body} like '%https://%' or exists (select 1 from group_uploads f where f.message_id = ${groupMessages.id}))`
              : query
                ? sql`strpos(lower(${groupMessages.body}), lower(${query})) > 0`
                : options.thread
                  ? eq(groupMessages.parentId, options.thread)
                  : isNull(groupMessages.parentId),
          cursor
            ? sql`(${groupMessages.createdAt}, ${groupMessages.id}) < (select created_at, id from group_messages where id = ${cursor.id}::uuid)`
            : undefined,
        ),
      )
      .orderBy(desc(groupMessages.createdAt), desc(groupMessages.id))
      .limit(51),
    db
      .select({
        ...getTableColumns(groupMessages),
        authorName: users.fullName,
        sortKey: sql<string>`to_char(${groupMessages.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
      })
      .from(groupMessages)
      .innerJoin(users, eq(users.id, groupMessages.authorId))
      .where(
        and(eq(groupMessages.groupId, id), eq(groupMessages.isPinned, true)),
      )
      .orderBy(desc(groupMessages.createdAt))
      .limit(50),
    db
      .select({ id: groupMessages.id })
      .from(groupMessages)
      .where(eq(groupMessages.groupId, id))
      .orderBy(desc(groupMessages.createdAt), desc(groupMessages.id))
      .limit(1),
  ]);
  return {
    group: {
      id: group.id,
      name: group.name,
      description: group.description,
      ownerId: group.ownerId,
      isArchived: group.isArchived,
    },
    members,
    parent,
    messages: await hydrate(user, rows.slice(0, 50).reverse()),
    pinned: await hydrate(user, pins),
    hasOlder: rows.length > 50,
    latestId: latest[0]?.id ?? null,
  };
}
export type ChatDetail = Awaited<ReturnType<typeof getChat>>;
export type ChatMessage = ChatDetail['messages'][number];
export type ChatGroup = Awaited<ReturnType<typeof listChatGroups>>[number];

export async function sendChatMessage(
  user: User,
  groupId: string,
  input: { id: string; body: string; parentId?: string; uploadIds: string[] },
) {
  const body = input.body.trim();
  if (
    (!body && !input.uploadIds.length) ||
    body.length > 4000 ||
    input.uploadIds.length > 3 ||
    new Set(input.uploadIds).size !== input.uploadIds.length
  )
    throw new ForbiddenError('Write a message or attach up to three files.');
  return db.transaction(async (tx) => {
    // Serialise sends and membership/settings changes within this group.
    await tx
      .select({ id: discussionGroups.id })
      .from(discussionGroups)
      .where(eq(discussionGroups.id, groupId))
      .for('update');
    await requireGroup(user, groupId, tx, true);
    const [existing] = await tx
      .select()
      .from(groupMessages)
      .where(eq(groupMessages.id, input.id));
    if (existing) {
      if (
        existing.authorId !== user.id ||
        existing.groupId !== groupId ||
        existing.body !== body ||
        existing.parentId !== (input.parentId ?? null)
      )
        throw new ForbiddenError('Use a new message ID.');
      return existing.id; // Safe retry after a lost response; no duplicate message.
    }
    if (input.parentId) {
      const [parent] = await tx
        .select()
        .from(groupMessages)
        .where(
          and(
            eq(groupMessages.id, input.parentId),
            eq(groupMessages.groupId, groupId),
            isNull(groupMessages.parentId),
          ),
        );
      if (!parent) throw new ForbiddenError('Choose a thread in this group.');
    }
    const mentions = mentionIds(body);
    if (mentions.length) {
      const members = await tx
        .select({ id: users.id })
        .from(groupMembers)
        .innerJoin(users, eq(users.id, groupMembers.userId))
        .where(
          and(
            eq(groupMembers.groupId, groupId),
            eq(groupMembers.isActive, true),
            eq(users.isActive, true),
            inArray(users.id, mentions),
          ),
        );
      if (members.length !== mentions.length)
        throw new ForbiddenError('Mention only current members of this group.');
    }
    const files = input.uploadIds.length
      ? await tx
          .select()
          .from(groupUploads)
          .where(inArray(groupUploads.id, input.uploadIds))
          .for('update')
      : [];
    if (
      files.length !== input.uploadIds.length ||
      files.some(
        (file) =>
          file.groupId !== groupId ||
          file.ownerId !== user.id ||
          file.messageId ||
          file.expiresAt <= new Date(),
      )
    )
      throw new ForbiddenError(
        'An attachment expired or is unavailable. Remove it and choose it again.',
      );
    for (const file of files) {
      const bytes = file.blobPath
        ? await readWorkBlob(file.blobPath, file.size)
        : Buffer.from(file.content ?? '', 'base64');
      validateWorkFileContent(file, bytes);
    }
    await tx
      .insert(groupMessages)
      .values({
        id: input.id,
        groupId,
        authorId: user.id,
        body,
        parentId: input.parentId ?? null,
        mentionIds: mentions,
        createdAt: new Date(),
      });
    if (files.length)
      await tx
        .update(groupUploads)
        .set({ messageId: input.id })
        .where(inArray(groupUploads.id, input.uploadIds));
    await tx
      .update(discussionGroups)
      .set({ updatedAt: new Date() })
      .where(eq(discussionGroups.id, groupId));
    return input.id;
  });
}

export async function setChatReaction(
  user: User,
  groupId: string,
  messageId: string,
  emoji: string,
  active: boolean,
) {
  if (!(CHAT_REACTIONS as readonly string[]).includes(emoji))
    throw new ForbiddenError('Choose a supported reaction.');
  await db.transaction(async (tx) => {
    await tx
      .select({ id: discussionGroups.id })
      .from(discussionGroups)
      .where(eq(discussionGroups.id, groupId))
      .for('update');
    await requireGroup(user, groupId, tx, true);
    const [message] = await tx
      .select({ id: groupMessages.id })
      .from(groupMessages)
      .where(
        and(
          eq(groupMessages.id, messageId),
          eq(groupMessages.groupId, groupId),
        ),
      );
    if (!message) throw new NotFoundError();
    if (active)
      await tx
        .insert(groupReactions)
        .values({ messageId, userId: user.id, emoji })
        .onConflictDoNothing();
    else
      await tx
        .delete(groupReactions)
        .where(
          and(
            eq(groupReactions.messageId, messageId),
            eq(groupReactions.userId, user.id),
            eq(groupReactions.emoji, emoji),
          ),
        );
  });
}

export async function changeChatSettings(
  user: User,
  groupId: string,
  input: { operation: 'rename' | 'leave'; name?: string; description?: string },
) {
  await db.transaction(async (tx) => {
    await tx
      .select({ id: discussionGroups.id })
      .from(discussionGroups)
      .where(eq(discussionGroups.id, groupId))
      .for('update');
    const { group } = await requireGroup(user, groupId, tx);
    if (input.operation === 'leave') {
      if (group.ownerId === user.id)
        throw new ForbiddenError(
          'The creator must keep responsibility for the group. Archive it instead.',
        );
      await tx
        .update(groupMembers)
        .set({ isActive: false })
        .where(
          and(
            eq(groupMembers.groupId, groupId),
            eq(groupMembers.userId, user.id),
          ),
        );
    } else {
      if (group.ownerId !== user.id)
        throw new ForbiddenError('Only the creator can rename this group.');
      const name = input.name?.trim() ?? '';
      if (
        name.length < 3 ||
        name.length > 120 ||
        (input.description?.length ?? 0) > 1000
      )
        throw new ForbiddenError(
          'Use a group name between 3 and 120 characters.',
        );
      await tx
        .update(discussionGroups)
        .set({
          name,
          description: input.description ?? '',
          updatedAt: new Date(),
        })
        .where(eq(discussionGroups.id, groupId));
    }
  });
}

export async function readChat(user: User, groupId: string, through: string) {
  await requireGroup(user, groupId);
  const [message] = await db
    .select()
    .from(groupMessages)
    .where(
      and(eq(groupMessages.id, through), eq(groupMessages.groupId, groupId)),
    );
  if (!message) throw new NotFoundError();
  // Keep database timestamp precision and never mark messages arriving later read.
  await db
    .update(groupMembers)
    .set({
      lastReadAt: sql`greatest(${groupMembers.lastReadAt}, (select created_at from group_messages where id = ${message.id}::uuid))`,
    })
    .where(
      and(
        eq(groupMembers.groupId, groupId),
        eq(groupMembers.userId, user.id),
        eq(groupMembers.isActive, true),
      ),
    );
}

export async function reserveChatUploads(
  user: User,
  groupId: string,
  files: { name: string; size: number }[],
  local: File[] = [],
) {
  await requireGroup(user, groupId, db, true);
  if (!files.length || files.length > 3)
    throw new ForbiddenError('Choose up to three files.');
  const pending = await db
    .select({ id: groupUploads.id })
    .from(groupUploads)
    .where(
      and(
        eq(groupUploads.ownerId, user.id),
        isNull(groupUploads.messageId),
        gt(groupUploads.expiresAt, new Date()),
      ),
    );
  if (pending.length > 30)
    throw new ForbiddenError(
      'Too many pending uploads. Please try again later.',
    );
  const values = [];
  for (const [index, file] of files.entries()) {
    const metadata = describeWorkFile(file.name, file.size);
    const id = randomUUID();
    let content: string | null = null;
    if (local.length) {
      const bytes = Buffer.from(await local[index]!.arrayBuffer());
      validateWorkFileContent(metadata, bytes);
      content = bytes.toString('base64');
    }
    values.push({
      ...metadata,
      id,
      groupId,
      ownerId: user.id,
      content,
      blobPath: local.length
        ? null
        : `groups/${groupId}/${id}.${metadata.name.split('.').pop()!.toLowerCase()}`,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
  }
  const rows = await db.insert(groupUploads).values(values).returning();
  return rows.map(({ id, blobPath, contentType }) => ({
    id,
    blobPath,
    contentType,
  }));
}

export async function authorizeChatUpload(
  user: User,
  id: string,
  pathname: string,
) {
  const [file] = await db
    .select()
    .from(groupUploads)
    .where(eq(groupUploads.id, id));
  if (
    !file ||
    file.ownerId !== user.id ||
    file.blobPath !== pathname ||
    file.messageId ||
    file.expiresAt <= new Date()
  )
    throw new ForbiddenError('This upload is unavailable.');
  await requireGroup(user, file.groupId, db, true);
  return {
    allowedContentTypes: [file.contentType],
    maximumSizeInBytes: file.size,
    allowOverwrite: false,
    addRandomSuffix: false,
    validUntil: Date.now() + 5 * 60 * 1000,
  };
}
export async function downloadChatFile(user: User, id: string) {
  const [file] = await db
    .select()
    .from(groupUploads)
    .where(eq(groupUploads.id, id));
  if (!file?.messageId) throw new NotFoundError();
  await requireGroup(user, file.groupId);
  return file;
}
export async function cleanupChatUploads() {
  // Token validity can outlast a reservation. Allow a further day before cleanup.
  const expired = await db
    .select()
    .from(groupUploads)
    .where(
      and(
        isNull(groupUploads.messageId),
        lt(groupUploads.expiresAt, new Date(Date.now() - 24 * 60 * 60 * 1000)),
      ),
    )
    .limit(100);
  let removed = 0;
  for (const file of expired) {
    if (file.blobPath) await deleteWorkBlob(file.blobPath);
    await db
      .delete(groupUploads)
      .where(and(eq(groupUploads.id, file.id), isNull(groupUploads.messageId)));
    removed++;
  }
  return removed;
}
