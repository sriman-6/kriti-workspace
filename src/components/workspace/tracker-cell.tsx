'use client';
import { useRef, useState } from 'react';
import { Pencil } from 'lucide-react';
export function TrackerCell({
  value,
  label,
  version,
  editable,
  type = 'text',
  options,
  onSave,
}: {
  value: string;
  label: string;
  version: number;
  editable: boolean;
  type?: 'text' | 'date' | 'number' | 'url';
  options?: { value: string; label: string }[];
  onSave: (value: string, version: number) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const startedVersion = useRef(version);
  const pending = useRef(false);
  const cancelled = useRef(false);
  function start() {
    setDraft(value);
    startedVersion.current = version;
    setError('');
    setEditing(true);
    cancelled.current = false;
  }
  async function commit(next = draft) {
    if (pending.current || cancelled.current) return;
    if (next === value) {
      setEditing(false);
      return;
    }
    pending.current = true;
    setSaving(true);
    setError('');
    try {
      await onSave(next, startedVersion.current);
      setEditing(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save.');
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }
  if (!editable)
    return (
      <span className="block min-w-20 whitespace-pre-wrap text-xs">
        {options?.find((option) => option.value === value)?.label ??
          (value || '—')}
      </span>
    );
  return (
    <div className="min-w-24 max-w-xs">
      {editing ? (
        options ? (
          <select
            aria-label={label}
            autoFocus
            disabled={saving}
            value={draft}
            className="h-8 w-full rounded border bg-background px-1 text-xs"
            onChange={(event) => {
              setDraft(event.target.value);
              void commit(event.target.value);
            }}
            onBlur={() => void commit()}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                cancelled.current = true;
                setEditing(false);
              }
            }}
          >
            {options.map((option) => (
              <option value={option.value} key={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            aria-label={label}
            type={type === 'url' ? 'text' : type}
            autoFocus
            disabled={saving}
            value={draft}
            maxLength={type === 'text' || type === 'url' ? 2000 : undefined}
            className="h-8 w-full rounded border border-primary bg-background px-2 text-xs outline-none"
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => void commit()}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void commit();
              }
              if (event.key === 'Escape') {
                cancelled.current = true;
                setEditing(false);
              }
            }}
          />
        )
      ) : (
        <button
          type="button"
          onClick={start}
          aria-label={label}
          className="group/cell flex min-h-8 w-full items-center justify-between gap-3 rounded px-1 text-left text-xs hover:bg-accent focus-visible:outline-2 focus-visible:outline-primary"
        >
          <span className="min-w-0 truncate">
            {options?.find((option) => option.value === value)?.label ??
              (value || '—')}
          </span>
          <Pencil className="size-3 shrink-0 text-muted-foreground opacity-0 group-hover/cell:opacity-100 group-focus-visible/cell:opacity-100" />
        </button>
      )}
      {saving ? (
        <span role="status" className="text-[10px] text-muted-foreground">
          Saving…
        </span>
      ) : null}
      {error ? (
        <p role="alert" className="mt-1 max-w-56 text-[10px] text-destructive">
          {error}{' '}
          <button className="underline" onClick={() => void commit()}>
            Retry
          </button>
        </p>
      ) : null}
    </div>
  );
}
