import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAction } from '@/lib/actions/form-state';
import { ForbiddenError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { taskSchema, workSharingSchema } from '@/lib/schemas/work';
import { memberIds } from '@/lib/schemas/collaboration';

afterEach(() => vi.restoreAllMocks());

function taskForm(extra: Record<string, string> = {}) {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    title: '  Prepare meeting notes  ',
    ownerId: randomUUID(),
    programmeId: '',
    reviewerId: '',
    dueOn: '',
    ...extra,
  })) form.set(key, value);
  return form;
}

describe('server action validation after the Zod upgrade', () => {
  it('passes parsed defaults and transformations to the handler', async () => {
    const handler = vi.fn(async () => {});
    const result = await runAction(taskSchema, taskForm(), handler, 'Saved.');
    expect(result).toEqual({ status: 'success', message: 'Saved.' });
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Prepare meeting notes', description: '', programmeId: null,
      reviewerId: null, dueOn: null, viewerIds: [], priority: 'normal',
    }));
  });

  it('returns field errors without calling a handler for invalid work', async () => {
    const ownerId = randomUUID();
    const handler = vi.fn(async () => {});
    const result = await runAction(taskSchema, taskForm({
      title: 'x', ownerId, reviewerId: ownerId,
    }), handler, 'Saved.');
    expect(result.status).toBe('error');
    expect(result.fieldErrors?.title).toBeDefined();
    expect(result.fieldErrors?.reviewerId).toEqual(['Choose a reviewer other than the owner.']);
    expect(handler).not.toHaveBeenCalled();
  });

  it('rejects malformed viewer identities before a handler runs', async () => {
    const handler = vi.fn(async () => {});
    const result = await runAction(taskSchema, taskForm({ viewerIds: 'not-an-id' }), handler, 'Saved.');
    expect(result.fieldErrors?.viewerIds).toBeDefined();
    expect(handler).not.toHaveBeenCalled();
  });

  it('preserves permission errors and hides unexpected internal errors', async () => {
    const log = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const forbidden = await runAction(taskSchema, taskForm(), async () => {
      throw new ForbiddenError('This programme is outside your scope.');
    }, 'Saved.');
    expect(forbidden).toEqual({ status: 'error', message: 'This programme is outside your scope.' });
    expect(log).not.toHaveBeenCalled();
    const unexpected = await runAction(taskSchema, taskForm(), async () => {
      throw new Error('private database detail');
    }, 'Saved.');
    expect(unexpected.status).toBe('error');
    expect(unexpected.message).not.toContain('private database detail');
    expect(log).toHaveBeenCalledOnce();
  });
});

describe('sharing input boundaries', () => {
  const sharing = (viewerIds?: unknown) => ({ taskId: randomUUID(), version: '0', viewerIds });

  it('accepts absent, empty, array and CSV viewer selections', () => {
    const id = randomUUID();
    for (const input of [undefined, '', []])
      expect(workSharingSchema.parse(sharing(input)).viewerIds).toEqual([]);
    for (const input of [[id, id], `${id},${id}`])
      expect(workSharingSchema.parse(sharing(input)).viewerIds).toEqual([id]);
  });

  it('accepts 100 viewers and rejects 101 in both supported encodings', () => {
    const ids = Array.from({ length: 101 }, () => randomUUID());
    for (const input of [ids.slice(0, 100), ids.slice(0, 100).join(',')])
      expect(workSharingSchema.parse(sharing(input)).viewerIds).toHaveLength(100);
    for (const input of [ids, ids.join(',')])
      expect(workSharingSchema.safeParse(sharing(input)).success).toBe(false);
  });

  it('bounds CSV input before splitting even when all entries are empty', () => {
    expect(workSharingSchema.safeParse(sharing(','.repeat(10001))).success).toBe(false);
    expect(memberIds.safeParse(','.repeat(10001)).success).toBe(false);
  });

  it('preserves the collaboration member limit and duplicate removal', () => {
    const ids = Array.from({ length: 101 }, () => randomUUID());
    expect(memberIds.parse(ids.slice(0, 100).join(','))).toHaveLength(100);
    expect(memberIds.safeParse(ids.join(',')).success).toBe(false);
    expect(memberIds.parse(`${ids[0]},${ids[0]}`)).toEqual([ids[0]]);
  });
});
