'use client';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { TRACKER_KINDS, ROW_STATUSES, type TrackerColumn } from '@/lib/tracker';
import { ACCEPTED_WORK_FILES } from '@/lib/workspace';
import type { TrackerRecord } from '@/lib/services/tracker';
import { trackerRequest } from '@/lib/client/tracker-request';
import { prepareTrackerFiles } from '@/lib/client/tracker-upload';
import { WorkText } from './work-text';

const select =
  'h-9 w-full rounded-md border border-input bg-background px-2 text-sm';
export function TrackerRowEditor({
  programmeId,
  sheetId,
  row,
  userId,
  members,
  columns,
  canManage,
  onSaved,
  onHistory,
}: {
  programmeId: string;
  sheetId: string | null;
  row: TrackerRecord | null;
  userId: string;
  members: { id: string; fullName: string }[];
  columns: TrackerColumn[];
  canManage: boolean;
  onSaved: () => Promise<void>;
  onHistory: (id: string) => void;
}) {
  const [id] = useState(() => row?.id ?? crypto.randomUUID());
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  const cached = useRef<{
    files: File[];
    ids: string[];
    expires: number;
  } | null>(null);
  const pending = useRef(false);
  const editable = !row || row.editable;
  async function save(form: HTMLFormElement) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const fields = new FormData(form);
      let ids =
        cached.current?.files === files && cached.current.expires > Date.now()
          ? cached.current.ids
          : null;
      if (!ids) {
        ids = await prepareTrackerFiles(programmeId, files, setProgress);
        cached.current = { files, ids, expires: Date.now() + 2700000 };
      }
      const values = Object.fromEntries(
        columns.map((column) => [
          column.id,
          String(fields.get(`column:${column.id}`) ?? ''),
        ]),
      );
      await trackerRequest(programmeId, {
        operation: 'save',
        row: {
          id,
          sheetId,
          version: row?.version,
          title: fields.get('title'),
          kind: fields.get('kind') ?? row?.kind ?? 'update',
          status: fields.get('status'),
          ownerId: fields.get('ownerId') || null,
          eventOn: fields.get('eventOn') || null,
          notes: fields.get('notes'),
          links: String(fields.get('links') ?? '')
            .split(/\r?\n/)
            .map((link) => link.trim())
            .filter(Boolean),
          values,
          uploadIds: ids,
        },
      });
      await onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save.');
    } finally {
      pending.current = false;
      setBusy(false);
      setProgress('');
    }
  }
  if (!editable && row)
    return (
      <div className="space-y-5 overflow-y-auto p-5">
        <h3 className="text-base font-semibold">{row.title}</h3>
        <p className="text-xs text-muted-foreground">
          {TRACKER_KINDS[row.kind as keyof typeof TRACKER_KINDS]} ·{' '}
          {ROW_STATUSES[row.status as keyof typeof ROW_STATUSES]}
        </p>
        {row.eventOn ? <p className="text-sm">Date: {row.eventOn}</p> : null}
        <p className="whitespace-pre-wrap text-sm">
          <WorkText text={row.notes} />
        </p>
        {row.links.map((link) => (
          <a
            key={link}
            href={link}
            target={link.startsWith('/') ? undefined : '_blank'}
            rel="noopener noreferrer"
            className="block break-all text-sm text-primary underline"
          >
            {link}
          </a>
        ))}
        {row.files.map((file) => (
          <a
            key={file.id}
            href={`/api/trackers/files/${file.id}`}
            className="block text-sm text-primary"
            download
          >
            {file.name} ↓
          </a>
        ))}
        {columns.map((column) =>
          row.values[column.id] ? (
            <p key={column.id} className="text-sm">
              <span className="font-medium">{column.label}: </span>
              {row.values[column.id]}
            </p>
          ) : null,
        )}
        <Button variant="outline" size="sm" onClick={() => onHistory(row.id)}>
          View history
        </Button>
      </div>
    );
  return (
    <form
      className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5"
      onSubmit={(event) => {
        event.preventDefault();
        void save(event.currentTarget);
      }}
    >
      <fieldset className="min-w-0 space-y-4" disabled={busy}>
        <div className="space-y-1.5">
          <Label htmlFor="row-title">Item</Label>
          <Input
            id="row-title"
            name="title"
            defaultValue={row?.title}
            maxLength={200}
            required
            autoFocus
            placeholder="What would you like to track?"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="row-kind">Type</Label>
            <select
              id="row-kind"
              name="kind"
              defaultValue={row?.kind ?? 'update'}
              className={select}
            >
              {Object.entries(TRACKER_KINDS)
                .filter(([value]) => value !== 'sheet' || row?.linkedSheetId)
                .map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="row-status">Status</Label>
            <select
              id="row-status"
              name="status"
              defaultValue={row?.status ?? 'planned'}
              className={select}
            >
              {Object.entries(ROW_STATUSES).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="row-owner">Responsible person</Label>
            <select
              id="row-owner"
              name="ownerId"
              defaultValue={row?.ownerId ?? userId}
              className={select}
            >
              <option value="">Unassigned</option>
              {members
                .filter(
                  (person) =>
                    canManage ||
                    person.id === userId ||
                    person.id === row?.ownerId,
                )
                .map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.fullName}
                  </option>
                ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="row-date">Date (optional)</Label>
            <Input
              id="row-date"
              name="eventOn"
              type="date"
              defaultValue={row?.eventOn ?? ''}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="row-notes">Notes</Label>
          <Textarea
            id="row-notes"
            name="notes"
            defaultValue={row?.notes}
            rows={4}
            maxLength={15000}
            placeholder="What happened, what changed or what is planned?"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="row-links">Related links</Label>
          <Textarea
            id="row-links"
            name="links"
            rows={2}
            maxLength={30000}
            defaultValue={row?.links.join('\n')}
            placeholder="One link per line · Docs, Sheets, Drive or KRITI records"
          />
        </div>
        {columns.length ? (
          <details open>
            <summary className="cursor-pointer text-xs font-medium">
              Tracker columns
            </summary>
            <div className="mt-3 space-y-3">
              {columns.map((column) => (
                <div key={column.id} className="space-y-1.5">
                  <Label htmlFor={`column-${column.id}`}>{column.label}</Label>
                  <Input
                    id={`column-${column.id}`}
                    name={`column:${column.id}`}
                    type={column.type === 'url' ? 'text' : column.type}
                    maxLength={2000}
                    defaultValue={row?.values[column.id] ?? ''}
                  />
                </div>
              ))}
            </div>
          </details>
        ) : null}
        {row?.files.length ? (
          <div className="space-y-2">
            <Label>Existing files</Label>
            {row.files.map((file, index) => (
              <a
                key={file.id}
                href={`/api/trackers/files/${file.id}`}
                download
                className="block break-words text-xs text-primary"
              >
                {file.name}
                {row.files.filter((item) => item.name === file.name).length > 1
                  ? ` · ${index + 1}`
                  : ''}{' '}
                ↓
              </a>
            ))}
          </div>
        ) : null}
        <div className="space-y-2">
          <Label htmlFor="row-files">Attach files (optional)</Label>
          <input
            id="row-files"
            type="file"
            multiple
            accept={ACCEPTED_WORK_FILES}
            className="block max-w-full text-xs file:mr-3 file:rounded file:border file:bg-background file:px-3 file:py-2"
            onChange={(event) => {
              setFiles(Array.from(event.target.files ?? []));
              cached.current = null;
            }}
          />
          <p className="text-[11px] text-muted-foreground">
            Up to 3 files · 5 MB each. Previous attachments stay available.
          </p>
        </div>
      </fieldset>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      {progress ? (
        <p role="status" className="text-xs text-muted-foreground">
          {progress}
        </p>
      ) : null}
      <div className="flex items-center gap-3">
        <Button disabled={busy}>
          {busy ? 'Saving…' : row ? 'Save changes' : 'Add row'}
        </Button>
        {row ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onHistory(row.id)}
          >
            History
          </Button>
        ) : null}
      </div>
      {row ? (
        <p className="text-[10px] text-muted-foreground">
          Added{' '}
          {new Date(row.createdAt).toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
          })}
          . The event date can be different from when it was recorded.
        </p>
      ) : null}
    </form>
  );
}
