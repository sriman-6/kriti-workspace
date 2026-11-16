import 'server-only';
import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, inArray, isNull, lt, gt } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  programmes,
  programmeMembers,
  trackerSheets,
  trackerRows,
  trackerEvents,
  trackerUploads,
  users,
  workEvents,
  type User,
} from '@/lib/db/schema';
import {
  getWorkspaceAccess,
  canDelegate,
  listProgrammes,
  listWork,
  getWorkLibrary,
} from './workspace';
import { ForbiddenError, NotFoundError } from '@/lib/errors';
import {
  trackerRowInput,
  trackerSettingsInput,
  trackerColumnInput,
  trackerDeleteInput,
  type TrackerRowInput,
} from '@/lib/schemas/tracker';
import {
  ROW_STATUSES,
  validDate,
  validTrackerLink,
  type TrackerColumn,
} from '@/lib/tracker';
import { describeWorkFile, validateWorkFileContent } from '@/lib/work-files';
import { readWorkBlob, deleteWorkBlob } from '@/lib/storage/work-blob';

type Connection = Pick<typeof db, 'select' | 'insert' | 'update' | 'delete'>;
export async function programmeFor(
  user: User,
  id: string,
  connection: Connection = db,
) {
  const access = await getWorkspaceAccess(user);
  const [programme] = await connection
    .select()
    .from(programmes)
    .where(and(eq(programmes.id, id), eq(programmes.isActive, true)));
  if (
    !programme ||
    (!access.canConfigure &&
      !access.memberships.some((member) => member.programmeId === id))
  )
    throw new NotFoundError('That tracker is unavailable.');
  return {
    programme,
    access,
    canManage: access.canConfigure || canDelegate(access, id),
  };
}
async function sheetFor(
  connection: Connection,
  programmeId: string,
  id?: string | null,
) {
  if (!id) return null;
  const [sheet] = await connection
    .select()
    .from(trackerSheets)
    .where(
      and(eq(trackerSheets.id, id), eq(trackerSheets.programmeId, programmeId)),
    );
  if (!sheet) throw new NotFoundError('That related tracker is unavailable.');
  return sheet;
}
export async function getMasterTracker(user: User) {
  const [items, work] = await Promise.all([
    listProgrammes(user),
    listWork(user),
  ]);
  const ids = items.map((item) => item.id);
  const [members, rows] = ids.length
    ? await Promise.all([
        db
          .select({
            programmeId: programmeMembers.programmeId,
            userId: users.id,
            name: users.fullName,
            role: programmeMembers.role,
          })
          .from(programmeMembers)
          .innerJoin(users, eq(users.id, programmeMembers.userId))
          .where(
            and(
              inArray(programmeMembers.programmeId, ids),
              eq(users.isActive, true),
            ),
          ),
        db
          .select({
            programmeId: trackerRows.programmeId,
            updatedAt: trackerRows.updatedAt,
          })
          .from(trackerRows)
          .where(
            and(
              inArray(trackerRows.programmeId, ids),
              eq(trackerRows.isArchived, false),
            ),
          ),
      ])
    : [[], []];
  return items.map((item) => ({
    id: item.id,
    name: item.name,
    kind: item.kind,
    stage: item.stage,
    leads: members
      .filter(
        (person) =>
          person.programmeId === item.id &&
          ['lead', 'manager'].includes(person.role),
      )
      .map((person) => person.name)
      .join(', '),
    members: members.filter((person) => person.programmeId === item.id).length,
    openWork: work.filter(
      (task) =>
        task.programmeId === item.id &&
        !['completed', 'cancelled'].includes(task.status),
    ).length,
    updatedAt: new Date(
      Math.max(
        item.updatedAt.getTime(),
        ...rows
          .filter((row) => row.programmeId === item.id)
          .map((row) => row.updatedAt.getTime()),
        ...work
          .filter((task) => task.programmeId === item.id)
          .map((task) => task.updatedAt.getTime()),
      ),
    ).toISOString(),
  }));
}
export async function getTracker(
  user: User,
  id: string,
  sheetId?: string | null,
) {
  const { programme, canManage } = await programmeFor(user, id);
  const [sheet, members, sheets, rows, work] = await Promise.all([
    sheetFor(db, id, sheetId),
    db
      .select({
        id: users.id,
        fullName: users.fullName,
        role: programmeMembers.role,
      })
      .from(programmeMembers)
      .innerJoin(users, eq(users.id, programmeMembers.userId))
      .where(
        and(eq(programmeMembers.programmeId, id), eq(users.isActive, true)),
      )
      .orderBy(asc(users.fullName)),
    db
      .select({
        id: trackerSheets.id,
        name: trackerSheets.name,
        parentId: trackerSheets.parentId,
      })
      .from(trackerSheets)
      .where(eq(trackerSheets.programmeId, id))
      .orderBy(asc(trackerSheets.name)),
    db
      .select()
      .from(trackerRows)
      .where(
        and(
          eq(trackerRows.programmeId, id),
          sheetId
            ? eq(trackerRows.sheetId, sheetId)
            : isNull(trackerRows.sheetId),
        ),
      )
      .orderBy(desc(trackerRows.updatedAt)),
    listWork(user),
  ]);
  const uploads = rows.length
    ? await db
        .select({
          id: trackerUploads.id,
          rowId: trackerUploads.rowId,
          name: trackerUploads.name,
          size: trackerUploads.size,
        })
        .from(trackerUploads)
        .where(
          inArray(
            trackerUploads.rowId,
            rows.map((row) => row.id),
          ),
        )
        .orderBy(asc(trackerUploads.expiresAt))
    : [];
  return {
    programme: {
      id,
      name: programme.name,
      description: programme.description ?? '',
      stage: programme.stage,
      kind: programme.kind,
      version: programme.version,
    },
    sheet: sheet
      ? {
          id: sheet.id,
          name: sheet.name,
          parentId: sheet.parentId,
          version: sheet.version,
        }
      : null,
    columns: sheet?.columns ?? programme.trackerColumns,
    canManage,
    members,
    sheets,
    rows: rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      editable:
        canManage || row.authorId === user.id || row.ownerId === user.id,
      files: uploads.filter((file) => file.rowId === row.id),
    })),
    tasks: work
      .filter(
        (task) =>
          task.programmeId === id &&
          (task.trackerSheetId ?? null) === (sheetId ?? null),
      )
      .map((task) => ({
        id: task.id,
        title: task.title,
        ownerId: task.ownerId,
        ownerName: task.ownerName,
        status: task.status,
        dueOn: task.dueOn,
        updatedAt: task.updatedAt.toISOString(),
      })),
  };
}
export type TrackerDetail = Awaited<ReturnType<typeof getTracker>>;
export type TrackerRecord = TrackerDetail['rows'][number];
function assertRowEdit(
  user: User,
  row: typeof trackerRows.$inferSelect,
  canManage: boolean,
) {
  if (!canManage && row.authorId !== user.id && row.ownerId !== user.id)
    throw new ForbiddenError('You can edit your own or assigned rows.');
}
function validateValues(
  columns: TrackerColumn[],
  values: Record<string, string>,
) {
  for (const [key, value] of Object.entries(values)) {
    const column = columns.find((column) => column.id === key);
    if (!column)
      throw new ForbiddenError('A column changed. Refresh before saving.');
    if (!value) continue;
    if (
      (column.type === 'date' && !validDate(value)) ||
      (column.type === 'number' &&
        (!value.trim() || !Number.isFinite(Number(value)))) ||
      (column.type === 'url' && !validTrackerLink(value))
    )
      throw new ForbiddenError(`Check the value in ${column.label}.`);
  }
}
export async function saveTrackerRow(
  user: User,
  programmeId: string,
  raw: TrackerRowInput,
) {
  const input = trackerRowInput.parse(raw);
  const scope = await programmeFor(user, programmeId);
  return db.transaction(async (tx) => {
    const [programme] = await tx
      .select()
      .from(programmes)
      .where(eq(programmes.id, programmeId))
      .for('update');
    const sheet = await sheetFor(tx, programmeId, input.sheetId);
    validateValues(sheet?.columns ?? programme!.trackerColumns, input.values);
    const [existing] = await tx
      .select()
      .from(trackerRows)
      .where(eq(trackerRows.id, input.id))
      .for('update');
    if (existing) {
      if (
        existing.programmeId !== programmeId ||
        existing.sheetId !== (input.sheetId ?? null)
      )
        throw new NotFoundError();
      assertRowEdit(user, existing, scope.canManage);
      if (input.version === undefined) {
        const same =
          existing.authorId === user.id &&
          existing.title === input.title &&
          existing.notes === input.notes &&
          existing.kind === input.kind &&
          existing.status === input.status &&
          existing.ownerId === (input.ownerId ?? null) &&
          existing.eventOn === (input.eventOn || null) &&
          JSON.stringify(existing.links) === JSON.stringify(input.links) &&
          JSON.stringify(Object.entries(existing.values).sort()) ===
            JSON.stringify(Object.entries(input.values).sort());
        if (same) {
          const claimed = input.uploadIds.length
            ? await tx
                .select()
                .from(trackerUploads)
                .where(inArray(trackerUploads.id, input.uploadIds))
            : [];
          if (
            claimed.length === input.uploadIds.length &&
            claimed.every(
              (file) => file.rowId === existing.id && file.ownerId === user.id,
            )
          )
            return existing.id;
        }
        throw new ForbiddenError('Refresh before saving this row.');
      }
      if (existing.version !== input.version)
        throw new ForbiddenError(
          'This row changed. Reopen it to see the latest version. Your draft is still here.',
        );
    }
    if (input.kind === 'sheet' && !existing?.linkedSheetId)
      throw new ForbiddenError(
        'Use Add related tracker to create a linked tracker.',
      );
    if (existing?.linkedSheetId && input.kind !== 'sheet')
      throw new ForbiddenError('Keep this row linked to its related tracker.');
    if (input.ownerId) {
      const [member] = await tx
        .select()
        .from(programmeMembers)
        .innerJoin(users, eq(users.id, programmeMembers.userId))
        .where(
          and(
            eq(programmeMembers.programmeId, programmeId),
            eq(programmeMembers.userId, input.ownerId),
            eq(users.isActive, true),
          ),
        );
      if (!member)
        throw new ForbiddenError('Choose a current programme member.');
    }
    if (
      !scope.canManage &&
      input.ownerId &&
      input.ownerId !== user.id &&
      input.ownerId !== existing?.ownerId
    )
      throw new ForbiddenError(
        'A programme lead or manager assigns rows to other people.',
      );
    if (new Set(input.uploadIds).size !== input.uploadIds.length)
      throw new ForbiddenError('Choose each file once.');
    const uploads = input.uploadIds.length
      ? await tx
          .select()
          .from(trackerUploads)
          .where(inArray(trackerUploads.id, input.uploadIds))
          .for('update')
      : [];
    if (
      uploads.length !== input.uploadIds.length ||
      uploads.some(
        (file) =>
          file.programmeId !== programmeId ||
          file.ownerId !== user.id ||
          file.rowId ||
          file.expiresAt <= new Date(),
      )
    )
      throw new ForbiddenError(
        'An attachment expired. Remove it and choose it again.',
      );
    for (const file of uploads)
      validateWorkFileContent(
        file,
        file.blobPath
          ? await readWorkBlob(file.blobPath, file.size)
          : Buffer.from(file.content ?? '', 'base64'),
      );
    const fields = {
      title: input.title,
      kind: input.kind,
      status: input.status,
      ownerId: input.ownerId ?? null,
      eventOn: input.eventOn || null,
      notes: input.notes,
      links: input.links,
      values: input.values,
    };
    const [row] = existing
      ? await tx
          .update(trackerRows)
          .set({
            ...fields,
            version: existing.version + 1,
            updatedAt: new Date(),
          })
          .where(eq(trackerRows.id, existing.id))
          .returning()
      : await tx
          .insert(trackerRows)
          .values({
            ...fields,
            id: input.id,
            programmeId,
            sheetId: input.sheetId ?? null,
            authorId: user.id,
          })
          .returning();
    if (existing?.linkedSheetId)
      await tx
        .update(trackerSheets)
        .set({ name: input.title, updatedAt: new Date() })
        .where(eq(trackerSheets.id, existing.linkedSheetId));
    if (uploads.length)
      await tx
        .update(trackerUploads)
        .set({ rowId: row!.id })
        .where(inArray(trackerUploads.id, input.uploadIds));
    await tx.insert(trackerEvents).values({
      programmeId,
      rowId: row!.id,
      actorId: user.id,
      message: existing
        ? existing.status !== row!.status
          ? `${row!.title} · ${ROW_STATUSES[existing.status as keyof typeof ROW_STATUSES] ?? existing.status} → ${ROW_STATUSES[row!.status as keyof typeof ROW_STATUSES] ?? row!.status}`
          : `Updated ${row!.title}`
        : `Added ${row!.title}`,
      snapshot: {
        ...row!,
        columnLabels: Object.fromEntries(
          (sheet?.columns ?? programme!.trackerColumns).map((column) => [
            column.id,
            column.label,
          ]),
        ),
        uploadIds: uploads.map((file) => file.id),
      },
    });
    await tx
      .update(programmes)
      .set({ updatedAt: new Date() })
      .where(eq(programmes.id, programmeId));
    return row!.id;
  });
}
export async function archiveTrackerRow(
  user: User,
  programmeId: string,
  id: string,
  version: number,
  archive: boolean,
) {
  const scope = await programmeFor(user, programmeId);
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(trackerRows)
      .where(
        and(eq(trackerRows.id, id), eq(trackerRows.programmeId, programmeId)),
      )
      .for('update');
    if (!row) throw new NotFoundError();
    assertRowEdit(user, row, scope.canManage);
    if (row.version !== version)
      throw new ForbiddenError(
        'This row changed. Refresh before trying again.',
      );
    await tx
      .update(trackerRows)
      .set({
        isArchived: archive,
        version: row.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(trackerRows.id, id));
    await tx.insert(trackerEvents).values({
      programmeId,
      rowId: id,
      actorId: user.id,
      message: `${archive ? 'Archived' : 'Restored'} ${row.title}`,
      snapshot: row,
    });
  });
}
export async function createTrackerSheet(
  user: User,
  programmeId: string,
  name: string,
  parentId?: string | null,
) {
  const scope = await programmeFor(user, programmeId);
  if (!scope.canManage)
    throw new ForbiddenError(
      'Programme leads and managers add related trackers.',
    );
  if (name.trim().length < 1 || name.length > 120)
    throw new ForbiddenError('Use a tracker name of up to 120 characters.');
  return db.transaction(async (tx) => {
    await sheetFor(tx, programmeId, parentId);
    const [sheet] = await tx
      .insert(trackerSheets)
      .values({ programmeId, parentId: parentId ?? null, name: name.trim() })
      .returning();
    const [row] = await tx
      .insert(trackerRows)
      .values({
        programmeId,
        sheetId: parentId ?? null,
        linkedSheetId: sheet!.id,
        authorId: user.id,
        title: name.trim(),
        kind: 'sheet',
      })
      .returning();
    await tx.insert(trackerEvents).values({
      programmeId,
      rowId: row!.id,
      actorId: user.id,
      message: `Created related tracker ${name.trim()}`,
    });
    return sheet!.id;
  });
}
export async function addTrackerColumn(
  user: User,
  programmeId: string,
  sheetId: string | null,
  raw: { label: string; type: 'text' | 'date' | 'number' | 'url' },
  version: number,
) {
  const input = trackerColumnInput.parse(raw);
  const scope = await programmeFor(user, programmeId);
  if (!scope.canManage)
    throw new ForbiddenError('Programme leads and managers manage columns.');
  await db.transaction(async (tx) => {
    const [programme] = await tx
      .select()
      .from(programmes)
      .where(eq(programmes.id, programmeId))
      .for('update');
    const sheet = sheetId
      ? (
          await tx
            .select()
            .from(trackerSheets)
            .where(
              and(
                eq(trackerSheets.id, sheetId),
                eq(trackerSheets.programmeId, programmeId),
              ),
            )
            .for('update')
        )[0]
      : null;
    if (sheetId && !sheet) throw new NotFoundError();
    const columns = sheet?.columns ?? programme!.trackerColumns;
    if ((sheet?.version ?? programme!.version) !== version)
      throw new ForbiddenError(
        'The tracker changed. Refresh before adding a column.',
      );
    if (
      columns.length >= 12 ||
      columns.some(
        (column) => column.label.toLowerCase() === input.label.toLowerCase(),
      )
    )
      throw new ForbiddenError(
        'Use a unique column name. You can add up to 12 custom columns.',
      );
    const updated = [...columns, { ...input, id: randomUUID() }];
    if (sheet)
      await tx
        .update(trackerSheets)
        .set({ columns: updated, version: sheet.version + 1 })
        .where(eq(trackerSheets.id, sheet.id));
    else
      await tx
        .update(programmes)
        .set({ trackerColumns: updated, version: programme!.version + 1 })
        .where(eq(programmes.id, programmeId));
    await tx.insert(trackerEvents).values({
      programmeId,
      actorId: user.id,
      message: `Added column ${input.label}${sheet ? ` to ${sheet.name}` : ''}`,
    });
  });
}
export async function updateTracker(
  user: User,
  id: string,
  raw: Parameters<typeof trackerSettingsInput.parse>[0],
) {
  const input = trackerSettingsInput.parse(raw);
  const scope = await programmeFor(user, id);
  if (!scope.canManage)
    throw new ForbiddenError(
      'Programme leads and managers edit programme details.',
    );
  await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(programmes)
      .set({
        name: input.name,
        description: input.description,
        stage: input.stage,
        version: input.version + 1,
        updatedAt: new Date(),
      })
      .where(and(eq(programmes.id, id), eq(programmes.version, input.version)))
      .returning();
    if (!updated)
      throw new ForbiddenError(
        'These details changed. Reopen settings before saving.',
      );
    await tx.insert(trackerEvents).values({
      programmeId: id,
      actorId: user.id,
      message: `Updated programme details · ${input.stage}`,
      snapshot: {
        name: input.name,
        description: input.description,
        stage: input.stage,
      },
    });
  });
}
export async function deleteTracker(
  user: User,
  id: string,
  raw: Parameters<typeof trackerDeleteInput.parse>[0],
) {
  const input = trackerDeleteInput.parse(raw);
  const scope = await programmeFor(user, id);
  if (!scope.canManage)
    throw new ForbiddenError('Only people who manage this tracker can delete it.');
  await db.transaction(async (tx) => {
    const [deleted] = await tx.update(programmes)
      .set({ isActive: false, version: input.version + 1, updatedAt: new Date() })
      .where(and(eq(programmes.id, id), eq(programmes.isActive, true), eq(programmes.version, input.version)))
      .returning();
    if (!deleted)
      throw new ForbiddenError('This tracker changed. Cancel deletion and review its latest details.');
    await tx.insert(trackerEvents).values({
      programmeId: id,
      actorId: user.id,
      message: `Deleted tracker ${deleted.name}`,
      snapshot: { name: deleted.name, stage: deleted.stage, isActive: false },
    });
  });
}
export async function getTrackerHistory(
  user: User,
  programmeId: string,
  rowId?: string,
  page = 0,
) {
  await programmeFor(user, programmeId);
  if (rowId) {
    const [row] = await db
      .select()
      .from(trackerRows)
      .where(
        and(
          eq(trackerRows.id, rowId),
          eq(trackerRows.programmeId, programmeId),
        ),
      );
    if (!row) throw new NotFoundError();
  }
  const limit = (page + 1) * 50 + 1;
  const tasks = rowId
    ? []
    : (await listWork(user)).filter((task) => task.programmeId === programmeId);
  const [rows, taskEvents] = await Promise.all([
    db
      .select({
        id: trackerEvents.id,
        rowId: trackerEvents.rowId,
        actor: users.fullName,
        message: trackerEvents.message,
        snapshot: trackerEvents.snapshot,
        createdAt: trackerEvents.createdAt,
      })
      .from(trackerEvents)
      .innerJoin(users, eq(users.id, trackerEvents.actorId))
      .where(
        and(
          eq(trackerEvents.programmeId, programmeId),
          rowId ? eq(trackerEvents.rowId, rowId) : undefined,
        ),
      )
      .orderBy(desc(trackerEvents.createdAt), desc(trackerEvents.id))
      .limit(limit),
    tasks.length
      ? db
          .select({
            id: workEvents.id,
            actor: users.fullName,
            message: workEvents.message,
            createdAt: workEvents.createdAt,
          })
          .from(workEvents)
          .innerJoin(users, eq(users.id, workEvents.actorId))
          .where(
            inArray(
              workEvents.taskId,
              tasks.map((task) => task.id),
            ),
          )
          .orderBy(desc(workEvents.createdAt), desc(workEvents.id))
          .limit(limit)
      : [],
  ]);
  const combined = [
    ...rows,
    ...taskEvents.map((event) => ({ ...event, rowId: null, snapshot: null })),
  ].sort(
    (a, b) =>
      b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id),
  );
  return {
    items: combined
      .slice(page * 50, page * 50 + 50)
      .map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
    hasMore: combined.length > page * 50 + 50,
  };
}
export async function getTrackerResources(user: User, programmeId: string) {
  await programmeFor(user, programmeId);
  const [work, library, rows, uploads] = await Promise.all([
    listWork(user),
    getWorkLibrary(user),
    db
      .select()
      .from(trackerRows)
      .where(
        and(
          eq(trackerRows.programmeId, programmeId),
          eq(trackerRows.isArchived, false),
        ),
      ),
    db
      .select({
        id: trackerUploads.id,
        rowId: trackerUploads.rowId,
        name: trackerUploads.name,
        size: trackerUploads.size,
      })
      .from(trackerUploads)
      .where(and(eq(trackerUploads.programmeId, programmeId))),
  ]);
  const ids = new Set(
    work
      .filter((task) => task.programmeId === programmeId)
      .map((task) => task.id),
  );
  return [
    ...rows
      .filter(
        (row) =>
          row.links.length || uploads.some((file) => file.rowId === row.id),
      )
      .map((row) => ({
        id: row.id,
        title: row.title,
        href: `/programmes/${programmeId}${row.sheetId ? `?sheet=${row.sheetId}` : ''}`,
        links: row.links,
        files: uploads
          .filter((file) => file.rowId === row.id)
          .map((file) => ({
            id: file.id,
            name: file.name,
            href: `/api/trackers/files/${file.id}`,
          })),
      })),
    ...library
      .filter((row) => ids.has(row.submission.taskId))
      .map((row) => ({
        id: row.submission.id,
        title: `${row.taskTitle} · Version ${row.submission.version}`,
        href: `/work/${row.submission.taskId}`,
        links: row.submission.links,
        files: row.files.map((file) => ({
          id: file.id,
          name: file.name,
          href: `/api/work/files/${file.id}`,
        })),
      })),
  ];
}
export async function reserveTrackerUploads(
  user: User,
  programmeId: string,
  files: { name: string; size: number }[],
  local: File[] = [],
) {
  await programmeFor(user, programmeId);
  if (!files.length || files.length > 3)
    throw new ForbiddenError('Choose up to three files.');
  const pending = await db
    .select({ id: trackerUploads.id })
    .from(trackerUploads)
    .where(
      and(
        eq(trackerUploads.ownerId, user.id),
        isNull(trackerUploads.rowId),
        gt(trackerUploads.expiresAt, new Date()),
      ),
    );
  if (pending.length > 30)
    throw new ForbiddenError('Too many pending uploads. Try again later.');
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
      programmeId,
      ownerId: user.id,
      content,
      blobPath: local.length
        ? null
        : `trackers/${programmeId}/${id}.${metadata.name.split('.').pop()!.toLowerCase()}`,
      expiresAt: new Date(Date.now() + 3600000),
    });
  }
  return (await db.insert(trackerUploads).values(values).returning()).map(
    ({ id, blobPath, contentType }) => ({ id, blobPath, contentType }),
  );
}
export async function authorizeTrackerUpload(
  user: User,
  id: string,
  pathname: string,
) {
  const [file] = await db
    .select()
    .from(trackerUploads)
    .where(eq(trackerUploads.id, id));
  if (
    !file ||
    file.ownerId !== user.id ||
    file.blobPath !== pathname ||
    file.rowId ||
    file.expiresAt <= new Date()
  )
    throw new ForbiddenError('This upload is unavailable.');
  await programmeFor(user, file.programmeId);
  return {
    allowedContentTypes: [file.contentType],
    maximumSizeInBytes: file.size,
    allowOverwrite: false,
    addRandomSuffix: false,
    validUntil: Date.now() + 300000,
  };
}
export async function downloadTrackerFile(user: User, id: string) {
  const [file] = await db
    .select()
    .from(trackerUploads)
    .where(eq(trackerUploads.id, id));
  if (!file?.rowId) throw new NotFoundError();
  await programmeFor(user, file.programmeId);
  return file;
}
export async function cleanupTrackerUploads() {
  const expired = await db
    .select()
    .from(trackerUploads)
    .where(
      and(
        isNull(trackerUploads.rowId),
        lt(trackerUploads.expiresAt, new Date(Date.now() - 86400000)),
      ),
    )
    .limit(100);
  for (const file of expired) {
    if (file.blobPath) await deleteWorkBlob(file.blobPath);
    await db
      .delete(trackerUploads)
      .where(and(eq(trackerUploads.id, file.id), isNull(trackerUploads.rowId)));
  }
  return expired.length;
}
