import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
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
  workTasks,
  workSubmissions,
  workEvents,
} = await import('@/lib/db/schema');
const {
  createWork,
  listWork,
  getWorkDetail,
  submitWork,
  reviewWork,
  validateWorkUploads,
  downloadWorkFile,
  updateWorkProgress,
  editWork,
  listWorkNotifications,
  markWorkNotificationsRead,
  configureWorkspacePerson,
  configureProgrammeMember,
  getWorkspaceAccess,
  createProgramme,
  listProgrammes,
  getWorkSharingPeople,
  shareWork,
  getWorkLibrary,
} = await import('@/lib/services/workspace');
const { taskSchema, submissionSchema } = await import('@/lib/schemas/work');
type User = typeof users.$inferSelect;
let cleanup: () => Promise<void>;
let head: User,
  lead: User,
  manager: User,
  owner: User,
  reviewer: User,
  outsider: User,
  otherLead: User,
  technicalAdmin: User;
let programmeId: string, otherProgrammeId: string;
beforeAll(async () => {
  const test = await createTestDatabase();
  holder.db = test.db;
  cleanup = test.cleanup;
  const people = await holder.db
    .insert(users)
    .values(
      [
        'head',
        'lead',
        'manager',
        'owner',
        'reviewer',
        'outsider',
        'otherLead',
        'technicalAdmin',
      ].map((name) => ({
        fullName: name,
        email: `${name.toLowerCase()}@pilani.bits-pilani.ac.in`,
        role:
          name === 'technicalAdmin'
            ? ('super_admin' as const)
            : ('member' as const),
      })),
    )
    .returning();
  [head, lead, manager, owner, reviewer, outsider, otherLead, technicalAdmin] =
    people as [User, User, User, User, User, User, User, User];
  await holder.db.insert(workspaceProfiles).values([
    { userId: head.id, role: 'head' },
    { userId: lead.id, role: 'program_head' },
    { userId: manager.id, role: 'manager' },
    { userId: owner.id, role: 'intern' },
    { userId: otherLead.id, role: 'program_head' },
  ]);
  const [first, second] = await holder.db
    .insert(programmes)
    .values([
      { name: 'First programme', code: 'FIRST' },
      { name: 'Second programme', code: 'SECOND' },
    ])
    .returning();
  programmeId = first!.id;
  otherProgrammeId = second!.id;
  await holder.db.insert(programmeMembers).values([
    { programmeId, userId: lead.id, role: 'lead' },
    { programmeId, userId: manager.id, role: 'manager' },
    { programmeId, userId: owner.id, role: 'member' },
    { programmeId, userId: reviewer.id, role: 'reviewer' },
    { programmeId: otherProgrammeId, userId: otherLead.id, role: 'lead' },
    { programmeId: otherProgrammeId, userId: outsider.id, role: 'member' },
  ]);
});
afterAll(async () => {
  if (cleanup) await cleanup();
});
const input = (extra = {}) => ({
  title: 'Prepare programme update',
  description: 'Summarise delivery and blockers.',
  programmeId,
  ownerId: owner.id,
  reviewerId: reviewer.id,
  dueOn: '2026-12-01',
  priority: 'normal' as const,
  ...extra,
});
async function task(actor = lead) {
  return createWork(actor, input());
}
const submission = (id: string, version = 0) => ({
  taskId: id,
  version,
  summary: 'Completed programme update.',
  links: ['https://docs.google.com/document/d/example/edit'],
});

describe('delegation and programme boundaries', () => {
  it('lets Head see official work across programmes; technical admin is not implicitly Head', async () => {
    const id = await task();
    expect((await listWork(head)).some((item) => item.id === id)).toBe(true);
    expect(
      (await listWork(technicalAdmin)).some((item) => item.id === id),
    ).toBe(false);
    expect((await getWorkspaceAccess(technicalAdmin)).canConfigure).toBe(true);
  });
  it('restricts Program Head and Manager to their assigned programmes', async () => {
    const id = await task();
    expect((await listWork(manager)).some((item) => item.id === id)).toBe(true);
    expect((await listWork(otherLead)).some((item) => item.id === id)).toBe(
      false,
    );
    await expect(createWork(otherLead, input())).rejects.toThrow();
    await expect(
      createWork(manager, input({ programmeId: otherProgrammeId })),
    ).rejects.toThrow();
  });
  it('allows scoped managers to delegate, but not ordinary members to assign others', async () => {
    await expect(createWork(manager, input())).resolves.toBeTypeOf('string');
    await expect(createWork(owner, input({ ownerId: reviewer.id, reviewerId: lead.id }))).rejects.toThrow();
  });
  it('rejects cross-programme assignees and self review', async () => {
    await expect(
      createWork(lead, input({ ownerId: outsider.id })),
    ).rejects.toThrow('members');
    await expect(
      createWork(head, input({ reviewerId: owner.id })),
    ).rejects.toThrow();
    expect(taskSchema.safeParse(input({ reviewerId: owner.id })).success).toBe(
      false,
    );
  });
  it('gives intern a combined view of work from multiple assigners without unrelated work', async () => {
    const a = await task(lead);
    const b = await task(manager);
    const direct = await createWork(
      head,
      input({ programmeId: null, ownerId: outsider.id }),
    );
    const work = await listWork(owner);
    expect(work.some((item) => item.id === a)).toBe(true);
    expect(work.some((item) => item.id === b)).toBe(true);
    expect(work.some((item) => item.id === direct)).toBe(false);
    await expect(getWorkDetail(owner, direct)).rejects.toThrow('unavailable');
  });
});
describe('self-created work and selected visibility', () => {
  const ownInput = (extra = {}) => input({ programmeId: null, ownerId: owner.id, reviewerId: null, ...extra });
  it('lets a member record own work and share across programme boundaries', async () => {
    const id = await createWork(owner, ownInput({ viewerIds: [otherLead.id] }));
    expect((await listWork(otherLead)).some((item) => item.id === id)).toBe(true);
    expect((await listWork(head)).some((item) => item.id === id)).toBe(true);
    expect((await listWork(technicalAdmin)).some((item) => item.id === id)).toBe(false);
    await expect(getWorkDetail(outsider, id)).rejects.toThrow('unavailable');
    expect((await getWorkSharingPeople()).some((person) => person.id === otherLead.id)).toBe(true);
    expect((await listWorkNotifications(otherLead)).some((notice) => notice.taskId === id)).toBe(true);
  });
  it('preserves programme oversight and denies attaching own work to unrelated programmes', async () => {
    const id = await createWork(owner, ownInput({ programmeId }));
    expect((await listWork(manager)).some((item) => item.id === id)).toBe(true);
    await expect(createWork(owner, ownInput({ programmeId: otherProgrammeId }))).rejects.toThrow();
    await expect(createWork(head, input({ reviewerId: null }))).rejects.toThrow('reviewer');
  });
  it('gives selected viewers no editing, submission, review or resharing authority', async () => {
    const id = await createWork(owner, ownInput({ viewerIds: [otherLead.id] }));
    const detail = await getWorkDetail(otherLead, id);
    expect(detail.canEdit).toBe(false);
    expect(detail.canReview).toBe(false);
    await expect(editWork(otherLead, id, 0, ownInput())).rejects.toThrow();
    await expect(submitWork(otherLead, submission(id), [])).rejects.toThrow('owner');
    await expect(reviewWork(otherLead, { taskId: id, version: 0, decision: 'accepted', feedback: '' })).rejects.toThrow('named reviewer');
    await expect(shareWork(otherLead, { taskId: id, version: 0, viewerIds: [outsider.id] })).rejects.toThrow('creator');
    await expect(updateWorkProgress(otherLead, { taskId: id, version: 0, status: 'in_progress', note: '' })).rejects.toThrow();
  });
  it('records completion without fabricating a review and revokes file, library and notification access', async () => {
    const id = await createWork(owner, ownInput({ viewerIds: [otherLead.id] }));
    const upload = await validateWorkUploads([new File(['%PDF-1.4\nown work'], 'own-work.pdf')]);
    await submitWork(owner, submission(id), upload);
    const detail = await getWorkDetail(otherLead, id);
    expect(detail.task.status).toBe('completed');
    expect(detail.submissions[0]!.decision).toBeNull();
    expect(detail.submissions[0]!.reviewedBy).toBeNull();
    const fileId = detail.submissions[0]!.files[0]!.id;
    await expect(downloadWorkFile(otherLead, fileId)).resolves.toBeDefined();
    expect((await getWorkLibrary(otherLead)).some((item) => item.submission.taskId === id)).toBe(true);
    await shareWork(owner, { taskId: id, version: 1, viewerIds: [] });
    await expect(getWorkDetail(otherLead, id)).rejects.toThrow('unavailable');
    await expect(downloadWorkFile(otherLead, fileId)).rejects.toThrow('unavailable');
    expect((await getWorkLibrary(otherLead)).some((item) => item.submission.taskId === id)).toBe(false);
    expect((await listWorkNotifications(otherLead)).some((item) => item.taskId === id)).toBe(false);
    await expect(shareWork(owner, { taskId: id, version: 1, viewerIds: [otherLead.id] })).rejects.toThrow('changed');
    await expect(getWorkDetail(head, id)).resolves.toBeDefined();
  });
  it('supports an optional reviewer from another programme and keeps approval with that reviewer', async () => {
    const id = await createWork(owner, ownInput({ programmeId, reviewerId: otherLead.id }));
    await submitWork(owner, submission(id), []);
    expect((await getWorkDetail(owner, id)).task.status).toBe('submitted');
    await reviewWork(otherLead, { taskId: id, version: 1, decision: 'accepted', feedback: 'Reviewed.' });
    expect((await getWorkDetail(owner, id)).task.status).toBe('completed');
  });
  it('lets creators edit their own work but prevents delegation through an edit', async () => {
    const id = await createWork(owner, ownInput());
    await editWork(owner, id, 0, ownInput({ dueOn: '2026-12-10', viewerIds: [otherLead.id] }));
    expect((await getWorkDetail(owner, id)).task.dueOn).toBe('2026-12-10');
    await expect(editWork(owner, id, 1, input({ ownerId: otherLead.id, programmeId: null }))).rejects.toThrow();
    await expect(createWork(owner, ownInput({ viewerIds: [crypto.randomUUID()] }))).rejects.toThrow('active KRITI');
  });
});

describe('programme creation by KRITI responsibility', () => {
  it('supports an explicit account grant without enabling programme creation for other interns', async () => {
    expect((await getWorkspaceAccess(owner)).canCreateProgrammes).toBe(false);
    await holder.db.update(workspaceProfiles).set({ programmeCreationAllowed: true }).where(eq(workspaceProfiles.userId, owner.id));
    try {
      const access = await getWorkspaceAccess(owner);
      expect(access.role).toBe('intern');
      expect(access.canCreateProgrammes).toBe(true);
      await createProgramme(owner, { name: 'Explicitly authorized programme', code: 'PERSONAL-GRANT', description: '' });
      expect((await getWorkspaceAccess(outsider)).canCreateProgrammes).toBe(false);
    } finally {
      await holder.db.update(workspaceProfiles).set({ programmeCreationAllowed: false }).where(eq(workspaceProfiles.userId, owner.id));
    }
    expect((await getWorkspaceAccess(owner)).canCreateProgrammes).toBe(false);
    await expect(createProgramme(owner, { name: 'After revocation', code: 'REVOKED-GRANT', description: '' })).rejects.toThrow('programme creation');
  });
  it.each(['head', 'associate_head', 'nucleus', 'program_head', 'manager', 'intern', 'administrative_support', 'student'] as const)(
    'applies programme creation permission to %s, independently of technical admin access', async (role) => {
      const [account] = await holder.db.insert(users).values({ fullName: `Creation ${role}`, email: `creation-${role}@bits-pilani.ac.in`, role: 'super_admin' }).returning();
      await holder.db.insert(workspaceProfiles).values({ userId: account!.id, role });
      const allowed = !['intern', 'administrative_support', 'student'].includes(role);
      expect((await getWorkspaceAccess(account!)).canCreateProgrammes).toBe(allowed);
      const create = createProgramme(account!, { name: `Created by ${role}`, code: `CREATE-${role.replaceAll('_', '-')}`, description: '' });
      if (allowed) {
        await expect(create).resolves.toBeUndefined();
        const rows = await listProgrammes(account!);
        const programme = rows.find((item) => item.name === `Created by ${role}`)!;
        expect((await getWorkspaceAccess(account!)).memberships).toContainEqual({ programmeId: programme.id, role: 'lead' });
      } else await expect(create).rejects.toThrow('programme creation');
    },
  );
});
describe('submission, review and durable history', () => {
  it('completes upload → changes requested → revised link → acceptance with previous feedback intact', async () => {
    const id = await task();
    const file = new File(['%PDF-1.4\nexample'], 'update.pdf', {
      type: 'application/pdf',
    });
    const uploads = await validateWorkUploads([file]);
    await submitWork(owner, { ...submission(id), links: [] }, uploads);
    let detail = await getWorkDetail(reviewer, id);
    expect(detail.task.status).toBe('submitted');
    expect(detail.submissions[0]!.version).toBe(1);
    const fileId = detail.submissions[0]!.files[0]!.id;
    const downloaded = await downloadWorkFile(reviewer, fileId);
    expect(downloaded.content?.toString()).toBe('%PDF-1.4\nexample');
    expect(downloaded.blobPath).toBeNull();
    await expect(downloadWorkFile(outsider, fileId)).rejects.toThrow();
    await reviewWork(reviewer, {
      taskId: id,
      version: 1,
      decision: 'changes_requested',
      feedback: 'Include next steps.',
    });
    await submitWork(owner, submission(id, 2), []);
    await reviewWork(reviewer, {
      taskId: id,
      version: 3,
      decision: 'accepted',
      feedback: 'Ready to share.',
    });
    detail = await getWorkDetail(owner, id);
    expect(detail.task.status).toBe('completed');
    expect(detail.submissions).toHaveLength(2);
    expect(detail.submissions[1]!.feedback).toBe('Include next steps.');
    expect(detail.submissions[0]!.decision).toBe('accepted');
    expect(
      detail.events.some((event) => event.message.includes('completed')),
    ).toBe(true);
  });
  it('allows only the owner to submit and the named reviewer to decide, including for Head', async () => {
    const id = await task();
    await expect(submitWork(manager, submission(id), [])).rejects.toThrow(
      'owner',
    );
    await submitWork(owner, submission(id), []);
    await expect(
      reviewWork(head, {
        taskId: id,
        version: 1,
        decision: 'accepted',
        feedback: '',
      }),
    ).rejects.toThrow('named reviewer');
  });
  it('rejects duplicate submissions and stale review decisions', async () => {
    const id = await task();
    await submitWork(owner, submission(id), []);
    await expect(submitWork(owner, submission(id), [])).rejects.toThrow();
    await expect(
      reviewWork(reviewer, {
        taskId: id,
        version: 0,
        decision: 'accepted',
        feedback: '',
      }),
    ).rejects.toThrow('changed');
    await reviewWork(reviewer, {
      taskId: id,
      version: 1,
      decision: 'accepted',
      feedback: '',
    });
    await expect(
      reviewWork(reviewer, {
        taskId: id,
        version: 1,
        decision: 'accepted',
        feedback: '',
      }),
    ).rejects.toThrow();
    expect(
      await holder.db
        .select()
        .from(workSubmissions)
        .where(eq(workSubmissions.taskId, id)),
    ).toHaveLength(1);
  });
  it('does not silently reassign a task under review', async () => {
    const id = await task();
    await submitWork(owner, submission(id), []);
    await expect(
      editWork(lead, id, 1, input({ title: 'Changed title' })),
    ).rejects.toThrow('review');
  });
  it('records blockers and makes submitted/closed work immutable to progress changes', async () => {
    const id = await task();
    await updateWorkProgress(owner, {
      taskId: id,
      version: 0,
      status: 'blocked',
      note: 'Waiting for figures.',
    });
    await submitWork(owner, submission(id, 1), []);
    await expect(
      updateWorkProgress(owner, {
        taskId: id,
        version: 2,
        status: 'in_progress',
        note: '',
      }),
    ).rejects.toThrow('review');
    const detail = await getWorkDetail(lead, id);
    expect(
      detail.events.some((event) =>
        event.message.includes('Waiting for figures.'),
      ),
    ).toBe(true);
  });
  it('notifies the relevant people and keeps read state per account', async () => {
    const id = await task();
    expect(
      (await listWorkNotifications(owner)).some((item) => item.taskId === id),
    ).toBe(true);
    await markWorkNotificationsRead(owner);
    expect(await listWorkNotifications(owner)).toHaveLength(0);
    expect(
      (await listWorkNotifications(reviewer)).some(
        (item) => item.taskId === id,
      ),
    ).toBe(true);
  });
  it('requires actual work and validates HTTPS links and real calendar dates', async () => {
    const id = await task();
    await expect(
      submitWork(owner, { ...submission(id), links: [] }, []),
    ).rejects.toThrow('file or');
    expect(
      submissionSchema.safeParse({
        ...submission(id),
        links: 'javascript:alert(1)',
      }).success,
    ).toBe(false);
    expect(taskSchema.safeParse(input({ dueOn: '2026-02-31' })).success).toBe(
      false,
    );
  });
  it('rejects oversized, disguised and too many uploads', async () => {
    await expect(
      validateWorkUploads([new File(['not pdf'], 'report.pdf')]),
    ).rejects.toThrow('file type');
    await expect(
      validateWorkUploads([new File(['x'], 'script.html')]),
    ).rejects.toThrow('Use PDF');
    await expect(
      validateWorkUploads(
        Array.from({ length: 4 }, () => new File(['text'], 'work.txt')),
      ),
    ).rejects.toThrow('three');
    await expect(
      validateWorkUploads([
        new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.txt'),
      ]),
    ).rejects.toThrow('5 MB');
  });
});
describe('workspace provisioning', () => {
  it.each(['head', 'associate_head', 'nucleus', 'program_head', 'manager', 'administrative_support', 'intern', 'student'] as const)(
    'applies member-onboarding permissions to %s', async (role) => {
      const [actor] = await holder.db.insert(users).values({ fullName: `Onboard ${role}`, email: `onboard-${role}@bits-pilani.ac.in`, role: 'member' }).returning();
      await holder.db.insert(workspaceProfiles).values({ userId: actor!.id, role });
      const allowed = ['head', 'program_head', 'manager', 'administrative_support'].includes(role);
      expect((await getWorkspaceAccess(actor!)).canManagePeople).toBe(allowed);
      const input = { fullName: 'New student', email: `new-${role}@pilani.bits-pilani.ac.in`, role: 'student' as const };
      if (allowed) {
        await expect(configureWorkspacePerson(actor!, input)).resolves.toBeUndefined();
        const [created] = await holder.db.select().from(users).where(eq(users.email, input.email));
        expect(created!.role).toBe('member');
        expect(created!.externalGoogleApproved).toBe(false);
        if (role !== 'head') {
          await expect(configureWorkspacePerson(actor!, { ...input, email: `senior-${role}@bits-pilani.ac.in`, role: 'head' })).rejects.toThrow('other responsibilities');
          await expect(configureWorkspacePerson(actor!, { fullName: head.fullName, email: head.email, role: 'intern', access: 'inactive' })).rejects.toThrow('existing accounts');
        }
      } else await expect(configureWorkspacePerson(actor!, input)).rejects.toThrow();
    },
  );
  it('requires explicit external account approval and preserves it when updating responsibility', async () => {
    const input = { fullName: 'Approved support', email: 'approved-support@gmail.com', role: 'administrative_support' as const };
    await expect(configureWorkspacePerson(head, input)).rejects.toThrow('explicitly approve');
    await configureWorkspacePerson(head, { ...input, externalEmailApproval: 'yes' });
    await configureWorkspacePerson(head, input);
    const [created] = await holder.db.select().from(users).where(eq(users.email, input.email));
    expect(created!.externalGoogleApproved).toBe(true);
    expect(created!.role).toBe('member');
    await configureWorkspacePerson(head, { ...input, access: 'inactive' });
    const [disabled] = await holder.db.select().from(users).where(eq(users.id, created!.id));
    expect(disabled!.isActive).toBe(false);
  });
  it('protects self access and administrator accounts when updating sign-in', async () => {
    await expect(
      configureWorkspacePerson(head, {
        fullName: head.fullName,
        email: head.email,
        role: 'head',
        access: 'inactive',
      }),
    ).rejects.toThrow('cannot disable');
    await expect(
      configureWorkspacePerson(head, {
        fullName: technicalAdmin.fullName,
        email: technicalAdmin.email,
        role: 'intern',
        access: 'inactive',
      }),
    ).rejects.toThrow('administrator');
  });
  it('does not grant global rights from programme responsibility or intern title', async () => {
    await expect(
      configureWorkspacePerson(owner, {
        fullName: 'New Head',
        email: 'newhead@pilani.bits-pilani.ac.in',
        role: 'head',
      }),
    ).rejects.toThrow();
    await expect(
      configureProgrammeMember(manager, {
        programmeId: otherProgrammeId,
        userId: owner.id,
        role: 'lead',
      }),
    ).rejects.toThrow();
  });
  it('provisions approved BITS members without granting administrator access', async () => {
    await configureWorkspacePerson(head, {
      fullName: 'New Intern',
      email: 'newintern@pilani.bits-pilani.ac.in',
      role: 'intern',
    });
    const [person] = await holder.db
      .select()
      .from(users)
      .where(eq(users.email, 'newintern@pilani.bits-pilani.ac.in'));
    expect(person!.role).toBe('member');
    await expect(
      configureWorkspacePerson(head, {
        fullName: 'External',
        email: 'outside@example.com',
        role: 'intern',
      }),
    ).rejects.toThrow('BITS');
  });
  it('keeps account administration rights and audit records when changing responsibility', async () => {
    await configureWorkspacePerson(head, {
      fullName: technicalAdmin.fullName,
      email: technicalAdmin.email,
      role: 'intern',
    });
    const [person] = await holder.db
      .select()
      .from(users)
      .where(eq(users.id, technicalAdmin.id));
    expect(person!.role).toBe('super_admin');
    expect((await getWorkspaceAccess(technicalAdmin)).role).toBe('intern');
    expect((await holder.db.select().from(workEvents)).length).toBeGreaterThan(
      0,
    );
    expect((await holder.db.select().from(workTasks)).length).toBeGreaterThan(
      0,
    );
  });
});
