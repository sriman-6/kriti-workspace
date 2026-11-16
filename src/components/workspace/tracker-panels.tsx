'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ROW_STATUSES, TRACKER_STAGES } from '@/lib/tracker';
import { PROGRAMME_ROLES } from '@/lib/workspace';
import { trackerRequest } from '@/lib/client/tracker-request';
import type {
  TrackerDetail,
  getTrackerHistory,
  getTrackerResources,
} from '@/lib/services/tracker';
const select =
  'h-9 w-full rounded-md border border-input bg-background px-2 text-sm';

export function TrackerSettings({
  detail,
  people,
  onSaved,
}: {
  detail: TrackerDetail;
  people: { id: string; fullName: string }[];
  onSaved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [version] = useState(detail.programme.version);
  async function run(input: object) {
    setBusy(true);
    setError('');
    setSaved('');
    try {
      await trackerRequest(detail.programme.id, input);
      await onSaved();
      setSaved('Saved');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-5">
      {detail.canManage ? (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            void run({
              operation: 'settings',
              settings: {
                name: data.get('name'),
                description: data.get('description'),
                stage: data.get('stage'),
                version,
              },
            });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="programme-name">Name</Label>
            <Input
              id="programme-name"
              name="name"
              defaultValue={detail.programme.name}
              required
              minLength={3}
              maxLength={120}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="programme-stage">Stage</Label>
            <select
              id="programme-stage"
              name="stage"
              className={select}
              defaultValue={detail.programme.stage}
            >
              {Object.entries(TRACKER_STAGES).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="programme-description">About</Label>
            <Textarea
              id="programme-description"
              name="description"
              defaultValue={detail.programme.description}
              rows={6}
              maxLength={2000}
            />
          </div>
          <Button size="sm" disabled={busy}>
            Save details
          </Button>
        </form>
      ) : (
        <p className="whitespace-pre-wrap text-sm leading-relaxed">
          {detail.programme.description || 'No description added yet.'}
        </p>
      )}
      <section className="space-y-3 border-t pt-4">
        <h3 className="text-sm font-semibold">People & access</h3>
        <ul className="space-y-3">
          {detail.members.map((member) => (
            <li
              key={member.id}
              className="flex items-start justify-between gap-3 text-sm"
            >
              <span>{member.fullName}</span>
              <span className="text-xs capitalize text-muted-foreground">
                {member.role}
              </span>
            </li>
          ))}
        </ul>
      </section>
      {detail.canManage ? (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            void run({
              operation: 'member',
              userId: data.get('userId'),
              role: data.get('role'),
            });
          }}
        >
          <Label htmlFor="tracker-person">Add / update a member</Label>
          <select
            id="tracker-person"
            name="userId"
            className={select}
            required
            defaultValue=""
          >
            <option value="" disabled>
              Choose a person
            </option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.fullName}
              </option>
            ))}
          </select>
          <Label htmlFor="tracker-role">Responsibility</Label>
          <select
            id="tracker-role"
            name="role"
            className={select}
            defaultValue="member"
          >
            {PROGRAMME_ROLES.map((role) => (
              <option key={role} value={role}>
                {role[0]!.toUpperCase() + role.slice(1)}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            Leads and managers manage this tracker. Task visibility follows each
            assignment’s existing access.
          </p>
          <Button variant="outline" size="sm" disabled={busy}>
            Save member access
          </Button>
        </form>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      <p role="status" className="text-xs text-muted-foreground">
        {saved}
      </p>
    </div>
  );
}
export function TrackerHistory({
  programmeId,
  rowId,
}: {
  programmeId: string;
  rowId?: string;
}) {
  const [data, setData] = useState<Awaited<
    ReturnType<typeof getTrackerHistory>
  > | null>(null);
  const [page, setPage] = useState(0);
  const [error, setError] = useState('');
  useEffect(() => {
    const abort = new AbortController();
    void fetch(
      `/api/trackers/${programmeId}?mode=history&page=${page}${rowId ? `&row=${rowId}` : ''}`,
      { signal: abort.signal, cache: 'no-store' },
    )
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok || !body.data)
          throw new Error(body.error ?? 'Unable to load history.');
        if (!abort.signal.aborted)
          setData((previous) => ({
            items: [...(previous?.items ?? []), ...body.data.items],
            hasMore: body.data.hasMore,
          }));
      })
      .catch((cause) => {
        if (!abort.signal.aborted)
          setError(
            cause instanceof Error ? cause.message : 'Unable to load history.',
          );
      });
    return () => abort.abort();
  }, [programmeId, rowId, page]);
  return (
    <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      {!data ? (
        <p className="text-sm text-muted-foreground">Loading history…</p>
      ) : !data.items.length ? (
        <p className="text-sm text-muted-foreground">
          Changes will appear here as your team uses the tracker.
        </p>
      ) : (
        data.items.map((event) => (
          <article key={event.id} className="space-y-1 border-b pb-4">
            <p className="text-sm font-medium">{event.message}</p>
            <p className="text-[11px] text-muted-foreground">
              {event.actor} ·{' '}
              {new Date(event.createdAt).toLocaleString('en-IN', {
                timeZone: 'Asia/Kolkata',
              })}
            </p>
            {event.snapshot ? (
              <details className="pt-2">
                <summary className="cursor-pointer text-xs text-muted-foreground">
                  Recorded details
                </summary>
                <div className="mt-2 space-y-2 text-xs">
                  {typeof event.snapshot.status === 'string' ? (
                    <p>
                      Status:{' '}
                      {ROW_STATUSES[
                        event.snapshot.status as keyof typeof ROW_STATUSES
                      ] ?? event.snapshot.status}
                    </p>
                  ) : null}
                  {typeof event.snapshot.eventOn === 'string' ? (
                    <p>Date: {event.snapshot.eventOn}</p>
                  ) : null}
                  {typeof event.snapshot.notes === 'string' &&
                  event.snapshot.notes ? (
                    <p className="whitespace-pre-wrap text-sm">
                      {event.snapshot.notes}
                    </p>
                  ) : null}
                  {event.snapshot.values &&
                  typeof event.snapshot.values === 'object'
                    ? Object.entries(event.snapshot.values).map(
                        ([key, value]) => (
                          <p key={key}>
                            {(
                              event.snapshot?.columnLabels as
                                | Record<string, string>
                                | undefined
                            )?.[key] ?? 'Custom value'}
                            : {String(value)}
                          </p>
                        ),
                      )
                    : null}
                </div>
              </details>
            ) : null}
          </article>
        ))
      )}
      {data?.hasMore ? (
        <Button variant="outline" size="sm" onClick={() => setPage(page + 1)}>
          Older changes
        </Button>
      ) : null}
    </div>
  );
}
export function TrackerResources({ programmeId }: { programmeId: string }) {
  const [data, setData] = useState<Awaited<
    ReturnType<typeof getTrackerResources>
  > | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const abort = new AbortController();
    void fetch(`/api/trackers/${programmeId}?mode=resources`, {
      signal: abort.signal,
      cache: 'no-store',
    })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok || !body.data)
          throw new Error(body.error ?? 'Unable to load files.');
        if (!abort.signal.aborted) setData(body.data);
      })
      .catch((cause) => {
        if (!abort.signal.aborted)
          setError(
            cause instanceof Error ? cause.message : 'Unable to load files.',
          );
      });
    return () => abort.abort();
  }, [programmeId]);
  return (
    <div className="space-y-5 py-5">
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {!data ? (
        <p className="text-sm text-muted-foreground">
          Loading files and links…
        </p>
      ) : !data.length ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Attach files or links to a row, or submit work, to collect them here.
        </p>
      ) : (
        data.map((item) => (
          <section key={item.id} className="space-y-2 border-b pb-5">
            <Link
              href={item.href}
              className="text-sm font-medium hover:underline"
            >
              {item.title} →
            </Link>
            {item.files.map((file) => (
              <a
                key={file.id}
                href={file.href}
                download
                className="block break-words text-sm text-primary"
              >
                {file.name} ↓
              </a>
            ))}
            {item.links.map((link) => (
              <a
                key={link}
                href={link}
                target={link.startsWith('/') ? undefined : '_blank'}
                rel="noopener noreferrer"
                className="block break-all text-xs text-primary underline"
              >
                {link}
              </a>
            ))}
          </section>
        ))
      )}
    </div>
  );
}
