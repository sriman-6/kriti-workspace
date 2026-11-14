import 'server-only';
import { randomUUID } from 'node:crypto';

import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  gt,
  lt,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { db, type Database } from '@/lib/db';
import {
  programmeMembers,
  programmes,
  users,
  workspaceProfiles,
  workTasks,
  workSubmissions,
  workFiles,
  workUploads,
  workEvents,
  workNotifications,
  type User,
  type WorkTask,
} from '@/lib/db/schema';
import { ForbiddenError, NotFoundError } from '@/lib/errors';
import { isAllowedBitsEmail, campusForEmail } from '@/lib/auth/domains';
import { describeWorkFile, validateWorkFileContent } from '@/lib/work-files';
import { readWorkBlob, deleteWorkBlob } from '@/lib/storage/work-blob';
import {
  MAX_FILE_BYTES,
  MAX_SUBMISSION_FILES,
  type WorkspaceRole,
} from '@/lib/workspace';
import type {
  TaskInput,
  SubmissionInput,
  ReviewInput,
  ProgressInput,
} from '@/lib/schemas/work';

type Connection = Pick<Database, 'select' | 'insert' | 'update'>;
export async function getWorkspaceAccess(user: User) {
  const [profiles, memberships] = await Promise.all([
    db
      .select()
      .from(workspaceProfiles)
      .where(eq(workspaceProfiles.userId, user.id)),
    db
      .select({
        programmeId: programmeMembers.programmeId,
        role: programmeMembers.role,
      })
      .from(programmeMembers)
      .innerJoin(programmes, eq(programmes.id, programmeMembers.programmeId))
      .where(
        and(
          eq(programmeMembers.userId, user.id),
          eq(programmes.isActive, true),
        ),
      ),
  ]);
  const role = profiles[0]?.role ?? null;
  return {
    role,
    isHead: role === 'head',
    canConfigure: role === 'head' || user.role === 'super_admin',
    canManagePeople: user.role === 'super_admin' || (role !== null && ['head', 'program_head', 'manager', 'administrative_support'].includes(role)),
    canCreateProgrammes: profiles[0]?.programmeCreationAllowed === true ||
      (role !== null && ['head', 'associate_head', 'nucleus', 'manager', 'program_head'].includes(role)),
    memberships,
  };
}
export type WorkspaceAccess = Awaited<ReturnType<typeof getWorkspaceAccess>>;
function taskScope(user: User, access: WorkspaceAccess): SQL {
  if (access.isHead) return sql`true`;
  const portfolio = access.memberships
    .filter((member) =>
      ['lead', 'manager', 'reviewer', 'adviser'].includes(member.role),
    )
    .map((member) => member.programmeId);
  return or(
    eq(workTasks.ownerId, user.id),
    eq(workTasks.reviewerId, user.id),
    eq(workTasks.assignerId, user.id),
    sql`${user.id}::uuid = any(${workTasks.viewerIds})`,
    ...(portfolio.length ? [inArray(workTasks.programmeId, portfolio)] : []),
  )!;
}
export function canDelegate(
  access: WorkspaceAccess,
  programmeId: string | null,
): boolean {
  return (
    access.isHead ||
    Boolean(
      programmeId &&
      access.memberships.some(
        (member) =>
          member.programmeId === programmeId &&
          ['lead', 'manager'].includes(member.role),
      ),
    )
  );
}
export async function getWorkspacePeople(user: User) {
  const access = await getWorkspaceAccess(user);
  const allowedProgrammes = access.memberships.map(
    (member) => member.programmeId,
  );
  const allowedUsers = allowedProgrammes.length
    ? (
        await db
          .select({ id: programmeMembers.userId })
          .from(programmeMembers)
          .where(inArray(programmeMembers.programmeId, allowedProgrammes))
      ).map((member) => member.id)
    : [];
  return db
    .select({
      id: users.id,
      fullName: users.fullName,
      email: users.email,
      isActive: users.isActive,
      workspaceRole: workspaceProfiles.role,
    })
    .from(users)
    .leftJoin(workspaceProfiles, eq(workspaceProfiles.userId, users.id))
    .where(
      and(
        access.canManagePeople
          ? or(
              eq(users.isActive, true),
              sql`${workspaceProfiles.userId} is not null`,
            )
          : inArray(users.id, [...allowedUsers, user.id]),
      ),
    )
    .orderBy(asc(users.fullName));
}
export type WorkspacePerson = Awaited<
  ReturnType<typeof getWorkspacePeople>
>[number];
// Members can share their own work across KRITI, without gaining access to other work.
export async function getWorkSharingPeople() {
  return db.select({ id: users.id, fullName: users.fullName })
    .from(users)
    .innerJoin(workspaceProfiles, eq(workspaceProfiles.userId, users.id))
    .where(eq(users.isActive, true))
    .orderBy(asc(users.fullName));
}
export async function listProgrammes(user: User) {
  const access = await getWorkspaceAccess(user);
  const ids = access.memberships.map((member) => member.programmeId);
  return db
    .select()
    .from(programmes)
    .where(
      and(
        eq(programmes.isActive, true),
        access.canConfigure
          ? undefined
          : ids.length
            ? inArray(programmes.id, ids)
            : sql`false`,
      ),
    )
    .orderBy(asc(programmes.name));
}
export async function listWork(user: User) {
  const access = await getWorkspaceAccess(user);
  const tasks = await db
    .select()
    .from(workTasks)
    .where(taskScope(user, access))
    .orderBy(desc(workTasks.updatedAt));
  const ids = [
    ...new Set(
      tasks.flatMap((task) => [task.ownerId, task.assignerId, ...(task.reviewerId ? [task.reviewerId] : [])]),
    ),
  ];
  const [people, programmeRows] = await Promise.all([
    ids.length
      ? db
          .select({ id: users.id, fullName: users.fullName })
          .from(users)
          .where(inArray(users.id, ids))
      : [],
    listProgrammes(user),
  ]);
  const names = new Map(people.map((person) => [person.id, person.fullName]));
  const programmeNames = new Map(
    programmeRows.map((programme) => [programme.id, programme.name]),
  );
  return tasks.map((task) => ({
    ...task,
    ownerName: names.get(task.ownerId) ?? 'Unavailable',
    assignerName: names.get(task.assignerId) ?? 'Unavailable',
    reviewerName: task.reviewerId ? (names.get(task.reviewerId) ?? 'Unavailable') : 'No review requested',
    programmeName: task.programmeId
      ? (programmeNames.get(task.programmeId) ?? 'Programme work')
      : task.ownerId === task.assignerId ? 'Self-created work' : 'Direct assignment',
  }));
}
export type WorkListItem = Awaited<ReturnType<typeof listWork>>[number];
export async function getWorkLibrary(user:User){
  const tasks=await listWork(user);if(!tasks.length)return [];
  const byId=new Map(tasks.map(task=>[task.id,task]));
  const submissions=await db.select({submission:workSubmissions,uploaderName:users.fullName}).from(workSubmissions).innerJoin(users,eq(users.id,workSubmissions.authorId)).where(inArray(workSubmissions.taskId,tasks.map(task=>task.id))).orderBy(desc(workSubmissions.createdAt));
  const files=submissions.length?await db.select({id:workFiles.id,name:workFiles.name,size:workFiles.size,submissionId:workFiles.submissionId}).from(workFiles).where(inArray(workFiles.submissionId,submissions.map(row=>row.submission.id))):[];
  return submissions.map(row=>({...row,taskTitle:byId.get(row.submission.taskId)!.title,reviewRequired:Boolean(byId.get(row.submission.taskId)!.reviewerId),files:files.filter(file=>file.submissionId===row.submission.id)}));
}
async function taskFor(user: User, taskId: string) {
  const access = await getWorkspaceAccess(user);
  const [task] = await db
    .select()
    .from(workTasks)
    .where(and(eq(workTasks.id, taskId), taskScope(user, access)));
  if (!task) throw new NotFoundError('That task is unavailable.');
  return { task, access };
}
export async function getWorkDetail(user: User, taskId: string) {
  const { task, access } = await taskFor(user, taskId);
  const [people, submissions, events] = await Promise.all([
    db
      .select({ id: users.id, fullName: users.fullName })
      .from(users)
      .where(
        inArray(users.id, [task.ownerId, task.assignerId, ...task.viewerIds, ...(task.reviewerId ? [task.reviewerId] : [])]),
      ),
    db
      .select()
      .from(workSubmissions)
      .where(eq(workSubmissions.taskId, task.id))
      .orderBy(desc(workSubmissions.version)),
    db
      .select({
        id: workEvents.id,
        message: workEvents.message,
        createdAt: workEvents.createdAt,
        actorName: users.fullName,
      })
      .from(workEvents)
      .innerJoin(users, eq(users.id, workEvents.actorId))
      .where(eq(workEvents.taskId, task.id))
      .orderBy(desc(workEvents.createdAt)),
  ]);
  const files = submissions.length
    ? await db
        .select({
          id: workFiles.id,
          submissionId: workFiles.submissionId,
          name: workFiles.name,
          size: workFiles.size,
        })
        .from(workFiles)
        .where(
          inArray(
            workFiles.submissionId,
            submissions.map((item) => item.id),
          ),
        )
    : [];
  return {
    task,
    people,
    submissions: submissions.map((submission) => ({
      ...submission,
      files: files.filter((file) => file.submissionId === submission.id),
    })),
    events,
    canEdit:
      access.isHead ||
      task.assignerId === user.id ||
      canDelegate(access, task.programmeId),
    canReview: task.reviewerId === user.id,
  };
}
async function assertParticipants(connection: Connection, input: TaskInput, selfCreated: boolean) {
  const ids = [...new Set([input.ownerId, ...(input.reviewerId ? [input.reviewerId] : [])])];
  if (input.ownerId === input.reviewerId || (!selfCreated && !input.reviewerId))
    throw new ForbiddenError('Delegated work needs a reviewer other than the owner.');
  const participants = await connection
    .select()
    .from(users)
    .where(inArray(users.id, ids));
  if (
    participants.length !== ids.length ||
    participants.some((person) => !person.isActive)
  )
    throw new ForbiddenError(
      'Choose an active owner and a different active reviewer.',
    );
  if (input.programmeId) {
    const [programme] = await connection
      .select()
      .from(programmes)
      .where(
        and(
          eq(programmes.id, input.programmeId),
          eq(programmes.isActive, true),
        ),
      );
    if (!programme) throw new ForbiddenError('That programme is unavailable.');
    const memberships = await connection
      .select()
      .from(programmeMembers)
      .where(
        and(
          eq(programmeMembers.programmeId, input.programmeId),
          inArray(programmeMembers.userId, selfCreated ? [input.ownerId] : ids),
        ),
      );
    if (memberships.length !== (selfCreated ? 1 : ids.length))
      throw new ForbiddenError(
        'The owner and reviewer must both be members of this programme.',
      );
  }
}
async function assertViewers(connection: Connection, ids: string[]) {
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length > 100) throw new ForbiddenError('Choose at most 100 viewers.');
  if (!uniqueIds.length) return;
  const people = await connection.select({ id: users.id }).from(users)
    .innerJoin(workspaceProfiles, eq(workspaceProfiles.userId, users.id))
    .where(and(inArray(users.id, uniqueIds), eq(users.isActive, true)));
  if (people.length !== uniqueIds.length)
    throw new ForbiddenError('Choose active KRITI members as viewers.');
}
function canRecordOwnWork(user: User, access: WorkspaceAccess, input: TaskInput) {
  return input.ownerId === user.id && (!input.programmeId ||
    access.memberships.some((member) => member.programmeId === input.programmeId));
}
async function notify(
  connection: Connection,
  actorId: string,
  taskId: string,
  recipients: (string | null)[],
  message: string,
) {
  const ids = [...new Set(recipients)].filter((id): id is string => Boolean(id) && id !== actorId);
  if (ids.length)
    await connection
      .insert(workNotifications)
      .values(ids.map((userId) => ({ userId, taskId, message })));
}
export async function createWork(
  user: User,
  input: TaskInput,
): Promise<string> {
  const access = await getWorkspaceAccess(user);
  if (!canDelegate(access, input.programmeId) && !canRecordOwnWork(user, access, input))
    throw new ForbiddenError(
      'Only the Head or an assigned programme lead or manager can delegate this work.',
    );
  return db.transaction(async (tx) => {
    await assertParticipants(tx, input, input.ownerId === user.id);
    await assertViewers(tx, input.viewerIds ?? []);
    const [task] = await tx
      .insert(workTasks)
      .values({ ...input, assignerId: user.id })
      .returning();
    if (!task) throw new Error('Task insert returned no row.');
    await tx
      .insert(workEvents)
      .values({ taskId: task.id, actorId: user.id, message: input.ownerId === user.id ? 'Work created by its owner.' : 'Task assigned.' });
    await notify(
      tx,
      user.id,
      task.id,
      [input.ownerId, input.reviewerId, ...(input.viewerIds ?? [])],
      `New task: ${input.title}`,
    );
    return task.id;
  });
}
// Lock the task for each transition. A stale browser cannot review or resubmit an old version.
async function lockedTask(connection: Connection, id: string) {
  const [task] = await connection
    .select()
    .from(workTasks)
    .where(eq(workTasks.id, id))
    .for('update');
  if (!task) throw new NotFoundError('That task is unavailable.');
  return task;
}
function assertVersion(task: WorkTask, expected: number) {
  if (task.version !== expected)
    throw new ForbiddenError(
      'This task has changed. Refresh before continuing.',
    );
}
export async function editWork(
  user: User,
  taskId: string,
  version: number,
  input: TaskInput,
) {
  const access = await getWorkspaceAccess(user);
  await db.transaction(async (tx) => {
    const task = await lockedTask(tx, taskId);
    if (
      !(
        access.isHead ||
        task.assignerId === user.id ||
        canDelegate(access, task.programmeId)
      ) ||
      !(canDelegate(access, input.programmeId) ||
        (task.assignerId === user.id && task.ownerId === user.id && canRecordOwnWork(user, access, input)))
    )
      throw new ForbiddenError();
    assertVersion(task, version);
    if (['submitted', 'completed', 'cancelled'].includes(task.status))
      throw new ForbiddenError(
        'Resolve the current review before changing this assignment. Completed and cancelled tasks are retained as history.',
      );
    await assertParticipants(tx, input, input.ownerId === task.assignerId);
    await assertViewers(tx, input.viewerIds ?? []);
    await tx
      .update(workTasks)
      .set({ ...input, viewerIds: input.viewerIds ?? [], version: task.version + 1, updatedAt: new Date() })
      .where(eq(workTasks.id, task.id));
    await tx.insert(workEvents).values({
      taskId,
      actorId: user.id,
      message: 'Assignment details updated.',
    });
    await notify(
      tx,
      user.id,
      task.id,
      [task.ownerId, task.reviewerId, input.ownerId, input.reviewerId, ...(input.viewerIds ?? [])],
      `Assignment updated: ${input.title}`,
    );
  });
}
export async function shareWork(user: User, input: { taskId: string; version: number; viewerIds: string[] }) {
  const access = await getWorkspaceAccess(user);
  await db.transaction(async (tx) => {
    const task = await lockedTask(tx, input.taskId);
    if (!(access.isHead || task.assignerId === user.id || canDelegate(access, task.programmeId)))
      throw new ForbiddenError('Only the creator or work leads can change visibility.');
    assertVersion(task, input.version);
    await assertViewers(tx, input.viewerIds);
    const viewerIds = [...new Set(input.viewerIds)];
    await tx.update(workTasks).set({ viewerIds, version: task.version + 1, updatedAt: new Date() }).where(eq(workTasks.id, task.id));
    await tx.insert(workEvents).values({ taskId: task.id, actorId: user.id, message: 'Work visibility updated.' });
    await notify(tx, user.id, task.id, viewerIds.filter((id) => !task.viewerIds.includes(id)), `Work shared with you: ${task.title}`);
  });
}
export type WorkUpload = {
  name: string;
  size: number;
  contentType: string;
  content: Buffer;
};
function assertCanSubmitWork(task: WorkTask, user: User, version: number) {
  if (task.ownerId !== user.id) throw new ForbiddenError('Only the task owner can submit its work.');
  assertVersion(task, version);
  if (!['assigned', 'in_progress', 'blocked', 'changes_requested'].includes(task.status))
    throw new ForbiddenError('This task is already under review or closed.');
}

export async function reserveWorkUploads(user: User, input: {
  taskId: string; version: number; files: { name: string; size: number }[];
}) {
  if (!input.files.length || input.files.length > MAX_SUBMISSION_FILES)
    throw new ForbiddenError('Upload at most three files per submission.');
  const files = input.files.map((file) => describeWorkFile(file.name, file.size));
  return db.transaction(async (tx) => {
    const task = await lockedTask(tx, input.taskId);
    assertCanSubmitWork(task, user, input.version);
    // Serialize reservations per person, including those for different tasks.
    await tx.select({ id: users.id }).from(users).where(eq(users.id, user.id)).for('update');
    const pending = await tx.select({ id: workUploads.id }).from(workUploads).where(and(
      eq(workUploads.ownerId, user.id), isNull(workUploads.claimedAt), gt(workUploads.expiresAt, new Date()),
    )).limit(31);
    if (pending.length + files.length > 30)
      throw new ForbiddenError('Too many files are waiting to be submitted. Finish pending work or try again in an hour.');
    const requested = files.map((file) => ({
      id: randomUUID(),
      ...file, taskId: task.id, taskVersion: task.version, ownerId: user.id,
      blobPath: `work/${task.id}/${randomUUID()}.${file.name.split('.').pop()!.toLowerCase()}`,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    }));
    const inserted = await tx.insert(workUploads).values(requested).returning();
    return requested.map((file) => {
      const row = inserted.find((record) => record.id === file.id)!;
      return { id: row.id, name: row.name, size: row.size, contentType: row.contentType, blobPath: row.blobPath };
    });
  });
}

function assertPendingUpload(upload: typeof workUploads.$inferSelect, user: User, input: { taskId: string; version: number }) {
  if (upload.ownerId !== user.id || upload.taskId !== input.taskId ||
      upload.taskVersion !== input.version || upload.claimedAt || upload.expiresAt <= new Date())
    throw new ForbiddenError('This upload is unavailable or expired. Choose the file again.');
}

export async function authorizeWorkUpload(user: User, uploadId: string, pathname: string) {
  const [upload] = await db.select().from(workUploads).where(eq(workUploads.id, uploadId));
  if (!upload || upload.blobPath !== pathname) throw new ForbiddenError('This upload is unavailable.');
  return db.transaction(async (tx) => {
    const task = await lockedTask(tx, upload.taskId);
    assertCanSubmitWork(task, user, upload.taskVersion);
    assertPendingUpload(upload, user, { taskId: task.id, version: task.version });
    return {
      allowedContentTypes: [upload.contentType], maximumSizeInBytes: upload.size,
      validUntil: Math.min(upload.expiresAt.getTime(), Date.now() + 5 * 60 * 1000),
      addRandomSuffix: false, allowOverwrite: false,
    };
  });
}

async function resolveWorkUploads(user: User, input: SubmissionInput, ids: string[]) {
  if (!ids.length) return [];
  const [task] = await db.select().from(workTasks).where(eq(workTasks.id, input.taskId));
  if (!task) throw new NotFoundError();
  assertCanSubmitWork(task, user, input.version);
  const rows = await db.select().from(workUploads).where(inArray(workUploads.id, ids));
  if (rows.length !== ids.length) throw new ForbiddenError('An attached upload is unavailable. Choose the files again.');
  for (const row of rows) assertPendingUpload(row, user, input);
  // Re-read bytes from the private store, never trusting client URLs, MIME or size.
  for (const row of rows) validateWorkFileContent(row, await readWorkBlob(row.blobPath, row.size));
  return rows;
}

export async function cleanupWorkUploads(now = new Date()) {
  // Upload tokens expire within five minutes; give expired uploads a full day
  // before cleanup, including abandoned tabs and failed submission attempts.
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const rows = await db.select().from(workUploads).where(and(
    isNull(workUploads.claimedAt), lt(workUploads.expiresAt, cutoff),
  )).limit(100);
  let removed = 0;
  for (const row of rows) {
    await deleteWorkBlob(row.blobPath);
    await db.delete(workUploads).where(and(eq(workUploads.id, row.id), isNull(workUploads.claimedAt)));
    removed++;
  }
  return removed;
}

export async function validateWorkUploads(
  files: File[],
): Promise<WorkUpload[]> {
  if (files.length > MAX_SUBMISSION_FILES)
    throw new ForbiddenError('Upload at most three files per submission.');
  return Promise.all(
    files.map(async (file) => {
      const metadata = describeWorkFile(file.name, file.size);
      const content = Buffer.from(await file.arrayBuffer());
      validateWorkFileContent(metadata, content);
      return {
        ...metadata,
        content,
      };
    }),
  );
}
export async function submitWork(
  user: User,
  input: SubmissionInput,
  uploads: WorkUpload[],
  uploadIds: string[] = [],
) {
  if (
    uploads.length + uploadIds.length > MAX_SUBMISSION_FILES ||
    new Set(uploadIds).size !== uploadIds.length ||
    uploads.some(
      (file) => file.size > MAX_FILE_BYTES || file.content.length !== file.size,
    )
  )
    throw new ForbiddenError('The attached files exceed the upload limits.');
  const cloudUploads = await resolveWorkUploads(user, input, uploadIds);
  await db.transaction(async (tx) => {
    const task = await lockedTask(tx, input.taskId);
    assertCanSubmitWork(task, user, input.version);
    if (task.reviewerId && !uploads.length && !cloudUploads.length && !input.links.length)
      throw new ForbiddenError('Attach a file or add a link to your work.');
    if (uploadIds.length) {
      const pending = await tx.select().from(workUploads).where(inArray(workUploads.id, uploadIds)).for('update');
      if (pending.length !== uploadIds.length) throw new ForbiddenError('An attached upload is unavailable.');
      for (const row of pending) assertPendingUpload(row, user, input);
    }
    const previous = await tx
      .select({ version: workSubmissions.version })
      .from(workSubmissions)
      .where(eq(workSubmissions.taskId, task.id))
      .orderBy(desc(workSubmissions.version))
      .limit(1);
    const [submission] = await tx
      .insert(workSubmissions)
      .values({
        taskId: task.id,
        authorId: user.id,
        version: (previous[0]?.version ?? 0) + 1,
        summary: input.summary,
        links: input.links,
      })
      .returning();
    if (!submission) throw new Error('Submission insert returned no row.');
    if (uploads.length || cloudUploads.length)
      await tx
        .insert(workFiles)
        .values(
          [
            ...uploads.map((file) => ({ ...file, blobPath: null, submissionId: submission.id })),
            ...cloudUploads.map((file) => ({
              name: file.name, size: file.size, contentType: file.contentType,
              content: null, blobPath: file.blobPath, submissionId: submission.id,
            })),
          ],
        );
    if (uploadIds.length) await tx.update(workUploads).set({ claimedAt: new Date() }).where(inArray(workUploads.id, uploadIds));
    await tx
      .update(workTasks)
      .set({
        status: task.reviewerId ? 'submitted' : 'completed',
        version: task.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(workTasks.id, task.id));
    await tx.insert(workEvents).values({
      taskId: task.id,
      actorId: user.id,
      message: task.reviewerId ? `Work submitted · version ${submission.version}.` : `Owner recorded completion without review · version ${submission.version}.`,
    });
    await notify(
      tx,
      user.id,
      task.id,
      [task.reviewerId, task.assignerId, ...task.viewerIds],
      `${task.reviewerId ? 'Ready for review' : 'Completed by owner'}: ${task.title}`,
    );
  });
}
export async function reviewWork(user: User, input: ReviewInput) {
  await db.transaction(async (tx) => {
    const task = await lockedTask(tx, input.taskId);
    if (task.reviewerId !== user.id)
      throw new ForbiddenError(
        'Only the named reviewer can decide this submission.',
      );
    assertVersion(task, input.version);
    if (task.status !== 'submitted')
      throw new ForbiddenError('This task is not awaiting review.');
    const [submission] = await tx
      .select()
      .from(workSubmissions)
      .where(eq(workSubmissions.taskId, task.id))
      .orderBy(desc(workSubmissions.version))
      .limit(1);
    if (!submission || submission.decision)
      throw new ForbiddenError('This submission has already been reviewed.');
    await tx
      .update(workSubmissions)
      .set({
        decision: input.decision,
        feedback: input.feedback,
        reviewedBy: user.id,
        reviewedAt: new Date(),
      })
      .where(eq(workSubmissions.id, submission.id));
    await tx
      .update(workTasks)
      .set({
        status:
          input.decision === 'accepted' ? 'completed' : 'changes_requested',
        version: task.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(workTasks.id, task.id));
    await tx.insert(workEvents).values({
      taskId: task.id,
      actorId: user.id,
      message:
        input.decision === 'accepted'
          ? 'Submission accepted. Task completed.'
          : 'Changes requested on the latest submission.',
    });
    await notify(
      tx,
      user.id,
      task.id,
      [task.ownerId, task.assignerId, ...task.viewerIds],
      `${input.decision === 'accepted' ? 'Accepted' : 'Changes requested'}: ${task.title}`,
    );
  });
}
export async function updateWorkProgress(user: User, input: ProgressInput) {
  const access = await getWorkspaceAccess(user);
  await db.transaction(async (tx) => {
    const task = await lockedTask(tx, input.taskId);
    const allowed =
      input.status === 'cancelled'
        ? access.isHead ||
          task.assignerId === user.id ||
          canDelegate(access, task.programmeId)
        : task.ownerId === user.id;
    if (!allowed) throw new ForbiddenError();
    assertVersion(task, input.version);
    if (['submitted', 'completed', 'cancelled'].includes(task.status))
      throw new ForbiddenError('This task is under review or closed.');
    await tx
      .update(workTasks)
      .set({
        status: input.status,
        version: task.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(workTasks.id, task.id));
    const message = `${input.status === 'blocked' ? 'Blocked' : input.status === 'cancelled' ? 'Cancelled' : 'Work started'}${input.note ? `: ${input.note}` : '.'}`;
    await tx
      .insert(workEvents)
      .values({ taskId: task.id, actorId: user.id, message });
    await notify(
      tx,
      user.id,
      task.id,
      [task.ownerId, task.assignerId, task.reviewerId, ...task.viewerIds],
      `${message} — ${task.title}`,
    );
  });
}
export async function addWorkComment(
  user: User,
  taskId: string,
  message: string,
) {
  const { task } = await taskFor(user, taskId);
  await db.transaction(async (tx) => {
    await tx.insert(workEvents).values({ taskId, actorId: user.id, message });
    await notify(
      tx,
      user.id,
      taskId,
      [task.ownerId, task.reviewerId, task.assignerId, ...task.viewerIds],
      `New update: ${task.title}`,
    );
  });
}
export async function downloadWorkFile(user: User, fileId: string) {
  const [record] = await db
    .select({ taskId: workSubmissions.taskId })
    .from(workFiles)
    .innerJoin(workSubmissions, eq(workSubmissions.id, workFiles.submissionId))
    .where(eq(workFiles.id, fileId));
  if (!record) throw new NotFoundError();
  await taskFor(user, record.taskId);
  const [file] = await db
    .select()
    .from(workFiles)
    .where(eq(workFiles.id, fileId));
  if (!file) throw new NotFoundError();
  return file;
}
export async function configureWorkspacePerson(
  user: User,
  input: {
    fullName: string;
    email: string;
    role: WorkspaceRole;
    access?: 'active' | 'inactive';
    externalEmailApproval?: 'no' | 'yes';
  },
) {
  const access = await getWorkspaceAccess(user);
  if (!access.canManagePeople) throw new ForbiddenError();
  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(users)
      .where(eq(users.email, input.email));
    if (!access.canConfigure && (existing || !['intern', 'student'].includes(input.role) || input.access === 'inactive'))
      throw new ForbiddenError('You can add new Interns and Student Members. Ask the Head to change existing accounts or grant other responsibilities.');
    const externalGoogleApproved = !isAllowedBitsEmail(input.email) &&
      (input.externalEmailApproval === 'yes' || existing?.externalGoogleApproved === true);
    if (!isAllowedBitsEmail(input.email) && !externalGoogleApproved)
      throw new ForbiddenError('Use an official BITS email address or explicitly approve this exact external Google account.');
    if (
      existing &&
      input.access === 'inactive' &&
      (existing.id === user.id || existing.role === 'super_admin')
    )
      throw new ForbiddenError(
        'You cannot disable your own account or a technical administrator.',
      );
    if (
      existing?.id === user.id &&
      access.role === 'head' &&
      input.role !== 'head'
    )
      throw new ForbiddenError(
        'Another administrator must change your Head responsibility.',
      );
    const person =
      existing ??
      (
        await tx
          .insert(users)
          .values({
            fullName: input.fullName,
            email: input.email,
            role: 'member',
          })
          .returning()
      )[0];
    if (!person) throw new Error('Account insert returned no row.');
    await tx
      .update(users)
      .set({
        fullName: input.fullName,
        isActive: input.access !== 'inactive',
        externalGoogleApproved,
        campus: campusForEmail(input.email),
        updatedAt: new Date(),
      })
      .where(eq(users.id, person.id));
    await tx
      .insert(workspaceProfiles)
      .values({ userId: person.id, role: input.role })
      .onConflictDoUpdate({
        target: workspaceProfiles.userId,
        set: { role: input.role, updatedAt: new Date() },
      });
    await tx.insert(workEvents).values({
      actorId: user.id,
      message: `Workspace responsibility set to ${input.role} for ${person.fullName}.`,
    });
    if (externalGoogleApproved && !existing?.externalGoogleApproved)
      await tx.insert(workEvents).values({ actorId: user.id, message: `External Google sign-in explicitly approved for ${input.email}.` });
  });
}
export async function createProgramme(
  user: User,
  input: { name: string; code: string; description: string },
) {
  if (!(await getWorkspaceAccess(user)).canCreateProgrammes)
    throw new ForbiddenError('Your KRITI responsibility does not allow programme creation.');
  await db.transaction(async (tx) => {
    const [record] = await tx.insert(programmes)
      .values({ ...input, code: input.code.toUpperCase() }).onConflictDoNothing().returning();
    if (!record) throw new ForbiddenError('That programme code is already in use.');
    await tx.insert(programmeMembers).values({ programmeId: record.id, userId: user.id, role: 'lead' });
  });
}
export async function configureProgrammeMember(
  user: User,
  input: {
    programmeId: string;
    userId: string;
    role: typeof programmeMembers.$inferSelect.role;
  },
) {
  const access = await getWorkspaceAccess(user);
  if (!access.canConfigure && !canDelegate(access, input.programmeId))
    throw new ForbiddenError();
  const [person] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, input.userId), eq(users.isActive, true)));
  const [programme] = await db
    .select()
    .from(programmes)
    .where(
      and(eq(programmes.id, input.programmeId), eq(programmes.isActive, true)),
    );
  if (!person || !programme)
    throw new ForbiddenError('Choose an active person and programme.');
  await db.transaction(async (tx) => {
    await tx
      .insert(programmeMembers)
      .values(input)
      .onConflictDoUpdate({
        target: [programmeMembers.programmeId, programmeMembers.userId],
        set: { role: input.role, updatedAt: new Date() },
      });
    await tx.insert(workEvents).values({
      actorId: user.id,
      message: `${person.fullName} assigned as ${input.role} in ${programme.name}.`,
    });
  });
}
export async function listMemberships(user: User) {
  const accessible = await listProgrammes(user);
  if (!accessible.length) return [];
  return db
    .select()
    .from(programmeMembers)
    .where(
      inArray(
        programmeMembers.programmeId,
        accessible.map((programme) => programme.id),
      ),
    );
}
export async function listWorkNotifications(user: User) {
  const access = await getWorkspaceAccess(user);
  return db
    .select()
    .from(workNotifications)
    .where(
      and(
        eq(workNotifications.userId, user.id),
        isNull(workNotifications.readAt),
        inArray(workNotifications.taskId, db.select({ id: workTasks.id }).from(workTasks).where(taskScope(user, access))),
      ),
    )
    .orderBy(desc(workNotifications.createdAt))
    .limit(20);
}
export async function markWorkNotificationsRead(user: User) {
  await db
    .update(workNotifications)
    .set({ readAt: new Date() })
    .where(eq(workNotifications.userId, user.id));
}
