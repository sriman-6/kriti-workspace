import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { createTestDatabase, type TestDatabase } from './helpers/database';
import { programmeSchema } from '@/lib/schemas/work';
import { trackerSettingsInput } from '@/lib/schemas/tracker';
import { PROGRAMME_NAME_MAX_LENGTH } from '@/lib/tracker';
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
const {
  users,
  workspaceProfiles,
  programmeMembers,
  ideas,
  ideaMembers,
  trackerRows,
  trackerUploads,
  programmes,
  trackerSheets,
  trackerEvents,
  workTasks,
} = await import('@/lib/db/schema');
const {
  getTracker,
  getMasterTracker,
  saveTrackerRow,
  createTrackerSheet,
  addTrackerColumn,
  archiveTrackerRow,
  updateTracker,
  deleteTracker,
  getTrackerHistory,
  getTrackerResources,
  reserveTrackerUploads,
  authorizeTrackerUpload,
  downloadTrackerFile,
  cleanupTrackerUploads,
} = await import('@/lib/services/tracker');
const { createWork, createProgramme, editWork, getWorkspaceAccess, getWorkDetail } =
  await import('@/lib/services/workspace');
const { saveIdea, getIdea, listIdeas, listIdeaPeople } = await import(
  '@/lib/services/collaboration'
);
const { WORKSPACE_ROLES, canUseIdeas } = await import('@/lib/workspace');
type User = typeof users.$inferSelect;
let cleanup: () => Promise<void>;
let people: Record<string, User>;
let id: string, otherId: string;
const pdf = Buffer.from('%PDF-1.4\ntracker report');
beforeAll(async () => {
  const fixture = await createTestDatabase();
  holder.db = fixture.db;
  cleanup = fixture.cleanup;
  const accounts = await holder.db
    .insert(users)
    .values(
      [...WORKSPACE_ROLES, 'technical_admin'].map((role) => ({
        email: `${role}@pilani.bits-pilani.ac.in`,
        fullName: role,
        role:
          role === 'technical_admin'
            ? ('super_admin' as const)
            : ('member' as const),
      })),
    )
    .returning();
  people = Object.fromEntries(accounts.map((user) => [user.fullName, user]));
  await holder.db
    .insert(workspaceProfiles)
    .values(
      accounts.map((user) => ({
        userId: user.id,
        role:
          user.fullName === 'technical_admin'
            ? ('intern' as const)
            : (user.fullName as (typeof WORKSPACE_ROLES)[number]),
      })),
    );
  id = await createProgramme(people.head!, {
    name: 'Programme A',
    code: 'TRACK-A',
    description: 'A real tracker container',
  });
  otherId = await createProgramme(people.head!, {
    name: 'Programme B',
    code: 'TRACK-B',
    description: '',
  });
  await holder.db.insert(programmeMembers).values([
    { programmeId: id, userId: people.manager!.id, role: 'manager' },
    { programmeId: id, userId: people.intern!.id, role: 'member' },
    { programmeId: id, userId: people.student!.id, role: 'member' },
  ]);
  storage.read.mockResolvedValue(pdf);
  storage.remove.mockResolvedValue(undefined);
});
afterAll(async () => {
  if (cleanup) await cleanup();
});
const row = (extra = {}) => ({
  id: randomUUID(),
  title: 'Field visit record',
  kind: 'activity' as const,
  status: 'planned' as const,
  notes: 'Log the actual activity.',
  links: [],
  values: {},
  uploadIds: [],
  ownerId: people.intern!.id,
  ...extra,
});

describe('master tracker and linked work', () => {
  it('limits deletion to tracker managers, guards stale confirmation and preserves linked work and history', async () => {
    const programmeId = await createProgramme(people.head!, {
      name: 'Tracker to remove', code: 'REMOVE-TRACKER', description: '',
    });
    await holder.db.insert(programmeMembers).values([
      { programmeId, userId: people.manager!.id, role: 'manager' },
      { programmeId, userId: people.intern!.id, role: 'member' },
    ]);
    const sheetId = await createTrackerSheet(people.manager!, programmeId, 'Related records');
    const [upload] = await reserveTrackerUploads(people.intern!, programmeId, [{ name: 'report.pdf', size: pdf.length }]);
    const record = row({ sheetId, uploadIds: [upload!.id] });
    await saveTrackerRow(people.intern!, programmeId, record);
    expect((await downloadTrackerFile(people.intern!, upload!.id)).name).toBe('report.pdf');
    const workId = await createWork(people.intern!, {
      title: 'Assignment kept after tracker deletion', description: '', programmeId, trackerSheetId: sheetId,
      ownerId: people.intern!.id, reviewerId: null, dueOn: null, priority: 'normal',
    });
    const detail = await getTracker(people.manager!, programmeId);
    const deletion = { version: detail.programme.version, confirmation: 'DELETE' };
    await expect(deleteTracker(people.intern!, programmeId, deletion)).rejects.toThrow('manage');
    await expect(deleteTracker(people.program_head!, programmeId, deletion)).rejects.toThrow('unavailable');
    await expect(deleteTracker(people.manager!, programmeId, { ...deletion, confirmation: '' })).rejects.toThrow();
    await expect(deleteTracker(people.manager!, programmeId, { ...deletion, version: detail.programme.version + 1 })).rejects.toThrow('changed');
    expect((await getTracker(people.manager!, programmeId)).programme.id).toBe(programmeId);
    await deleteTracker(people.manager!, programmeId, deletion);
    expect((await getMasterTracker(people.head!)).some((item) => item.id === programmeId)).toBe(false);
    await expect(getTracker(people.head!, programmeId)).rejects.toThrow('unavailable');
    await expect(getTracker(people.manager!, programmeId, sheetId)).rejects.toThrow('unavailable');
    await expect(getTrackerResources(people.head!, programmeId)).rejects.toThrow('unavailable');
    await expect(downloadTrackerFile(people.intern!, upload!.id)).rejects.toThrow();
    expect((await getWorkDetail(people.intern!, workId)).task.id).toBe(workId);
    await editWork(people.intern!, workId, 0, {
      title: 'Retained assignment updated', description: '', programmeId: null, trackerSheetId: null,
      ownerId: people.intern!.id, reviewerId: null, dueOn: null, priority: 'normal',
    });
    expect((await getWorkDetail(people.intern!, workId)).task.title).toBe('Retained assignment updated');
    expect((await holder.db.select().from(programmes).where(eq(programmes.id, programmeId)))[0]?.isActive).toBe(false);
    expect((await holder.db.select().from(trackerRows).where(eq(trackerRows.id, record.id)))).toHaveLength(1);
    expect((await holder.db.select().from(trackerSheets).where(eq(trackerSheets.id, sheetId)))).toHaveLength(1);
    expect((await holder.db.select().from(trackerUploads).where(eq(trackerUploads.id, upload!.id)))).toHaveLength(1);
    expect((await holder.db.select().from(trackerEvents).where(eq(trackerEvents.programmeId, programmeId))).some((event) => event.message === 'Deleted tracker Tracker to remove')).toBe(true);
  });
  it('creates, lists and renames trackers with full research project titles', async () => {
    const name = 'A Dual-Approach Framework for Sustainable Menstrual Hygiene: Reusable Cloth Pads and Coffee-Pulp-Based Biodegradable Absorbents';
    expect(name.length).toBeGreaterThan(120);
    const programmeId = await createProgramme(people.head!, programmeSchema.parse({
      name,
      code: 'FULL-PROJECT-TITLE',
      description: '',
      kind: 'project',
    }));
    expect((await getMasterTracker(people.head!)).find((item) => item.id === programmeId)?.name).toBe(name);
    const detail = await getTracker(people.head!, programmeId);
    expect(detail.programme.name).toBe(name);
    const revisedName = `${name} — Research and Implementation`;
    await updateTracker(people.head!, programmeId, {
      name: revisedName,
      description: '',
      stage: 'planning',
      version: detail.programme.version,
    });
    expect((await getTracker(people.head!, programmeId)).programme.name).toBe(revisedName);
    const tooLong = 'x'.repeat(PROGRAMME_NAME_MAX_LENGTH + 1);
    expect(programmeSchema.safeParse({ name: tooLong, code: 'LONG', description: '' }).success).toBe(false);
    expect(trackerSettingsInput.safeParse({ name: tooLong, description: '', stage: 'planning', version: 0 }).success).toBe(false);
  });
  it('preserves old records and shows existing work as the same task', async () => {
    const taskId = await createWork(people.intern!, {
      title: 'Programme report',
      description: '',
      programmeId: id,
      ownerId: people.intern!.id,
      reviewerId: null,
      dueOn: null,
      priority: 'normal',
    });
    const detail = await getTracker(people.intern!, id);
    expect(detail.programme.stage).toBe('unset');
    expect(detail.tasks.map((task) => task.id)).toContain(taskId);
    expect(detail.rows).toHaveLength(0);
    expect(
      (await getMasterTracker(people.intern!)).find((item) => item.id === id)
        ?.openWork,
    ).toBe(1);
    await expect(getTracker(people.intern!, otherId)).rejects.toThrow();
    await expect(getTracker(people.program_head!, id)).rejects.toThrow();
  });
  it('allows members to record their own activity, validates assignees, and denies unrelated users', async () => {
    const record = row();
    await saveTrackerRow(people.intern!, id, record);
    const saved = (await getTracker(people.intern!, id)).rows.find(
      (item) => item.id === record.id,
    )!;
    expect(saved.editable).toBe(true);
    expect(saved.eventOn).toBeNull();
    await expect(
      saveTrackerRow(people.student!, id, {
        ...record,
        version: 0,
        title: 'Overwrite colleague',
      }),
    ).rejects.toThrow('own or assigned');
    await expect(
      saveTrackerRow(people.intern!, id, row({ ownerId: people.student!.id })),
    ).rejects.toThrow('lead or manager');
    await expect(
      saveTrackerRow(
        people.manager!,
        id,
        row({ ownerId: people.program_head!.id }),
      ),
    ).rejects.toThrow('current programme member');
    await expect(
      saveTrackerRow(people.program_head!, id, row()),
    ).rejects.toThrow();
  });
  it('rejects stale edits, records a dated history and deduplicates exact retries', async () => {
    const record = row({ eventOn: '2026-02-17' });
    await saveTrackerRow(people.intern!, id, record);
    await saveTrackerRow(people.intern!, id, record);
    expect(
      (await getTracker(people.intern!, id)).rows.filter(
        (item) => item.id === record.id,
      ),
    ).toHaveLength(1);
    await saveTrackerRow(people.intern!, id, {
      ...record,
      version: 0,
      status: 'done',
    });
    await expect(
      saveTrackerRow(people.intern!, id, {
        ...record,
        version: 0,
        notes: 'Stale overwrite',
      }),
    ).rejects.toThrow('row changed');
    await expect(
      saveTrackerRow(people.intern!, id, { ...record, status: 'draft' }),
    ).rejects.toThrow();
    const history = await getTrackerHistory(people.intern!, id, record.id);
    expect(history.items).toHaveLength(2);
    expect(history.items[0]?.snapshot?.eventOn).toBe('2026-02-17');
    await expect(
      saveTrackerRow(people.intern!, id, row({ eventOn: '2026-02-31' })),
    ).rejects.toThrow();
    await expect(
      saveTrackerRow(
        people.intern!,
        id,
        row({ links: ['javascript:alert(1)'] }),
      ),
    ).rejects.toThrow();
  });
  it('creates related trackers with linked rows and scopes task placement to the right programme', async () => {
    await expect(
      createTrackerSheet(people.intern!, id, 'Visits'),
    ).rejects.toThrow();
    const sheetId = await createTrackerSheet(people.manager!, id, 'Visits');
    expect(
      (await getTracker(people.intern!, id)).rows.some(
        (item) => item.linkedSheetId === sheetId,
      ),
    ).toBe(true);
    expect((await getTracker(people.intern!, id, sheetId)).sheet?.name).toBe(
      'Visits',
    );
    const taskId = await createWork(people.intern!, {
      title: 'Visit follow-up',
      programmeId: id,
      trackerSheetId: sheetId,
      description: '',
      ownerId: people.intern!.id,
      reviewerId: null,
      dueOn: null,
      priority: 'normal',
    });
    expect(
      (await getTracker(people.intern!, id, sheetId)).tasks.some(
        (task) => task.id === taskId,
      ),
    ).toBe(true);
    expect(
      (await getTracker(people.intern!, id)).tasks.some(
        (task) => task.id === taskId,
      ),
    ).toBe(false);
    await expect(getTracker(people.head!, otherId, sheetId)).rejects.toThrow();
    await expect(
      createWork(people.head!, {
        title: 'Forged sheet placement',
        programmeId: otherId,
        trackerSheetId: sheetId,
        description: '',
        ownerId: people.head!.id,
        reviewerId: null,
        dueOn: null,
        priority: 'normal',
      }),
    ).rejects.toThrow('within this programme');
    await expect(
      saveTrackerRow(people.intern!, id, row({ kind: 'sheet' })),
    ).rejects.toThrow('Add related tracker');
  });
  it('supports custom columns while validating values and protecting schema changes', async () => {
    const detail = await getTracker(people.manager!, id);
    await expect(
      addTrackerColumn(
        people.intern!,
        id,
        null,
        { label: 'Location', type: 'text' },
        detail.programme.version,
      ),
    ).rejects.toThrow();
    await addTrackerColumn(
      people.manager!,
      id,
      null,
      { label: 'Published link', type: 'url' },
      detail.programme.version,
    );
    const changed = await getTracker(people.intern!, id);
    const column = changed.columns[0]!;
    await expect(
      saveTrackerRow(
        people.intern!,
        id,
        row({ values: { [column.id]: 'http://unsafe.example' } }),
      ),
    ).rejects.toThrow('Published link');
    await saveTrackerRow(
      people.intern!,
      id,
      row({ values: { [column.id]: 'https://docs.google.com/document/d/a' } }),
    );
    await expect(
      addTrackerColumn(
        people.manager!,
        id,
        null,
        { label: 'Location', type: 'text' },
        detail.programme.version,
      ),
    ).rejects.toThrow('changed');
    await expect(
      saveTrackerRow(people.intern!, id, row({ values: { unknown: 'value' } })),
    ).rejects.toThrow('column changed');
  });
  it('clears related tracker placement when work is moved to another programme', async () => {
    const sheetId = await createTrackerSheet(people.head!, id, 'Moving work');
    const taskId = await createWork(people.head!, {
      title: 'Move this assignment',
      programmeId: id,
      trackerSheetId: sheetId,
      description: '',
      ownerId: people.head!.id,
      reviewerId: null,
      dueOn: null,
      priority: 'normal',
    });
    await editWork(people.head!, taskId, 0, {
      title: 'Moved assignment',
      programmeId: otherId,
      description: '',
      ownerId: people.head!.id,
      reviewerId: null,
      dueOn: null,
      priority: 'normal',
    });
    expect(
      (await getTracker(people.head!, otherId)).tasks.some(
        (task) => task.id === taskId,
      ),
    ).toBe(true);
    const [saved] = await holder.db
      .select()
      .from(workTasks)
      .where(eq(workTasks.id, taskId));
    expect(saved?.trackerSheetId).toBeNull();
  });
  it('retains archived rows and only reveals work history within task access', async () => {
    const record = row();
    await saveTrackerRow(people.intern!, id, record);
    await archiveTrackerRow(people.intern!, id, record.id, 0, true);
    expect(
      (await getTracker(people.intern!, id)).rows.find(
        (item) => item.id === record.id,
      )?.isArchived,
    ).toBe(true);
    await archiveTrackerRow(people.intern!, id, record.id, 1, false);
    const privateId = await createWork(people.head!, {
      title: 'Restricted programme assignment',
      description: '',
      programmeId: id,
      ownerId: people.student!.id,
      reviewerId: people.head!.id,
      dueOn: null,
      priority: 'normal',
    });
    expect(
      (await getTracker(people.intern!, id)).tasks.some(
        (task) => task.id === privateId,
      ),
    ).toBe(false);
    const history = await getTrackerHistory(people.intern!, id);
    expect(
      history.items.some((event) => event.message.includes('Task assigned.')),
    ).toBe(false);
    const headHistory = await getTrackerHistory(people.head!, id);
    expect(
      headHistory.items.some((event) =>
        event.message.includes('Task assigned.'),
      ),
    ).toBe(true);
  });
  it('keeps metadata stage and column versions coherent', async () => {
    const detail = await getTracker(people.manager!, id);
    await expect(
      updateTracker(people.intern!, id, {
        name: 'Altered',
        description: '',
        stage: 'completed',
        version: detail.programme.version,
      }),
    ).rejects.toThrow();
    await updateTracker(people.manager!, id, {
      name: 'Programme A updated',
      description: 'Updated purpose',
      stage: 'completed',
      version: detail.programme.version,
    });
    await expect(
      updateTracker(people.manager!, id, {
        name: 'Stale',
        description: '',
        stage: 'ongoing',
        version: detail.programme.version,
      }),
    ).rejects.toThrow('changed');
    expect((await getTracker(people.intern!, id)).programme.stage).toBe(
      'completed',
    );
    await saveTrackerRow(
      people.intern!,
      id,
      row({ title: 'Follow-up after completion' }),
    );
  });
});

describe('tracker private uploads', () => {
  it('claims files once, deduplicates retries, and revokes downloads when membership ends', async () => {
    const [upload] = await reserveTrackerUploads(people.intern!, id, [
      { name: 'report.pdf', size: pdf.length },
    ]);
    expect(
      await authorizeTrackerUpload(
        people.intern!,
        upload!.id,
        upload!.blobPath!,
      ),
    ).toMatchObject({ maximumSizeInBytes: pdf.length, allowOverwrite: false });
    await expect(
      authorizeTrackerUpload(people.student!, upload!.id, upload!.blobPath!),
    ).rejects.toThrow();
    await expect(
      downloadTrackerFile(people.intern!, upload!.id),
    ).rejects.toThrow();
    const record = row({ uploadIds: [upload!.id] });
    await saveTrackerRow(people.intern!, id, record);
    await saveTrackerRow(people.intern!, id, record);
    expect((await downloadTrackerFile(people.student!, upload!.id)).id).toBe(
      upload!.id,
    );
    await expect(
      saveTrackerRow(people.intern!, id, row({ uploadIds: [upload!.id] })),
    ).rejects.toThrow();
    await holder.db
      .delete(programmeMembers)
      .where(
        and(
          eq(programmeMembers.programmeId, id),
          eq(programmeMembers.userId, people.student!.id),
        ),
      );
    await expect(
      downloadTrackerFile(people.student!, upload!.id),
    ).rejects.toThrow();
    expect((await holder.db.select().from(workTasks)).length).toBeGreaterThan(
      0,
    );
  });
  it('validates content, expiration and cleanup without deleting claimed files', async () => {
    const [upload] = await reserveTrackerUploads(people.intern!, id, [
      { name: 'notes.pdf', size: pdf.length },
    ]);
    storage.read.mockResolvedValueOnce(Buffer.from('invalid'));
    await expect(
      saveTrackerRow(people.intern!, id, row({ uploadIds: [upload!.id] })),
    ).rejects.toThrow();
    expect(
      await holder.db
        .select()
        .from(trackerRows)
        .where(eq(trackerRows.title, 'notes.pdf')),
    ).toHaveLength(0);
    await holder.db
      .update(trackerUploads)
      .set({ expiresAt: new Date(0) })
      .where(eq(trackerUploads.id, upload!.id));
    await expect(
      authorizeTrackerUpload(people.intern!, upload!.id, upload!.blobPath!),
    ).rejects.toThrow();
    expect(await cleanupTrackerUploads()).toBe(1);
    expect(
      (await holder.db.select().from(trackerUploads)).some(
        (file) => file.rowId !== null,
      ),
    ).toBe(true);
  });
});

describe('Ideas access is exclusively based on the KRITI responsibility', () => {
  it.each([...WORKSPACE_ROLES, 'technical_admin'])(
    'enforces %s access, including old author/sharing records',
    async (role) => {
      const user = people[role]!;
      const allowed = canUseIdeas((await getWorkspaceAccess(user)).role);
      const [existing] = await holder.db
        .insert(ideas)
        .values({
          title: 'Existing private idea',
          body: 'Private notes',
          authorId: user.id,
        })
        .returning();
      await holder.db
        .insert(ideaMembers)
        .values({ ideaId: existing!.id, userId: user.id });
      if (allowed) {
        expect((await getIdea(user, existing!.id)).idea.id).toBe(existing!.id);
        await expect(
          saveIdea(user, { title: 'Allowed concept', body: '', memberIds: [] }),
        ).resolves.toBeTypeOf('string');
      } else {
        expect(await listIdeas(user)).toHaveLength(0);
        await expect(getIdea(user, existing!.id)).rejects.toThrow();
        await expect(
          saveIdea(user, { title: 'Forged concept', body: '', memberIds: [] }),
        ).rejects.toThrow();
        await expect(listIdeaPeople(user)).rejects.toThrow();
      }
    },
  );
  it('blocks sharing with other roles and reflects later role revocation immediately', async () => {
    await expect(
      saveIdea(people.head!, {
        title: 'Private strategy',
        body: '',
        memberIds: [people.manager!.id],
      }),
    ).rejects.toThrow('Share ideas only');
    const idea = await saveIdea(people.head!, {
      title: 'Shared strategy',
      body: '',
      memberIds: [people.associate_head!.id],
    });
    await holder.db
      .update(workspaceProfiles)
      .set({ role: 'program_head' })
      .where(eq(workspaceProfiles.userId, people.associate_head!.id));
    await expect(getIdea(people.associate_head!, idea)).rejects.toThrow();
    expect((await getIdea(people.head!, idea)).members).toHaveLength(0);
    expect(
      (await listIdeaPeople(people.head!)).some(
        (person) => person.id === people.associate_head!.id,
      ),
    ).toBe(false);
  });
});
