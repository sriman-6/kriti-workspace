import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { createTestDatabase, type TestDatabase } from './helpers/database';
const holder = vi.hoisted(() => ({ db: null as unknown as TestDatabase }));
const storage = vi.hoisted(() => ({ read: vi.fn(), remove: vi.fn() }));
vi.mock('@/lib/db', () => ({
  get db() {
    return holder.db;
  },
}));
vi.mock('@/lib/storage/work-blob', () => ({
  readWorkBlob: storage.read,
  deleteWorkBlob: storage.remove,
}));
const { users, workspaceProfiles, groupMessages, groupUploads } = await import(
  '@/lib/db/schema'
);
const { createGroup, updateGroup } = await import(
  '@/lib/services/collaboration'
);
const {
  getChat,
  listChatGroups,
  sendChatMessage,
  setChatReaction,
  changeChatSettings,
  readChat,
  reserveChatUploads,
  authorizeChatUpload,
  downloadChatFile,
  getChatMessage,
  cleanupChatUploads,
} = await import('@/lib/services/chat');
type User = typeof users.$inferSelect;
let head: User, member: User, outsider: User;
let cleanup: () => Promise<void>;
let groupId: string;
const pdf = Buffer.from('%PDF-1.4\nprivate group file');
beforeAll(async () => {
  const test = await createTestDatabase();
  holder.db = test.db;
  cleanup = test.cleanup;
  const people = await holder.db
    .insert(users)
    .values(
      ['head', 'member', 'outsider'].map((name) => ({
        fullName: name,
        email: `${name}@pilani.bits-pilani.ac.in`,
        role: 'member' as const,
      })),
    )
    .returning();
  [head, member, outsider] = people as [User, User, User];
  await holder.db
    .insert(workspaceProfiles)
    .values(
      people.map((person) => ({
        userId: person.id,
        role: person.id === head.id ? ('head' as const) : ('intern' as const),
      })),
    );
  groupId = await createGroup(head, {
    name: 'Private discussions',
    description: 'Coordination',
    memberIds: [member.id],
  });
});
afterAll(async () => {
  if (cleanup) await cleanup();
});
const send = (body: string, extra = {}) =>
  sendChatMessage(head, groupId, {
    id: randomUUID(),
    body,
    uploadIds: [],
    ...extra,
  });

describe('scoped group conversations', () => {
  it('keeps messages, search, work sources and upload reservations private', async () => {
    const id = await send('Private brief');
    await expect(getChat(outsider, groupId)).rejects.toThrow();
    await expect(
      getChat(outsider, groupId, { search: 'brief' }),
    ).rejects.toThrow();
    await expect(getChatMessage(outsider, id)).rejects.toThrow();
    await expect(
      reserveChatUploads(outsider, groupId, [
        { name: 'notes.pdf', size: pdf.length },
      ]),
    ).rejects.toThrow();
    expect(await listChatGroups(outsider)).toHaveLength(0);
  });
  it('deduplicates retries and rejects reuse by another sender or with altered contents', async () => {
    const input = { id: randomUUID(), body: 'Once only', uploadIds: [] };
    await sendChatMessage(head, groupId, input);
    await sendChatMessage(head, groupId, input);
    expect(
      (await getChat(head, groupId, { search: 'Once only' })).messages,
    ).toHaveLength(1);
    await expect(sendChatMessage(member, groupId, input)).rejects.toThrow();
    await expect(
      sendChatMessage(head, groupId, { ...input, body: 'Changed' }),
    ).rejects.toThrow();
  });
  it('keeps main conversations visible while loading replies and rejects cross-group threads', async () => {
    const id = await send('Root for replies');
    await send('Thread update', { parentId: id });
    const main = await getChat(member, groupId);
    expect(
      main.messages.some((message) => message.body === 'Thread update'),
    ).toBe(false);
    expect(main.messages.find((message) => message.id === id)?.replyCount).toBe(
      1,
    );
    const thread = await getChat(member, groupId, { thread: id });
    expect(thread.parent?.id).toBe(id);
    expect(thread.messages[0]?.body).toBe('Thread update');
    const other = await createGroup(head, {
      name: 'Another group',
      description: '',
      memberIds: [member.id],
    });
    await expect(
      sendChatMessage(member, other, {
        id: randomUUID(),
        body: 'Wrong group',
        parentId: id,
        uploadIds: [],
      }),
    ).rejects.toThrow();
  });
  it('validates mentions and counts unread mentions without marking unseen messages read', async () => {
    const id = await send(`Please review @[member](${member.id})`);
    await expect(send(`Hi @[outsider](${outsider.id})`)).rejects.toThrow(
      'current members',
    );
    expect((await listChatGroups(member))[0]?.mentions).toBe(1);
    await readChat(member, groupId, id);
    expect((await listChatGroups(member))[0]?.mentions).toBe(0);
    const later = await send('Arrived after the viewed message');
    await holder.db
      .update(groupMessages)
      .set({ createdAt: new Date(Date.now() + 2000) })
      .where(eq(groupMessages.id, later));
    await readChat(member, groupId, id);
    expect((await listChatGroups(member))[0]?.unread).toBe(1);
  });
  it('sets and removes only the current user’s reactions idempotently', async () => {
    const id = await send('Reaction check');
    await setChatReaction(member, groupId, id, '👍', true);
    await setChatReaction(member, groupId, id, '👍', true);
    await setChatReaction(head, groupId, id, '👍', true);
    expect(
      (await getChat(member, groupId)).messages.find(
        (message) => message.id === id,
      )?.reactions,
    ).toEqual([{ emoji: '👍', count: 2, mine: true }]);
    await setChatReaction(member, groupId, id, '👍', false);
    expect(
      (await getChat(member, groupId)).messages.find(
        (message) => message.id === id,
      )?.reactions,
    ).toEqual([{ emoji: '👍', count: 1, mine: false }]);
    await expect(
      setChatReaction(outsider, groupId, id, '👍', true),
    ).rejects.toThrow();
    await expect(
      setChatReaction(member, groupId, id, '<script>', true),
    ).rejects.toThrow();
  });
  it('searches full history, including replies, and paginates without overlap', async () => {
    await holder.db
      .insert(groupMessages)
      .values(
        Array.from({ length: 60 }, (_, index) => ({
          groupId,
          authorId: head.id,
          body: `Historical update ${index}`,
          createdAt: new Date(2026, 0, 1, 10, index),
        })),
      );
    const first = await getChat(member, groupId, {
      search: 'Historical update',
    });
    expect(first.messages).toHaveLength(50);
    expect(first.hasOlder).toBe(true);
    const older = await getChat(member, groupId, {
      search: 'Historical update',
      before: first.messages[0]!.id,
    });
    expect(older.messages).toHaveLength(10);
    expect(older.hasOlder).toBe(false);
    expect(
      older.messages.some((message) =>
        first.messages.some((row) => row.id === message.id),
      ),
    ).toBe(false);
    expect(
      (await getChat(member, groupId, { search: 'Thread update' })).messages,
    ).toHaveLength(1);
  });
  it('keeps creator controls restricted and preserves archive history', async () => {
    await expect(
      changeChatSettings(member, groupId, {
        operation: 'rename',
        name: 'Forged',
      }),
    ).rejects.toThrow();
    await expect(
      changeChatSettings(head, groupId, { operation: 'leave' }),
    ).rejects.toThrow();
    await changeChatSettings(head, groupId, {
      operation: 'rename',
      name: 'Renamed group',
      description: 'New purpose',
    });
    expect((await getChat(member, groupId)).group.name).toBe('Renamed group');
    await updateGroup(head, groupId, { archive: true });
    await expect(send('Archived send')).rejects.toThrow('archived');
    expect((await getChat(member, groupId)).messages.length).toBeGreaterThan(0);
    await updateGroup(head, groupId, { archive: false });
  });
  it('preserves database timestamp precision for pagination and read cursors', async () => {
    const precisionGroup = await createGroup(head, {
      name: 'Timestamp precision',
      description: '',
      memberIds: [member.id],
    });
    const first = randomUUID(),
      second = randomUUID();
    await holder.db.insert(groupMessages).values([
      {
        id: first,
        groupId: precisionGroup,
        authorId: head.id,
        body: 'Precision first',
        createdAt: sql`'2026-02-01 10:00:00.123456+00'::timestamptz`,
      },
      {
        id: second,
        groupId: precisionGroup,
        authorId: head.id,
        body: 'Precision second',
        createdAt: sql`'2026-02-01 10:00:00.123789+00'::timestamptz`,
      },
    ]);
    const messages = (await getChat(member, precisionGroup)).messages;
    expect(messages.map((message) => message.id)).toEqual([first, second]);
    expect(messages[0]?.sortKey).toContain('.123456Z');
    expect(
      (await getChat(member, precisionGroup, { before: second })).messages.map(
        (message) => message.id,
      ),
    ).toEqual([first]);
    await readChat(member, precisionGroup, first);
    expect(
      (await listChatGroups(member)).find(
        (group) => group.id === precisionGroup,
      )?.unread,
    ).toBe(1);
  });
  it('refreshes a single older message without leaking a foreign message', async () => {
    const id = await send('Targeted refresh');
    await setChatReaction(member, groupId, id, '✅', true);
    const focused = await getChat(head, groupId, { message: id });
    expect(focused.messages).toHaveLength(1);
    expect(focused.messages[0]?.reactions[0]?.count).toBe(1);
    const other = await createGroup(head, {
      name: 'Other source',
      description: '',
      memberIds: [member.id],
    });
    expect((await getChat(head, other, { message: id })).messages).toHaveLength(
      0,
    );
  });
});

describe('private chat attachments', () => {
  it('validates files, claims once, and restricts downloads to current members', async () => {
    const [file] = await reserveChatUploads(head, groupId, [
      { name: 'notes.pdf', size: pdf.length },
    ]);
    storage.read.mockResolvedValue(pdf);
    const token = await authorizeChatUpload(head, file!.id, file!.blobPath!);
    expect(token).toMatchObject({
      allowOverwrite: false,
      addRandomSuffix: false,
      maximumSizeInBytes: pdf.length,
    });
    await expect(
      authorizeChatUpload(member, file!.id, file!.blobPath!),
    ).rejects.toThrow();
    await expect(downloadChatFile(member, file!.id)).rejects.toThrow();
    const id = await send('', { uploadIds: [file!.id] });
    expect(
      (await getChat(member, groupId)).messages.find(
        (message) => message.id === id,
      )?.files[0]?.name,
    ).toBe('notes.pdf');
    expect((await downloadChatFile(member, file!.id)).blobPath).toBe(
      file!.blobPath,
    );
    await expect(downloadChatFile(outsider, file!.id)).rejects.toThrow();
    await expect(send('Reuse', { uploadIds: [file!.id] })).rejects.toThrow();
    await updateGroup(head, groupId, { memberId: member.id, remove: true });
    await expect(downloadChatFile(member, file!.id)).rejects.toThrow();
    await updateGroup(head, groupId, { memberId: member.id });
  });
  it('rejects invalid content, foreign uploads, expired reservations and unsupported files', async () => {
    await expect(
      reserveChatUploads(head, groupId, [{ name: 'page.html', size: 20 }]),
    ).rejects.toThrow();
    await expect(
      reserveChatUploads(head, groupId, [
        { name: 'large.pdf', size: 5 * 1024 * 1024 + 1 },
      ]),
    ).rejects.toThrow();
    const [file] = await reserveChatUploads(member, groupId, [
      { name: 'notes.pdf', size: pdf.length },
    ]);
    await expect(
      send('Foreign upload', { uploadIds: [file!.id] }),
    ).rejects.toThrow();
    storage.read.mockResolvedValue(Buffer.from('invalid PDF'));
    await expect(
      sendChatMessage(member, groupId, {
        id: randomUUID(),
        body: 'Bad content',
        uploadIds: [file!.id],
      }),
    ).rejects.toThrow();
    await holder.db
      .update(groupUploads)
      .set({ expiresAt: new Date(0) })
      .where(eq(groupUploads.id, file!.id));
    await expect(
      authorizeChatUpload(member, file!.id, file!.blobPath!),
    ).rejects.toThrow();
    await expect(
      sendChatMessage(member, groupId, {
        id: randomUUID(),
        body: 'Expired',
        uploadIds: [file!.id],
      }),
    ).rejects.toThrow();
  });
  it('provides a group-wide files/links view and expires only unclaimed uploads', async () => {
    await send('Shared document https://docs.google.com/document/d/example');
    const resources = await getChat(member, groupId, { resources: '1' });
    expect(resources.messages.some((message) => message.files.length)).toBe(
      true,
    );
    expect(
      resources.messages.some((message) =>
        message.body.includes('docs.google.com'),
      ),
    ).toBe(true);
    storage.remove.mockResolvedValue(undefined);
    const removed = await cleanupChatUploads();
    expect(removed).toBe(1);
    expect(
      (await getChat(member, groupId, { resources: '1' })).messages.some(
        (message) => message.files.length,
      ),
    ).toBe(true);
  });
  it('lets a member leave while immediately revoking access', async () => {
    await changeChatSettings(member, groupId, { operation: 'leave' });
    await expect(getChat(member, groupId)).rejects.toThrow();
    expect(
      (await listChatGroups(member)).some((group) => group.id === groupId),
    ).toBe(false);
  });
});
