import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDatabase, type TestDatabase } from './helpers/database';
const holder = vi.hoisted(() => ({ db: null as unknown as TestDatabase }));
const storage = vi.hoisted(() => ({ read: vi.fn(), remove: vi.fn() }));
vi.mock('@/lib/db', () => ({ get db() { return holder.db; } }));
vi.mock('@/lib/storage/work-blob', () => ({ readWorkBlob: storage.read, deleteWorkBlob: storage.remove }));
const { users, workspaceProfiles, workUploads, workFiles, workSubmissions } = await import('@/lib/db/schema');
const { createWork, reserveWorkUploads, authorizeWorkUpload, submitWork, getWorkDetail,
  downloadWorkFile, shareWork, cleanupWorkUploads, updateWorkProgress } = await import('@/lib/services/workspace');
type User = typeof users.$inferSelect;
let head: User, owner: User, reviewer: User, outsider: User;
let cleanup: () => Promise<void>;
const pdf = Buffer.from('%PDF-1.4\nprivate work');
beforeAll(async () => {
  const test = await createTestDatabase(); holder.db = test.db; cleanup = test.cleanup;
  const people = await holder.db.insert(users).values(['head', 'owner', 'reviewer', 'outsider'].map((name) => ({
    fullName: name, email: `${name}@pilani.bits-pilani.ac.in`, role: 'member' as const,
  }))).returning();
  [head, owner, reviewer, outsider] = people as [User, User, User, User];
  await holder.db.insert(workspaceProfiles).values(people.map((person) => ({
    userId: person.id, role: person.id === head.id ? 'head' as const : 'intern' as const,
  })));
});
beforeEach(() => { storage.read.mockReset().mockResolvedValue(pdf); storage.remove.mockReset().mockResolvedValue(undefined); });
afterAll(async () => { if (cleanup) await cleanup(); });
async function task() {
  return createWork(head, { title: 'Prepare programme notes', description: '', programmeId: null,
    ownerId: owner.id, reviewerId: reviewer.id, viewerIds: [], dueOn: null, priority: 'normal' });
}
const submission = (taskId: string, version = 0) => ({ taskId, version, summary: 'Ready for review.', links: [] });
async function reserve(taskId: string) {
  return (await reserveWorkUploads(owner, { taskId, version: 0, files: [{ name: 'notes.pdf', size: pdf.length }] }))[0]!;
}

describe('private direct upload lifecycle', () => {
  it('reserves only for the current owner of open work', async () => {
    const taskId = await task();
    for (const actor of [head, reviewer, outsider]) await expect(reserveWorkUploads(actor, {
      taskId, version: 0, files: [{ name: 'notes.pdf', size: pdf.length }],
    })).rejects.toThrow('owner');
    const upload = await reserve(taskId);
    expect(upload.blobPath).toMatch(new RegExp(`^work/${taskId}/[a-f0-9-]+\\.pdf$`));
    expect(upload.name).toBe('notes.pdf');
  });

  it('enforces file count, type and size before issuing any reservation', async () => {
    const taskId = await task();
    for (const files of [[], Array(4).fill({ name: 'notes.pdf', size: 10 }),
      [{ name: 'notes.pdf', size: 5 * 1024 * 1024 + 1 }], [{ name: 'notes.pdf', size: 0 }],
      [{ name: 'script.html', size: 10 }], [{ name: 'file.__proto__', size: 10 }]])
      await expect(reserveWorkUploads(owner, { taskId, version: 0, files })).rejects.toThrow();
  });

  it('binds short-lived, non-overwriting tokens to the owner and exact path', async () => {
    const taskId = await task(); const upload = await reserve(taskId);
    const limits = await authorizeWorkUpload(owner, upload.id, upload.blobPath);
    expect(limits).toMatchObject({ maximumSizeInBytes: pdf.length, allowedContentTypes: ['application/pdf'], allowOverwrite: false, addRandomSuffix: false });
    expect(limits.validUntil).toBeLessThanOrEqual(Date.now() + 5 * 60 * 1000);
    await expect(authorizeWorkUpload(outsider, upload.id, upload.blobPath)).rejects.toThrow();
    await expect(authorizeWorkUpload(owner, upload.id, 'https://example.com/file.pdf')).rejects.toThrow();
    await updateWorkProgress(owner, { taskId, version: 0, status: 'in_progress', note: '' });
    await expect(authorizeWorkUpload(owner, upload.id, upload.blobPath)).rejects.toThrow('changed');
  });

  it('validates private bytes, claims the upload once and preserves download scope', async () => {
    const taskId = await task(); const upload = await reserve(taskId);
    await submitWork(owner, submission(taskId), [], [upload.id]);
    const detail = await getWorkDetail(reviewer, taskId);
    expect(detail.task.status).toBe('submitted');
    const fileId = detail.submissions[0]!.files[0]!.id;
    const file = await downloadWorkFile(reviewer, fileId);
    expect(file.content).toBeNull(); expect(file.blobPath).toBe(upload.blobPath);
    expect(storage.read).toHaveBeenCalledWith(upload.blobPath, pdf.length);
    await expect(downloadWorkFile(outsider, fileId)).rejects.toThrow();
    await shareWork(head, { taskId, version: 1, viewerIds: [outsider.id] });
    expect((await downloadWorkFile(outsider, fileId)).id).toBe(fileId);
    await shareWork(head, { taskId, version: 2, viewerIds: [] });
    await expect(downloadWorkFile(outsider, fileId)).rejects.toThrow();
    await expect(submitWork(owner, submission(taskId), [], [upload.id])).rejects.toThrow();
    const [claimed] = await holder.db.select().from(workUploads).where(eq(workUploads.id, upload.id));
    expect(claimed?.claimedAt).toBeInstanceOf(Date);
  });

  it('rejects another task, duplicate IDs and another owner before reading storage', async () => {
    const taskId = await task(); const otherTask = await task(); const upload = await reserve(taskId);
    await expect(submitWork(owner, submission(otherTask), [], [upload.id])).rejects.toThrow();
    await expect(submitWork(outsider, submission(taskId), [], [upload.id])).rejects.toThrow();
    await expect(submitWork(owner, submission(taskId), [], [upload.id, upload.id])).rejects.toThrow();
    expect(storage.read).not.toHaveBeenCalled();
  });

  it('rejects expired and already closed reservations', async () => {
    const taskId = await task(); const upload = await reserve(taskId);
    await holder.db.update(workUploads).set({ expiresAt: new Date(Date.now() - 1) }).where(eq(workUploads.id, upload.id));
    await expect(authorizeWorkUpload(owner, upload.id, upload.blobPath)).rejects.toThrow('expired');
    await expect(submitWork(owner, submission(taskId), [], [upload.id])).rejects.toThrow('expired');
    expect(storage.read).not.toHaveBeenCalled();
  });

  it('rejects false file signatures and leaves the task and upload unclaimed', async () => {
    const taskId = await task(); const upload = await reserve(taskId);
    storage.read.mockResolvedValue(Buffer.alloc(pdf.length, 65));
    await expect(submitWork(owner, submission(taskId), [], [upload.id])).rejects.toThrow('file type');
    expect((await getWorkDetail(owner, taskId)).task.version).toBe(0);
    const [pending] = await holder.db.select().from(workUploads).where(eq(workUploads.id, upload.id));
    expect(pending?.claimedAt).toBeNull();
  });

  it('rechecks task version after private storage validation', async () => {
    const taskId = await task(); const upload = await reserve(taskId);
    storage.read.mockImplementationOnce(async () => {
      await updateWorkProgress(owner, { taskId, version: 0, status: 'in_progress', note: '' });
      return pdf;
    });
    await expect(submitWork(owner, submission(taskId), [], [upload.id])).rejects.toThrow('changed');
    expect((await getWorkDetail(owner, taskId)).submissions).toHaveLength(0);
  });

  it('allows only one concurrent submission to claim an upload', async () => {
    const taskId = await task(); const upload = await reserve(taskId);
    const results = await Promise.allSettled([submitWork(owner, submission(taskId), [], [upload.id]), submitWork(owner, submission(taskId), [], [upload.id])]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect((await getWorkDetail(owner, taskId)).submissions).toHaveLength(1);
  });

  it('removes only old unclaimed objects, retaining submitted files and recent uploads', async () => {
    const taskId = await task(); const abandoned = await reserve(taskId); const claimed = await reserve(taskId); const recent = await reserve(taskId);
    await submitWork(owner, submission(taskId), [], [claimed.id]);
    const old = new Date(Date.now() - 26 * 60 * 60 * 1000);
    for (const id of [abandoned.id, claimed.id]) await holder.db.update(workUploads).set({ expiresAt: old }).where(eq(workUploads.id, id));
    expect(await cleanupWorkUploads()).toBe(1);
    expect(storage.remove).toHaveBeenCalledExactlyOnceWith(abandoned.blobPath);
    expect(await holder.db.select().from(workUploads).where(eq(workUploads.id, recent.id))).toHaveLength(1);
    expect(await holder.db.select().from(workFiles).where(eq(workFiles.blobPath, claimed.blobPath))).toHaveLength(1);
  });

  it('keeps an abandoned reservation for retry if storage deletion fails', async () => {
    const taskId = await task(); const upload = await reserve(taskId);
    await holder.db.update(workUploads).set({ expiresAt: new Date(Date.now() - 26 * 60 * 60 * 1000) }).where(eq(workUploads.id, upload.id));
    storage.remove.mockRejectedValueOnce(new Error('temporary storage error'));
    await expect(cleanupWorkUploads()).rejects.toThrow('temporary');
    expect(await holder.db.select().from(workUploads).where(eq(workUploads.id, upload.id))).toHaveLength(1);
    expect(await cleanupWorkUploads()).toBe(1);
  });

  it('cannot store a file with both content and a Blob path, or with neither', async () => {
    const taskId = await task(); const upload = await reserve(taskId);
    await submitWork(owner, submission(taskId), [], [upload.id]);
    const [submitted] = await holder.db.select().from(workSubmissions).where(eq(workSubmissions.taskId, taskId));
    for (const content of [null, pdf]) await expect(holder.db.insert(workFiles).values({
      submissionId: submitted!.id, name: 'bad.pdf', contentType: 'application/pdf', size: pdf.length,
      content, blobPath: content ? 'work/invalid.pdf' : null,
    })).rejects.toThrow();
  });
});
