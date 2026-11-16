import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/session';
import { isDomainError, NotFoundError } from '@/lib/errors';
import {
  getTracker,
  saveTrackerRow,
  archiveTrackerRow,
  createTrackerSheet,
  addTrackerColumn,
  updateTracker,
  getTrackerHistory,
  getTrackerResources,
} from '@/lib/services/tracker';
import { configureProgrammeMember } from '@/lib/services/workspace';
import {
  trackerRowInput,
  trackerSettingsInput,
  trackerColumnInput,
} from '@/lib/schemas/tracker';
import { assertSameOrigin, readUploadJson } from '@/lib/http/upload-request';
import { PROGRAMME_ROLES } from '@/lib/workspace';
import { logger } from '@/lib/logger';
const headers = { 'Cache-Control': 'private, no-store' };
const operation = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('save'), row: trackerRowInput }),
  z.object({
    operation: z.literal('archive'),
    id: z.uuid(),
    version: z.number().int().nonnegative(),
    archive: z.boolean(),
  }),
  z.object({
    operation: z.literal('sheet'),
    name: z.string().trim().min(1).max(120),
    parentId: z.uuid().nullable(),
  }),
  z.object({
    operation: z.literal('column'),
    sheetId: z.uuid().nullable(),
    column: trackerColumnInput,
    version: z.number().int().nonnegative(),
  }),
  z.object({
    operation: z.literal('settings'),
    settings: trackerSettingsInput,
  }),
  z.object({
    operation: z.literal('member'),
    userId: z.uuid(),
    role: z.enum(PROGRAMME_ROLES),
  }),
]);
function failure(error: unknown) {
  if (isDomainError(error))
    return Response.json(
      { error: error.message },
      { status: error instanceof NotFoundError ? 404 : 403, headers },
    );
  if (error instanceof z.ZodError)
    return Response.json(
      { error: error.issues[0]?.message ?? 'Check the highlighted values.' },
      { status: 400, headers },
    );
  logger.error('Tracker request failed', error);
  return Response.json(
    { error: 'Unable to save. Your draft is still here. Please try again.' },
    { status: 503, headers },
  );
}
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user)
    return Response.json(
      { error: 'Sign in again to view this tracker.' },
      { status: 401, headers },
    );
  try {
    const id = z.uuid().parse((await params).id);
    const query = z
      .object({
        sheet: z.uuid().optional(),
        mode: z.enum(['data', 'resources', 'history']).default('data'),
        row: z.uuid().optional(),
        page: z.coerce.number().int().min(0).max(10000).default(0),
      })
      .parse(Object.fromEntries(new URL(request.url).searchParams));
    const data =
      query.mode === 'history'
        ? await getTrackerHistory(user, id, query.row, query.page)
        : query.mode === 'resources'
          ? await getTrackerResources(user, id)
          : await getTracker(user, id, query.sheet);
    return Response.json({ data }, { headers });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user)
    return Response.json(
      { error: 'Sign in again. Your draft is still here.' },
      { status: 401, headers },
    );
  try {
    assertSameOrigin(request);
    const id = z.uuid().parse((await params).id);
    const input = operation.parse(await readUploadJson(request, 256 * 1024));
    let sheetId;
    if (input.operation === 'save') await saveTrackerRow(user, id, input.row);
    else if (input.operation === 'archive')
      await archiveTrackerRow(user, id, input.id, input.version, input.archive);
    else if (input.operation === 'sheet')
      sheetId = await createTrackerSheet(user, id, input.name, input.parentId);
    else if (input.operation === 'column')
      await addTrackerColumn(
        user,
        id,
        input.sheetId,
        input.column,
        input.version,
      );
    else if (input.operation === 'settings')
      await updateTracker(user, id, input.settings);
    else if (input.operation === 'member')
      await configureProgrammeMember(user, {
        programmeId: id,
        userId: input.userId,
        role: input.role,
      });
    return Response.json({ ok: true, sheetId }, { headers });
  } catch (error) {
    return failure(error);
  }
}
