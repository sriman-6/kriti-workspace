import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDatabase, type TestDatabase } from './helpers/database';
const holder = vi.hoisted(() => ({ db: null as unknown as TestDatabase }));
vi.mock('@/lib/db', () => ({
  get db() {
    return holder.db;
  },
}));
const {
  users,
  workspaceProfiles,
  programmes,
  programmeMembers,
  groupMessages,
} = await import('@/lib/db/schema');
const {
  listContacts,
  saveMeeting,
  getMeeting,
  respondMeeting,
  closeMeeting,
  createGroup,
  getGroup,
  postGroupMessage,
  updateGroup,
  listGroups,
  saveIdea,
  getIdea,
  listIdeas,
  convertIdea,
} = await import('@/lib/services/collaboration');
const { createWork, getWorkspaceAccess } =
  await import('@/lib/services/workspace');
type User = typeof users.$inferSelect;
let cleanup: (() => Promise<void>) | undefined;
let head: User, lead: User, intern: User, outsider: User;
beforeAll(async () => {
  const test = await createTestDatabase();
  holder.db = test.db;
  cleanup = test.cleanup;
  const people = await holder.db
    .insert(users)
    .values(
      ['head', 'lead', 'intern', 'outsider'].map((name) => ({
        email: `${name}@pilani.bits-pilani.ac.in`,
        fullName: name,
        role: 'member' as const,
      })),
    )
    .returning();
  [head, lead, intern, outsider] = people as [User, User, User, User];
  await holder.db.insert(workspaceProfiles).values([
    { userId: head.id, role: 'head' },
    { userId: lead.id, role: 'nucleus' },
    { userId: intern.id, role: 'intern' },
    { userId: outsider.id, role: 'intern' },
  ]);
  const [programme] = await holder.db
    .insert(programmes)
    .values({ code: 'COLLAB', name: 'Collaboration programme' })
    .returning();
  await holder.db.insert(programmeMembers).values([
    { programmeId: programme!.id, userId: lead.id, role: 'lead' },
    { programmeId: programme!.id, userId: intern.id, role: 'member' },
  ]);
  await createWork(head, {
    title: 'Shared assignment',
    description: '',
    programmeId: programme!.id,
    ownerId: intern.id,
    reviewerId: lead.id,
    dueOn: null,
    priority: 'normal',
  });
});
afterAll(async () => {
  if (cleanup) await cleanup();
});
const meeting = (day: string, memberIds: string[], extra = {}) => ({
  title: 'Progress review',
  agenda: 'Decisions and next steps.',
  start: `2026-12-${day}T10:00`,
  end: `2026-12-${day}T11:00`,
  timezone: 'Asia/Kolkata' as const,
  location: 'KRITI office',
  joinUrl: '',
  memberIds,
  ...extra,
});
describe('meeting coordination', () => {
  it('stores timezone-aware times and only exposes invited meetings', async () => {
    const id = await saveMeeting(head, meeting('01', [intern.id]));
    const detail = await getMeeting(intern, id);
    expect(detail.meeting.startsAt.toISOString()).toBe(
      '2026-12-01T04:30:00.000Z',
    );
    expect(detail.participants).toHaveLength(2);
    await expect(getMeeting(outsider, id)).rejects.toThrow();
  });
  it('prevents participant overlaps without revealing the other meeting', async () => {
    await saveMeeting(head, meeting('02', [intern.id]));
    await expect(
      saveMeeting(
        lead,
        meeting('02', [intern.id], {
          start: '2026-12-02T10:30',
          end: '2026-12-02T11:30',
        }),
      ),
    ).rejects.toThrow('already have a meeting');
  });
  it('allows only the organiser to reschedule and protects stale edits', async () => {
    const id = await saveMeeting(head, meeting('03', [intern.id]));
    await expect(
      saveMeeting(intern, meeting('04', [head.id]), id, 0),
    ).rejects.toThrow('organiser');
    await saveMeeting(head, meeting('04', [intern.id]), id, 0);
    await expect(
      saveMeeting(head, meeting('05', [intern.id]), id, 0),
    ).rejects.toThrow('changed');
  });
  it('records participant responses and meeting outcomes', async () => {
    const id = await saveMeeting(head, meeting('06', [intern.id]));
    await respondMeeting(intern, id, 'accepted');
    expect((await getMeeting(intern, id)).response).toBe('accepted');
    await expect(
      closeMeeting(intern, id, 0, 'completed', 'forged'),
    ).rejects.toThrow();
    await closeMeeting(head, id, 0, 'completed', 'Agreed the next delivery.');
    expect((await getMeeting(intern, id)).meeting.minutes).toBe(
      'Agreed the next delivery.',
    );
  });
  it('checks conflicts when a declined invitation is accepted later', async () => {
    const id = await saveMeeting(head, meeting('07', [intern.id]));
    await respondMeeting(intern, id, 'declined');
    await saveMeeting(lead, meeting('07', [intern.id]));
    await expect(respondMeeting(intern, id, 'accepted')).rejects.toThrow(
      'already have a meeting',
    );
  });
  it('rejects impossible dates and invitations outside work scope', async () => {
    await expect(
      saveMeeting(intern, meeting('08', [outsider.id])),
    ).rejects.toThrow('Invite active people');
    await expect(
      saveMeeting(
        head,
        meeting('08', [intern.id], {
          start: '2026-02-31T10:00',
          end: '2026-02-31T11:00',
        }),
      ),
    ).rejects.toThrow('valid meeting times');
  });
});
describe('private work groups', () => {
  it('does not give Head invisible access to someone else’s private group', async () => {
    const id = await createGroup(intern, {
      name: 'Working group',
      description: 'Private',
      memberIds: [lead.id],
    });
    await expect(getGroup(head, id)).rejects.toThrow();
    expect((await listGroups(intern)).some((row) => row.group.id === id)).toBe(
      true,
    );
    await postGroupMessage(lead, id, 'Delivery ready.');
    expect((await getGroup(intern, id)).messages[0]!.message.body).toBe(
      'Delivery ready.',
    );
  });
  it('keeps replies in their original group and prevents cross-group thread injection', async () => {
    const first = await createGroup(head, {
      name: 'First group',
      description: '',
      memberIds: [intern.id],
    });
    const second = await createGroup(head, {
      name: 'Second group',
      description: '',
      memberIds: [lead.id],
    });
    await postGroupMessage(head, first, 'A decision');
    const [root] = await holder.db
      .select()
      .from(groupMessages)
      .where(eq(groupMessages.groupId, first));
    await postGroupMessage(intern, first, 'Following up', root!.id);
    expect((await getGroup(intern, first, 0, root!.id)).messages).toHaveLength(
      1,
    );
    await expect(
      postGroupMessage(head, second, 'Forged reply', root!.id),
    ).rejects.toThrow('thread in this group');
  });
  it('revokes group access immediately while keeping previous messages', async () => {
    const id = await createGroup(head, {
      name: 'Revocation group',
      description: '',
      memberIds: [intern.id],
    });
    await postGroupMessage(intern, id, 'Keep this history.');
    await updateGroup(head, id, { memberId: intern.id, remove: true });
    await expect(getGroup(intern, id)).rejects.toThrow();
    await expect(postGroupMessage(intern, id, 'Cannot send')).rejects.toThrow();
    expect((await getGroup(head, id)).messages).toHaveLength(1);
  });
  it('restricts pins/archive/membership to the creator and freezes archived discussion', async () => {
    const id = await createGroup(head, {
      name: 'Decision group',
      description: '',
      memberIds: [intern.id],
    });
    await postGroupMessage(head, id, 'Accepted decision.');
    const row = (await getGroup(head, id)).messages[0]!.message;
    await expect(updateGroup(intern, id, { archive: true })).rejects.toThrow(
      'creator',
    );
    await updateGroup(head, id, { pinId: row.id, pin: true });
    expect((await getGroup(intern, id)).pinned).toHaveLength(1);
    await updateGroup(head, id, { archive: true });
    await expect(postGroupMessage(intern, id, 'Too late')).rejects.toThrow(
      'archived',
    );
    await updateGroup(head, id, { archive: false });
    await postGroupMessage(intern, id, 'Restored.');
  });
});
describe('ideas and accountable initiatives', () => {
  it('keeps notes private by default, including from Head', async () => {
    const id = await saveIdea(lead, {
      title: 'Private thought',
      body: 'Rough notes.',
      memberIds: [],
    });
    expect((await listIdeas(head)).some((idea) => idea.id === id)).toBe(false);
    await expect(getIdea(head, id)).rejects.toThrow();
  });
  it('lets the author share and revoke access while blocking others from editing', async () => {
    const id = await saveIdea(lead, {
      title: 'Shared idea',
      body: 'Explore together.',
      memberIds: [head.id],
    });
    expect((await getIdea(head, id)).idea.body).toBe('Explore together.');
    await expect(
      saveIdea(head, { title: 'Overwrite', body: '', memberIds: [] }, id, 0),
    ).rejects.toThrow('author');
    await saveIdea(
      lead,
      { title: 'Shared idea', body: 'Private again.', memberIds: [] },
      id,
      0,
    );
    await expect(getIdea(head, id)).rejects.toThrow();
  });
  it('requires Head activation, creates lead scope and avoids duplicate initiatives', async () => {
    const id = await saveIdea(lead, {
      title: 'Faculty initiative',
      body: 'Connect research and delivery.',
      memberIds: [head.id, lead.id],
    });
    await expect(convertIdea(lead, id, lead.id)).rejects.toThrow(
      'Head activates',
    );
    const initiative = await convertIdea(head, id, lead.id);
    expect(await convertIdea(head, id, lead.id)).toBe(initiative);
    expect(
      (await getWorkspaceAccess(lead)).memberships.some(
        (member) => member.programmeId === initiative && member.role === 'lead',
      ),
    ).toBe(true);
    const [row] = await holder.db
      .select()
      .from(programmes)
      .where(eq(programmes.id, initiative));
    expect(row!.kind).toBe('initiative');
  });
  it('can contact people involved in direct assignments without granting unrelated directory access', async () => {
    expect(
      (await listContacts(intern)).some((person) => person.id === head.id),
    ).toBe(true);
    expect(
      (await listContacts(intern)).some((person) => person.id === outsider.id),
    ).toBe(false);
  });
});
