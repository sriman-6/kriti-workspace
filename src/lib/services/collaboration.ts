import 'server-only';
import { randomUUID } from 'node:crypto';
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  lt,
  gt,
  or,
  isNull,
  sql,
} from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  users,
  workspaceProfiles,
  workTasks,
  workEvents,
  programmes,
  programmeMembers,
  meetings,
  meetingParticipants,
  discussionGroups,
  groupMembers,
  groupMessages,
  ideas,
  ideaMembers,
  type User,
} from '@/lib/db/schema';
import { getWorkspaceAccess, getWorkspacePeople } from './workspace';
import { ForbiddenError, NotFoundError } from '@/lib/errors';
import type { MeetingInput } from '@/lib/schemas/collaboration';

export async function listContacts(user: User) {
  const people = await getWorkspacePeople(user);
  const direct = await db
    .select({
      ownerId: workTasks.ownerId,
      reviewerId: workTasks.reviewerId,
      assignerId: workTasks.assignerId,
    })
    .from(workTasks)
    .where(
      or(
        eq(workTasks.ownerId, user.id),
        eq(workTasks.reviewerId, user.id),
        eq(workTasks.assignerId, user.id),
      ),
    );
  const ids = [
    ...new Set(
      direct.flatMap((task) => [
        task.ownerId,
        ...(task.reviewerId ? [task.reviewerId] : []),
        task.assignerId,
      ]),
    ),
  ];
  const additional = ids.length
    ? await db
        .select({
          id: users.id,
          fullName: users.fullName,
          isActive: users.isActive,
        })
        .from(users)
        .where(inArray(users.id, ids))
    : [];
  const heads = await db
    .select({
      id: users.id,
      fullName: users.fullName,
      isActive: users.isActive,
    })
    .from(users)
    .innerJoin(workspaceProfiles, eq(workspaceProfiles.userId, users.id))
    .where(eq(workspaceProfiles.role, 'head'));
  return [
    ...new Map(
      [...people, ...additional, ...heads]
        .filter((person) => person.isActive)
        .map((person) => [
          person.id,
          { id: person.id, fullName: person.fullName },
        ]),
    ).values(),
  ].sort((a, b) => a.fullName.localeCompare(b.fullName));
}
async function assertContacts(user: User, ids: string[]) {
  const contacts = await listContacts(user);
  const allowed = new Set(contacts.map((person) => person.id));
  if (ids.length > 100 || ids.some((id) => !allowed.has(id)))
    throw new ForbiddenError(
      'Invite active people from your programmes or current work.',
    );
}
function meetingTimes(input: MeetingInput) {
  const offset = input.timezone === 'Asia/Dubai' ? '+04:00' : '+05:30';
  const start = new Date(input.start + offset),
    end = new Date(input.end + offset);
  const minutes = input.timezone === 'Asia/Dubai' ? 240 : 330;
  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    end <= start ||
    new Date(start.getTime() + minutes * 60000).toISOString().slice(0, 16) !==
      input.start ||
    new Date(end.getTime() + minutes * 60000).toISOString().slice(0, 16) !==
      input.end
  )
    throw new ForbiddenError('Choose valid meeting times.');
  return { start, end };
}
export async function listMeetings(user: User) {
  return db
    .select({ meeting: meetings, response: meetingParticipants.response })
    .from(meetings)
    .innerJoin(
      meetingParticipants,
      eq(meetingParticipants.meetingId, meetings.id),
    )
    .where(eq(meetingParticipants.userId, user.id))
    .orderBy(asc(meetings.startsAt));
}
export async function getMeeting(user: User, id: string) {
  const [row] = await db
    .select({ meeting: meetings, response: meetingParticipants.response })
    .from(meetings)
    .innerJoin(
      meetingParticipants,
      eq(meetingParticipants.meetingId, meetings.id),
    )
    .where(and(eq(meetings.id, id), eq(meetingParticipants.userId, user.id)));
  if (!row) throw new NotFoundError('That meeting is unavailable.');
  const participants = await db
    .select({
      id: users.id,
      fullName: users.fullName,
      response: meetingParticipants.response,
    })
    .from(meetingParticipants)
    .innerJoin(users, eq(users.id, meetingParticipants.userId))
    .where(eq(meetingParticipants.meetingId, id));
  return { ...row, participants };
}
export async function saveMeeting(
  user: User,
  input: MeetingInput,
  id?: string,
  version?: number,
) {
  const ids = [...new Set([user.id, ...input.memberIds])];
  await assertContacts(user, ids);
  const { start, end } = meetingTimes(input);
  return db.transaction(async (tx) => {
    let previous: typeof meetings.$inferSelect | undefined;
    if (id) {
      [previous] = await tx
        .select()
        .from(meetings)
        .where(eq(meetings.id, id))
        .for('update');
      if (!previous || previous.organizerId !== user.id)
        throw new ForbiddenError('Only the organiser can change this meeting.');
      if (previous.version !== version || previous.status !== 'scheduled')
        throw new ForbiddenError(
          'This meeting has changed or is closed. Refresh before editing.',
        );
    }
    for (const participant of [...ids].sort())
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${participant}))`,
      );
    const conflicts = await tx
      .select({ id: meetings.id })
      .from(meetings)
      .innerJoin(
        meetingParticipants,
        eq(meetingParticipants.meetingId, meetings.id),
      )
      .where(
        and(
          inArray(meetingParticipants.userId, ids),
          eq(meetings.status, 'scheduled'),
          lt(meetings.startsAt, end),
          gt(meetings.endsAt, start),
          id ? sql`${meetings.id} <> ${id}` : undefined,
          sql`${meetingParticipants.response} <> 'declined'`,
        ),
      );
    if (conflicts.length)
      throw new ForbiddenError(
        'One or more participants already have a meeting during this time.',
      );
    const values = {
      title: input.title,
      agenda: input.agenda,
      startsAt: start,
      endsAt: end,
      timezone: input.timezone,
      location: input.location,
      joinUrl: input.joinUrl || null,
      updatedAt: new Date(),
    };
    const meeting = id
      ? (
          await tx
            .update(meetings)
            .set({ ...values, version: (version ?? 0) + 1 })
            .where(eq(meetings.id, id))
            .returning()
        )[0]
      : (
          await tx
            .insert(meetings)
            .values({ ...values, organizerId: user.id })
            .returning()
        )[0];
    if (!meeting) throw new Error('Meeting could not be saved.');
    if (id)
      await tx
        .delete(meetingParticipants)
        .where(eq(meetingParticipants.meetingId, id));
    await tx.insert(meetingParticipants).values(
      ids.map((userId) => ({
        meetingId: meeting.id,
        userId,
        response:
          userId === user.id ? ('accepted' as const) : ('invited' as const),
      })),
    );
    await tx.insert(workEvents).values({
      actorId: user.id,
      message: `Meeting ${id ? 'rescheduled/updated' : 'scheduled'}: ${input.title}.`,
    });
    return meeting.id;
  });
}
export async function respondMeeting(
  user: User,
  id: string,
  response: 'accepted' | 'declined',
) {
  await getMeeting(user, id);
  await db.transaction(async (tx) => {
    const [meeting] = await tx
      .select()
      .from(meetings)
      .where(eq(meetings.id, id))
      .for('update');
    if (!meeting || meeting.status !== 'scheduled')
      throw new ForbiddenError('This meeting is closed.');
    if (meeting.organizerId === user.id && response === 'declined')
      throw new ForbiddenError('The organiser can cancel the meeting instead.');
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${user.id}))`);
    if (response === 'accepted') {
      const conflicts = await tx
        .select({ id: meetings.id })
        .from(meetings)
        .innerJoin(
          meetingParticipants,
          eq(meetingParticipants.meetingId, meetings.id),
        )
        .where(
          and(
            eq(meetingParticipants.userId, user.id),
            eq(meetings.status, 'scheduled'),
            sql`${meetings.id} <> ${id}`,
            sql`${meetingParticipants.response} <> 'declined'`,
            lt(meetings.startsAt, meeting.endsAt),
            gt(meetings.endsAt, meeting.startsAt),
          ),
        );
      if (conflicts.length)
        throw new ForbiddenError(
          'You already have a meeting during this time.',
        );
    }
    await tx
      .update(meetingParticipants)
      .set({ response })
      .where(
        and(
          eq(meetingParticipants.meetingId, id),
          eq(meetingParticipants.userId, user.id),
        ),
      );
  });
}
export async function closeMeeting(
  user: User,
  id: string,
  version: number,
  status: 'completed' | 'cancelled',
  minutes: string,
) {
  await db.transaction(async (tx) => {
    const [meeting] = await tx
      .select()
      .from(meetings)
      .where(eq(meetings.id, id))
      .for('update');
    if (!meeting || meeting.organizerId !== user.id) throw new ForbiddenError();
    if (meeting.version !== version || meeting.status !== 'scheduled')
      throw new ForbiddenError(
        'This meeting has changed or is already closed.',
      );
    await tx
      .update(meetings)
      .set({ status, minutes, version: version + 1, updatedAt: new Date() })
      .where(eq(meetings.id, id));
    await tx.insert(workEvents).values({
      actorId: user.id,
      message: `Meeting ${status}: ${meeting.title}.`,
    });
  });
}
export async function listGroups(user: User) {
  return db
    .select({ group: discussionGroups, lastReadAt: groupMembers.lastReadAt })
    .from(discussionGroups)
    .innerJoin(groupMembers, eq(groupMembers.groupId, discussionGroups.id))
    .where(
      and(eq(groupMembers.userId, user.id), eq(groupMembers.isActive, true)),
    )
    .orderBy(desc(discussionGroups.updatedAt));
}
export async function getGroup(
  user: User,
  id: string,
  page = 0,
  parentId?: string,
) {
  const [row] = await db
    .select({ group: discussionGroups, lastReadAt: groupMembers.lastReadAt })
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
  const members = await db
    .select({ id: users.id, fullName: users.fullName })
    .from(groupMembers)
    .innerJoin(users, eq(users.id, groupMembers.userId))
    .where(and(eq(groupMembers.groupId, id), eq(groupMembers.isActive, true)));
  let parent: typeof groupMessages.$inferSelect | undefined;
  if (parentId) {
    [parent] = await db
      .select()
      .from(groupMessages)
      .where(
        and(
          eq(groupMessages.id, parentId),
          eq(groupMessages.groupId, id),
          isNull(groupMessages.parentId),
        ),
      );
    if (!parent) throw new NotFoundError('That thread is unavailable.');
  }
  const messages = await db
    .select({ message: groupMessages, authorName: users.fullName })
    .from(groupMessages)
    .innerJoin(users, eq(users.id, groupMessages.authorId))
    .where(
      and(
        eq(groupMessages.groupId, id),
        parentId
          ? eq(groupMessages.parentId, parentId)
          : isNull(groupMessages.parentId),
      ),
    )
    .orderBy(desc(groupMessages.createdAt), desc(groupMessages.id))
    .limit(51)
    .offset(Math.max(0, Math.min(page, 10000)) * 50);
  const pinned = await db
    .select({ id: groupMessages.id, body: groupMessages.body })
    .from(groupMessages)
    .where(and(eq(groupMessages.groupId, id), eq(groupMessages.isPinned, true)))
    .orderBy(desc(groupMessages.createdAt))
    .limit(10);
  return {
    ...row,
    members,
    parent,
    messages: messages.slice(0, 50).reverse(),
    hasOlder: messages.length > 50,
    pinned,
  };
}
export async function createGroup(
  user: User,
  input: { name: string; description: string; memberIds: string[] },
) {
  await assertContacts(user, input.memberIds);
  const ids = [...new Set([user.id, ...input.memberIds])];
  return db.transaction(async (tx) => {
    const [group] = await tx
      .insert(discussionGroups)
      .values({
        ownerId: user.id,
        name: input.name,
        description: input.description,
      })
      .returning();
    if (!group) throw new Error('Group could not be created.');
    await tx
      .insert(groupMembers)
      .values(ids.map((userId) => ({ groupId: group.id, userId })));
    return group.id;
  });
}
export async function postGroupMessage(
  user: User,
  groupId: string,
  body: string,
  parentId?: string,
) {
  return db.transaction(async (tx) => {
    const [member] = await tx
      .select()
      .from(groupMembers)
      .where(
        and(
          eq(groupMembers.groupId, groupId),
          eq(groupMembers.userId, user.id),
          eq(groupMembers.isActive, true),
        ),
      )
      .for('update');
    const [group] = await tx
      .select()
      .from(discussionGroups)
      .where(eq(discussionGroups.id, groupId))
      .for('update');
    if (!member || !group || group.isArchived)
      throw new ForbiddenError('This group is unavailable or archived.');
    if (parentId) {
      const [parent] = await tx
        .select()
        .from(groupMessages)
        .where(
          and(
            eq(groupMessages.id, parentId),
            eq(groupMessages.groupId, groupId),
            isNull(groupMessages.parentId),
          ),
        );
      if (!parent) throw new ForbiddenError('Choose a thread in this group.');
    }
    await tx
      .insert(groupMessages)
      .values({ groupId, authorId: user.id, body, parentId: parentId || null });
    await tx
      .update(discussionGroups)
      .set({ updatedAt: new Date() })
      .where(eq(discussionGroups.id, groupId));
  });
}
export async function updateGroup(
  user: User,
  id: string,
  input: {
    memberId?: string;
    remove?: boolean;
    archive?: boolean;
    pinId?: string;
    pin?: boolean;
  },
) {
  const { group } = await getGroup(user, id);
  if (group.ownerId !== user.id)
    throw new ForbiddenError(
      'Only the group creator can manage membership and pins.',
    );
  if (input.memberId && !input.remove) await assertContacts(user, [input.memberId]);
  return db.transaction(async (tx) => {
    await tx
      .select({ id: discussionGroups.id })
      .from(discussionGroups)
      .where(eq(discussionGroups.id, id))
      .for('update');
    if (input.memberId) {
      if (input.memberId === user.id && input.remove)
        throw new ForbiddenError(
          'The creator remains responsible for this group. Archive it instead.',
        );
      await tx
        .insert(groupMembers)
        .values({ groupId: id, userId: input.memberId, isActive: !input.remove })
        .onConflictDoUpdate({
          target: [groupMembers.groupId, groupMembers.userId],
          set: { isActive: !input.remove },
        });
    }
    if (input.archive !== undefined)
      await tx
        .update(discussionGroups)
        .set({ isArchived: input.archive })
        .where(eq(discussionGroups.id, id));
    if (input.pinId)
      await tx
        .update(groupMessages)
        .set({ isPinned: input.pin ?? false })
        .where(
          and(eq(groupMessages.id, input.pinId), eq(groupMessages.groupId, id)),
        );
  });
}
export async function markGroupRead(user: User, id: string) {
  await getGroup(user, id);
  await db
    .update(groupMembers)
    .set({ lastReadAt: new Date() })
    .where(and(eq(groupMembers.groupId, id), eq(groupMembers.userId, user.id)));
}
export async function listIdeas(user: User) {
  const shared = await db
    .select({ id: ideaMembers.ideaId })
    .from(ideaMembers)
    .where(eq(ideaMembers.userId, user.id));
  const ids = shared.map((row) => row.id);
  return db
    .select()
    .from(ideas)
    .where(
      or(
        eq(ideas.authorId, user.id),
        ...(ids.length ? [inArray(ideas.id, ids)] : []),
      ),
    )
    .orderBy(desc(ideas.updatedAt));
}
export async function getIdea(user: User, id: string) {
  const visible = (await listIdeas(user)).find((idea) => idea.id === id);
  if (!visible) throw new NotFoundError('That idea is unavailable.');
  const members = await db
    .select({ id: users.id, fullName: users.fullName })
    .from(ideaMembers)
    .innerJoin(users, eq(users.id, ideaMembers.userId))
    .where(eq(ideaMembers.ideaId, id));
  return { idea: visible, members };
}
export async function saveIdea(
  user: User,
  input: { title: string; body: string; memberIds: string[] },
  id?: string,
  version?: number,
) {
  await assertContacts(user, input.memberIds);
  return db.transaction(async (tx) => {
    let row: typeof ideas.$inferSelect | undefined;
    if (id) {
      [row] = await tx
        .select()
        .from(ideas)
        .where(eq(ideas.id, id))
        .for('update');
      if (!row || row.authorId !== user.id)
        throw new ForbiddenError(
          'Only the author can edit or share this idea.',
        );
      if (row.version !== version)
        throw new ForbiddenError(
          'This idea has changed. Refresh before editing.',
        );
    }
    const idea = id
      ? (
          await tx
            .update(ideas)
            .set({
              title: input.title,
              body: input.body,
              version: (version ?? 0) + 1,
              updatedAt: new Date(),
            })
            .where(eq(ideas.id, id))
            .returning()
        )[0]
      : (
          await tx
            .insert(ideas)
            .values({ authorId: user.id, title: input.title, body: input.body })
            .returning()
        )[0];
    if (!idea) throw new Error('Idea could not be saved.');
    if (id) await tx.delete(ideaMembers).where(eq(ideaMembers.ideaId, id));
    const members = [...new Set(input.memberIds)].filter(
      (userId) => userId !== user.id,
    );
    if (members.length)
      await tx
        .insert(ideaMembers)
        .values(members.map((userId) => ({ ideaId: idea.id, userId })));
    return idea.id;
  });
}
export async function convertIdea(user: User, id: string, leadId: string) {
  if (!(await getWorkspaceAccess(user)).isHead)
    throw new ForbiddenError('The Head activates new initiatives.');
  await getIdea(user, id);
  await assertContacts(user, [leadId]);
  return db.transaction(async (tx) => {
    const [idea] = await tx
      .select()
      .from(ideas)
      .where(eq(ideas.id, id))
      .for('update');
    if (!idea) throw new NotFoundError();
    if (idea.initiativeId) return idea.initiativeId;
    const [initiative] = await tx
      .insert(programmes)
      .values({
        name: idea.title,
        description: idea.body,
        kind: 'initiative',
        code: `I-${randomUUID().slice(0, 8).toUpperCase()}`,
      })
      .returning();
    if (!initiative) throw new Error('Initiative could not be created.');
    const shared = await tx
      .select({ id: ideaMembers.userId })
      .from(ideaMembers)
      .where(eq(ideaMembers.ideaId, id));
    const ids = [
      ...new Set([leadId, idea.authorId, ...shared.map((row) => row.id)]),
    ];
    await tx.insert(programmeMembers).values(
      ids.map((userId) => ({
        programmeId: initiative.id,
        userId,
        role: userId === leadId ? ('lead' as const) : ('member' as const),
      })),
    );
    await tx
      .update(ideas)
      .set({
        initiativeId: initiative.id,
        version: idea.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(ideas.id, id));
    await tx.insert(workEvents).values({
      actorId: user.id,
      message: `Initiative activated: ${idea.title}.`,
    });
    return initiative.id;
  });
}
