'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDownUp,
  ArrowUpRight,
  ChevronDown,
  Columns3,
  FileText,
  History,
  MoreHorizontal,
  Plus,
  Search,
  Settings2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChatPanel as SidePanel } from './chat-panel';
import { TrackerCell } from './tracker-cell';
import { TrackerRowEditor } from './tracker-row-editor';
import {
  TrackerHistory,
  TrackerResources,
  TrackerSettings,
} from './tracker-panels';
import { ROW_STATUSES, TRACKER_KINDS, TRACKER_STAGES } from '@/lib/tracker';
import { WORK_STATUS_LABELS } from '@/lib/workspace';
import { trackerRequest } from '@/lib/client/tracker-request';
import type { TrackerDetail, TrackerRecord } from '@/lib/services/tracker';

const select = 'h-9 rounded-md border border-input bg-background px-2 text-xs';
const builtin = [
  { id: 'kind', label: 'Type' },
  { id: 'status', label: 'Status' },
  { id: 'owner', label: 'Responsible person' },
  { id: 'date', label: 'Date' },
  { id: 'links', label: 'Links & files' },
];
export function TrackerWorkspace({
  initial,
  people,
  userId,
}: {
  initial: TrackerDetail;
  people: { id: string; fullName: string }[];
  userId: string;
}) {
  const router = useRouter();
  const [detail, setDetail] = useState(initial);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('updated');
  const [page, setPage] = useState(0);
  const [archived, setArchived] = useState(false);
  const [tab, setTab] = useState('tracker');
  const [hidden, setHidden] = useState<string[]>([]);
  const [panel, setPanel] = useState<
    'row' | 'settings' | 'columns' | 'sheet' | 'history' | null
  >(null);
  const [selected, setSelected] = useState<TrackerRecord | null>(null);
  const [historyRow, setHistoryRow] = useState<string>();
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const sequence = useRef(0);
  const programmeId = detail.programme.id;
  const sheetId = detail.sheet?.id ?? null;
  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    const response = await fetch(
      `/api/trackers/${initial.programme.id}${initial.sheet ? `?sheet=${initial.sheet.id}` : ''}`,
      { cache: 'no-store' },
    );
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.data)
      throw new Error(
        body?.error ?? 'Unable to refresh. Your draft is still here.',
      );
    if (request === sequence.current) setDetail(body.data);
  }, [initial.programme.id, initial.sheet]);
  useEffect(() => {
    let active = true;
    const update = () => {
      if (document.visibilityState === 'visible')
        void refresh().catch((cause) => {
          if (active)
            setError(
              cause instanceof Error ? cause.message : 'Unable to refresh.',
            );
        });
    };
    const timer = setInterval(update, 15000);
    window.addEventListener('focus', update);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener('focus', update);
    };
  }, [refresh]);
  async function run(input: object) {
    setError('');
    setStatus('Saving…');
    try {
      const result = await trackerRequest(programmeId, input);
      await refresh();
      setStatus('Saved');
      return result;
    } catch (cause) {
      setStatus('');
      throw cause;
    }
  }
  async function cell(
    row: TrackerRecord,
    field: string,
    value: string,
    version: number,
  ) {
    const data = {
      id: row.id,
      sheetId: row.sheetId,
      version,
      title: row.title,
      kind: row.kind,
      status: row.status,
      ownerId: row.ownerId,
      eventOn: row.eventOn,
      notes: row.notes,
      links: row.links,
      values: row.values,
      uploadIds: [],
    };
    if (field.startsWith('custom:'))
      data.values = { ...row.values, [field.slice(7)]: value };
    else
      Object.assign(data, {
        [field]:
          field === 'ownerId' || field === 'eventOn' ? value || null : value,
      });
    await run({ operation: 'save', row: data });
  }
  function openRow(row: TrackerRecord | null) {
    setSelected(row);
    setPanel('row');
  }
  const records = detail.rows
    .filter((row) => row.isArchived === archived)
    .map((row) => ({
      id: row.id,
      title: row.title,
      kind: row.kind,
      status: row.status,
      owner:
        detail.members.find((person) => person.id === row.ownerId)?.fullName ??
        '',
      date: row.eventOn ?? '',
      updatedAt: row.updatedAt,
      row,
      task: null,
    }));
  const tasks = !archived
    ? detail.tasks.map((task) => ({
        id: task.id,
        title: task.title,
        kind: 'task',
        status: task.status,
        owner: task.ownerName,
        date: task.dueOn ?? '',
        updatedAt: task.updatedAt,
        row: null,
        task,
      }))
    : [];
  const all = [...records, ...tasks]
    .filter(
      (item) =>
        (filter === 'all' || item.kind === filter) &&
        `${item.title} ${item.owner} ${item.row?.notes ?? ''} ${item.row?.links.join(' ') ?? ''} ${Object.values(item.row?.values ?? {}).join(' ')}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort((a, b) =>
      sort === 'title'
        ? a.title.localeCompare(b.title)
        : sort === 'date'
          ? a.date.localeCompare(b.date)
          : b.updatedAt.localeCompare(a.updatedAt),
    );
  const pages = Math.max(1, Math.ceil(all.length / 25));
  const current = Math.min(page, pages - 1);
  const rows = all.slice(current * 25, current * 25 + 25);
  const visible = (id: string) => !hidden.includes(id);
  const taskHref = `/work/new?programme=${programmeId}${sheetId ? `&sheet=${sheetId}` : ''}`;
  const statuses = Object.entries(ROW_STATUSES).map(([value, label]) => ({
    value,
    label,
  }));
  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 max-w-full">
            <Link
              href="/programmes"
              className="text-xs text-muted-foreground hover:underline"
            >
              ← Master Tracker
            </Link>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h1 className="min-w-0 max-w-full text-xl font-semibold [overflow-wrap:anywhere]">
                {detail.programme.name}
              </h1>
              <span className="rounded-full bg-muted px-2 py-1 text-[10px]">
                {TRACKER_STAGES[detail.programme.stage]}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Tracker history"
              title="History"
              onClick={() => {
                setHistoryRow(undefined);
                setPanel('history');
              }}
            >
              <History className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="About and people"
              title="About and people"
              onClick={() => setPanel('settings')}
            >
              <Settings2 className="size-4" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm">
                  <Plus className="size-4" />
                  Add
                  <ChevronDown className="size-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => openRow(null)}>
                  Add row
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href={taskHref}>Create task</Link>
                </DropdownMenuItem>
                {detail.canManage ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => setPanel('sheet')}>
                      Add related tracker
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Link
            href={`/programmes/${programmeId}`}
            className={
              sheetId ? 'text-muted-foreground hover:underline' : 'font-medium'
            }
          >
            Main tracker
          </Link>
          {detail.sheet ? (
            <>
              <span className="text-muted-foreground">/</span>
              {detail.sheet.parentId ? (
                <>
                  <Link
                    href={`/programmes/${programmeId}?sheet=${detail.sheet.parentId}`}
                    className="text-muted-foreground hover:underline"
                  >
                    Parent tracker
                  </Link>
                  <span>/</span>
                </>
              ) : null}
              <span className="font-medium">{detail.sheet.name}</span>
            </>
          ) : null}
          {detail.sheets.length ? (
            <select
              aria-label="Open related tracker"
              className="ml-auto max-w-52 rounded border bg-background px-2 py-1 text-xs"
              value={sheetId ?? ''}
              onChange={(event) =>
                router.push(
                  `/programmes/${programmeId}${event.target.value ? `?sheet=${event.target.value}` : ''}`,
                )
              }
            >
              <option value="">Main tracker</option>
              {detail.sheets.map((sheet) => (
                <option key={sheet.id} value={sheet.id}>
                  {sheet.name}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      </header>
      <nav aria-label="Tracker views" className="flex gap-5 border-b text-sm">
        {[
          ['tracker', 'Tracker'],
          ['resources', 'Files & links'],
        ].map(([value, label]) => (
          <button
            key={value}
            onClick={() => setTab(value!)}
            className={`border-b-2 pb-3 ${tab === value ? 'border-primary font-medium' : 'border-transparent text-muted-foreground'}`}
          >
            {label}
          </button>
        ))}
      </nav>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      {tab === 'resources' ? (
        <TrackerResources programmeId={programmeId} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-40 max-w-sm flex-1">
              <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
              <Input
                aria-label="Search tracker rows"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(0);
                }}
                placeholder="Search this tracker…"
                className="pl-9"
              />
            </div>
            <select
              aria-label="Filter row type"
              className={select}
              value={filter}
              onChange={(event) => {
                setFilter(event.target.value);
                setPage(0);
              }}
            >
              <option value="all">All types</option>
              <option value="task">Tasks</option>
              {Object.entries(TRACKER_KINDS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <select
              aria-label="Sort tracker rows"
              className={select}
              value={sort}
              onChange={(event) => setSort(event.target.value)}
            >
              <option value="updated">Recently updated</option>
              <option value="title">Name A–Z</option>
              <option value="date">Date</option>
            </select>
            <Button
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={() => setPanel('columns')}
            >
              <Columns3 className="size-3.5" />
              Columns
            </Button>
            <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={archived}
                onChange={(event) => {
                  setArchived(event.target.checked);
                  setPage(0);
                }}
              />
              Archived rows
            </label>
            <span role="status" className="text-[11px] text-muted-foreground">
              {status}
            </span>
          </div>
          <div className="relative overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b bg-muted/30 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-3 font-medium">
                    <button
                      className="flex items-center gap-2"
                      onClick={() => setSort('title')}
                    >
                      Item
                      <ArrowDownUp className="size-3" />
                    </button>
                  </th>
                  {builtin
                    .filter((column) => visible(column.id))
                    .map((column) => (
                      <th
                        key={column.id}
                        className="whitespace-nowrap px-3 py-3 font-medium"
                      >
                        {column.label}
                      </th>
                    ))}
                  {detail.columns
                    .filter((column) => visible(column.id))
                    .map((column) => (
                      <th
                        key={column.id}
                        className="whitespace-nowrap px-3 py-3 font-medium"
                      >
                        {column.label}
                      </th>
                    ))}
                  <th className="w-10">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((item) => (
                  <tr
                    key={item.id}
                    className={`group hover:bg-muted/20 ${archived ? 'opacity-70' : ''}`}
                  >
                    <td className="min-w-56 max-w-80 px-3 py-2.5">
                      <div className="flex items-center gap-1">
                        {item.task ? (
                          <Link
                            href={`/work/${item.id}`}
                            className="font-medium hover:underline"
                          >
                            {item.title}
                          </Link>
                        ) : item.row?.linkedSheetId ? (
                          <Link
                            href={`/programmes/${programmeId}?sheet=${item.row.linkedSheetId}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {item.title}
                            <ArrowUpRight className="ml-1 inline size-3" />
                          </Link>
                        ) : (
                          <button
                            className="text-left font-medium hover:underline"
                            onClick={() => openRow(item.row)}
                          >
                            {item.title}
                          </button>
                        )}
                      </div>
                    </td>
                    {visible('kind') ? (
                      <td className="whitespace-nowrap px-3 py-2 text-[11px] text-muted-foreground">
                        {item.task
                          ? 'Task'
                          : TRACKER_KINDS[
                              item.kind as keyof typeof TRACKER_KINDS
                            ]}
                      </td>
                    ) : null}
                    {visible('status') ? (
                      <td className="px-2 py-2">
                        {item.row ? (
                          <TrackerCell
                            label={`Edit status for ${item.title}`}
                            value={item.status}
                            version={item.row.version}
                            editable={item.row.editable && !archived}
                            options={statuses}
                            onSave={(value, version) =>
                              cell(item.row!, 'status', value, version)
                            }
                          />
                        ) : (
                          <span className="text-xs">
                            {
                              WORK_STATUS_LABELS[
                                item.status as keyof typeof WORK_STATUS_LABELS
                              ]
                            }
                          </span>
                        )}
                      </td>
                    ) : null}
                    {visible('owner') ? (
                      <td className="px-2 py-2">
                        {item.row ? (
                          <TrackerCell
                            label={`Edit responsible person for ${item.title}`}
                            value={item.row.ownerId ?? ''}
                            version={item.row.version}
                            editable={item.row.editable && !archived}
                            options={[
                              { value: '', label: 'Unassigned' },
                              ...detail.members
                                .filter(
                                  (person) =>
                                    detail.canManage ||
                                    person.id === userId ||
                                    person.id === item.row?.ownerId,
                                )
                                .map((person) => ({
                                  value: person.id,
                                  label: person.fullName,
                                })),
                            ]}
                            onSave={(value, version) =>
                              cell(item.row!, 'ownerId', value, version)
                            }
                          />
                        ) : (
                          <span className="text-xs">{item.owner}</span>
                        )}
                      </td>
                    ) : null}
                    {visible('date') ? (
                      <td className="px-2 py-2">
                        {item.row ? (
                          <TrackerCell
                            label={`Edit date for ${item.title}`}
                            value={item.date}
                            version={item.row.version}
                            editable={item.row.editable && !archived}
                            type="date"
                            onSave={(value, version) =>
                              cell(item.row!, 'eventOn', value, version)
                            }
                          />
                        ) : (
                          <span className="whitespace-nowrap text-xs">
                            {item.date || '—'}
                          </span>
                        )}
                      </td>
                    ) : null}
                    {visible('links') ? (
                      <td className="max-w-48 px-3 py-2 text-xs">
                        {item.task ? (
                          <Link
                            href={`/work/${item.id}`}
                            className="text-primary hover:underline"
                          >
                            Open work ↗
                          </Link>
                        ) : (
                          <div className="space-y-1">
                            {item.row?.links[0] ? (
                              <a
                                className="block max-w-40 truncate text-primary hover:underline"
                                href={item.row.links[0]}
                                target={
                                  item.row.links[0].startsWith('/')
                                    ? undefined
                                    : '_blank'
                                }
                                rel="noopener noreferrer"
                              >
                                {item.row.links[0].startsWith('/')
                                  ? 'Workspace link ↗'
                                  : new URL(item.row.links[0]).hostname + ' ↗'}
                              </a>
                            ) : null}
                            {item.row &&
                            (item.row.files.length ||
                              item.row.links.length > 1) ? (
                              <button
                                onClick={() => openRow(item.row)}
                                className="flex items-center gap-1 text-muted-foreground hover:underline"
                              >
                                <FileText className="size-3" />
                                {item.row.files.length} files ·{' '}
                                {item.row.links.length} links
                              </button>
                            ) : null}
                            {!item.row?.files.length &&
                            !item.row?.links.length ? (
                              <button
                                className="text-muted-foreground hover:underline"
                                onClick={() => openRow(item.row)}
                              >
                                Add / view links
                              </button>
                            ) : null}
                          </div>
                        )}
                      </td>
                    ) : null}
                    {detail.columns
                      .filter((column) => visible(column.id))
                      .map((column) => (
                        <td key={column.id} className="px-2 py-2">
                          {item.row ? (
                            <TrackerCell
                              label={`Edit ${column.label} for ${item.title}`}
                              value={item.row.values[column.id] ?? ''}
                              version={item.row.version}
                              editable={item.row.editable && !archived}
                              type={column.type}
                              onSave={(value, version) =>
                                cell(
                                  item.row!,
                                  `custom:${column.id}`,
                                  value,
                                  version,
                                )
                              }
                            />
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              —
                            </span>
                          )}
                        </td>
                      ))}
                    <td className="px-1 py-2">
                      {item.row ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Actions for ${item.title}`}
                            >
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onSelect={() => openRow(item.row)}
                            >
                              {item.row.editable ? 'Edit row' : 'View row'}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() => {
                                setHistoryRow(item.id);
                                setPanel('history');
                              }}
                            >
                              History
                            </DropdownMenuItem>
                            {item.row.editable ? (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onSelect={() => {
                                    void run({
                                      operation: 'archive',
                                      id: item.id,
                                      version: item.row!.version,
                                      archive: !archived,
                                    }).catch((cause) =>
                                      setError(
                                        cause instanceof Error
                                          ? cause.message
                                          : 'Unable to archive.',
                                      ),
                                    );
                                  }}
                                >
                                  {archived ? 'Restore row' : 'Archive row'}
                                </DropdownMenuItem>
                              </>
                            ) : null}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length ? (
              <div className="space-y-3 px-4 py-14 text-center">
                <p className="text-sm text-muted-foreground">
                  {search || filter !== 'all'
                    ? 'No matching rows.'
                    : archived
                      ? 'No archived rows.'
                      : 'Add your first activity, milestone or document link.'}
                </p>
                {!archived && !search ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openRow(null)}
                  >
                    <Plus className="size-3" />
                    Add row
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
          <footer className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>
              {all.length} {all.length === 1 ? 'row' : 'rows'}
            </span>
            <span className="hidden sm:inline">
              Task rows use the same assignments shown in My Work.
            </span>
            {pages > 1 ? (
              <div className="ml-auto flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!current}
                  onClick={() => setPage(current - 1)}
                >
                  Previous
                </Button>
                <span>
                  {current + 1} / {pages}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={current + 1 >= pages}
                  onClick={() => setPage(current + 1)}
                >
                  Next
                </Button>
              </div>
            ) : null}
          </footer>
        </>
      )}
      <SidePanel
        title={selected ? 'Row details' : 'Add row'}
        open={panel === 'row'}
        onOpenChange={(open) => {
          if (!open) setPanel(null);
        }}
      >
        {panel === 'row' ? (
          <TrackerRowEditor
            key={selected?.id ?? 'new'}
            programmeId={programmeId}
            sheetId={sheetId}
            row={selected}
            members={detail.members}
            columns={detail.columns}
            userId={userId}
            canManage={detail.canManage}
            onSaved={async () => {
              await refresh();
              setStatus('Saved');
              setPanel(null);
            }}
            onHistory={(id) => {
              setHistoryRow(id);
              setPanel('history');
            }}
          />
        ) : null}
      </SidePanel>
      <SidePanel
        title="About & people"
        open={panel === 'settings'}
        onOpenChange={(open) => {
          if (!open) setPanel(null);
        }}
      >
        {panel === 'settings' ? (
          <TrackerSettings detail={detail} people={people} onSaved={refresh} />
        ) : null}
      </SidePanel>
      <SidePanel
        title="Change history"
        open={panel === 'history'}
        onOpenChange={(open) => {
          if (!open) setPanel(null);
        }}
      >
        {panel === 'history' ? (
          <TrackerHistory
            key={historyRow ?? 'all'}
            programmeId={programmeId}
            rowId={historyRow}
          />
        ) : null}
      </SidePanel>
      <SidePanel
        title="Columns"
        open={panel === 'columns'}
        onOpenChange={(open) => {
          if (!open) setPanel(null);
        }}
      >
        <div className="space-y-6 overflow-y-auto p-5">
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Choose the columns visible in this view.
            </p>
            {[...builtin, ...detail.columns].map((column) => (
              <label
                key={column.id}
                className="flex items-center gap-3 text-sm"
              >
                <input
                  type="checkbox"
                  checked={visible(column.id)}
                  onChange={() =>
                    setHidden(
                      hidden.includes(column.id)
                        ? hidden.filter((id) => id !== column.id)
                        : [...hidden, column.id],
                    )
                  }
                />
                {column.label}
              </label>
            ))}
          </div>
          {detail.canManage ? (
            <form
              className="space-y-3 border-t pt-4"
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                setBusy(true);
                void run({
                  operation: 'column',
                  sheetId,
                  column: { label: data.get('label'), type: data.get('type') },
                  version: detail.sheet?.version ?? detail.programme.version,
                })
                  .then(() => setPanel(null))
                  .catch((cause) =>
                    setError(
                      cause instanceof Error
                        ? cause.message
                        : 'Unable to add column.',
                    ),
                  )
                  .finally(() => setBusy(false));
              }}
            >
              <Label htmlFor="column-label">New column</Label>
              <Input
                id="column-label"
                name="label"
                required
                maxLength={50}
                placeholder="For example, Version or Location"
              />
              <Label htmlFor="column-type">Value type</Label>
              <select
                id="column-type"
                name="type"
                className={`${select} w-full`}
              >
                <option value="text">Text</option>
                <option value="date">Date</option>
                <option value="number">Number</option>
                <option value="url">Link</option>
              </select>
              <Button size="sm" disabled={busy}>
                Add column
              </Button>
            </form>
          ) : null}
          {error ? (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      </SidePanel>
      <SidePanel
        title="Add related tracker"
        open={panel === 'sheet'}
        onOpenChange={(open) => {
          if (!open) setPanel(null);
        }}
      >
        <form
          className="space-y-4 p-5"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            setBusy(true);
            void run({
              operation: 'sheet',
              name: data.get('name'),
              parentId: sheetId,
            })
              .then((result) => {
                setPanel(null);
                router.push(
                  `/programmes/${programmeId}?sheet=${result.sheetId}`,
                );
              })
              .catch((cause) =>
                setError(
                  cause instanceof Error
                    ? cause.message
                    : 'Unable to create tracker.',
                ),
              )
              .finally(() => setBusy(false));
          }}
        >
          <Label htmlFor="sheet-name">Tracker name</Label>
          <Input
            id="sheet-name"
            name="name"
            required
            maxLength={120}
            placeholder="For example, Visits or Website releases"
          />
          <p className="text-xs text-muted-foreground">
            Creates a related tracker and a linked row in the current table.
          </p>
          {error ? (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          ) : null}
          <Button disabled={busy}>Create related tracker</Button>
        </form>
      </SidePanel>
    </div>
  );
}
