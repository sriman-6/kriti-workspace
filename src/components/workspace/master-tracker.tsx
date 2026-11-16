'use client';
import Link from 'next/link';
import { useState } from 'react';
import { ArrowUpRight, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ChatPanel as SidePanel } from './chat-panel';
import { WorkForm } from './work-form';
import { PROGRAMME_NAME_MAX_LENGTH, TRACKER_STAGES } from '@/lib/tracker';
import type { getMasterTracker } from '@/lib/services/tracker';
import { programmeAction } from '@/app/(app)/work/actions';
const select = 'h-9 rounded-md border border-input bg-background px-2 text-sm';
export function MasterTracker({
  items,
  canCreate,
  showIdeas,
  ideas,
}: {
  items: Awaited<ReturnType<typeof getMasterTracker>>;
  canCreate: boolean;
  showIdeas: boolean;
  ideas: {
    id: string;
    title: string;
    initiativeId: string | null;
    updatedAt: string;
  }[];
}) {
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');
  const [view, setView] = useState('all');
  const [stage, setStage] = useState('');
  const rows = items.filter(
    (item) =>
      (view === 'all' ||
        (view === 'project'
          ? item.kind === 'project'
          : item.kind !== 'project')) &&
      (!stage || item.stage === stage) &&
      `${item.name} ${item.leads}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Master Tracker
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Programmes, projects and the work connected to them.
          </p>
        </div>
        {canCreate ? (
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" />
            New tracker
          </Button>
        ) : null}
      </header>
      <nav
        aria-label="Master tracker views"
        className="flex flex-wrap gap-5 border-b text-sm"
      >
        {[
          ['all', 'All'],
          ['programme', 'Programmes'],
          ['project', 'Projects'],
          ...(showIdeas ? [['ideas', 'Ideas']] : []),
        ].map(([value, label]) => (
          <button
            key={value}
            onClick={() => setView(value!)}
            aria-current={view === value ? 'page' : undefined}
            className={`border-b-2 pb-3 ${view === value ? 'border-primary font-medium' : 'border-transparent text-muted-foreground'}`}
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-48 max-w-sm flex-1">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input
            aria-label="Search trackers"
            className="pl-9"
            placeholder="Find a tracker or person…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        {view !== 'ideas' ? (
          <select
            aria-label="Filter tracker stage"
            className={select}
            value={stage}
            onChange={(event) => setStage(event.target.value)}
          >
            <option value="">All stages</option>
            {Object.entries(TRACKER_STAGES).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        ) : (
          <Button asChild variant="outline">
            <Link href="/ideas">Capture an idea</Link>
          </Button>
        )}
      </div>
      <div className="relative overflow-x-auto rounded-lg border">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-muted/30 text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">
                {view === 'ideas' ? 'Idea' : 'Programme / project'}
              </th>
              <th className="px-4 py-3 font-medium">Stage</th>
              {view !== 'ideas' ? (
                <>
                  <th className="px-4 py-3 font-medium">Lead / manager</th>
                  <th className="px-4 py-3 font-medium">Open work</th>
                </>
              ) : null}
              <th className="px-4 py-3 font-medium">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {view === 'ideas'
              ? ideas
                  .filter((idea) =>
                    idea.title.toLowerCase().includes(search.toLowerCase()),
                  )
                  .map((idea) => (
                    <tr key={idea.id} className="hover:bg-muted/30">
                      <td className="px-4 py-4">
                        <Link
                          className="font-medium hover:underline"
                          href={`/ideas/${idea.id}`}
                        >
                          {idea.title} ↗
                        </Link>
                      </td>
                      <td className="px-4 py-4 text-xs text-muted-foreground">
                        {idea.initiativeId ? 'Activated' : 'Idea'}
                      </td>
                      <td className="px-4 py-4 text-xs text-muted-foreground">
                        {new Date(idea.updatedAt).toLocaleDateString('en-IN', {
                          timeZone: 'Asia/Kolkata',
                        })}
                      </td>
                    </tr>
                  ))
              : rows.map((item) => (
                  <tr key={item.id} className="hover:bg-muted/30">
                    <td className="min-w-52 px-4 py-4">
                      <Link
                        href={`/programmes/${item.id}`}
                        className="flex max-w-xl items-start gap-2 font-medium hover:underline"
                      >
                        <span className="min-w-0 [overflow-wrap:anywhere]">{item.name}</span>
                        <ArrowUpRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                      </Link>
                      <span className="mt-1 block text-[11px] capitalize text-muted-foreground">
                        {item.kind} · {item.members} members
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-xs">
                      {TRACKER_STAGES[item.stage]}
                    </td>
                    <td className="max-w-xs px-4 py-4 text-xs text-muted-foreground">
                      {item.leads || 'Not assigned'}
                    </td>
                    <td className="px-4 py-4 text-xs">{item.openWork}</td>
                    <td className="whitespace-nowrap px-4 py-4 text-xs text-muted-foreground">
                      {new Date(item.updatedAt).toLocaleDateString('en-IN', {
                        timeZone: 'Asia/Kolkata',
                      })}
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
        {!(view === 'ideas'
          ? ideas.filter((idea) =>
              idea.title.toLowerCase().includes(search.toLowerCase()),
            ).length
          : rows.length) ? (
          <p className="px-4 py-12 text-center text-sm text-muted-foreground">
            {search || stage
              ? 'No matching trackers.'
              : view === 'ideas'
                ? 'Your private ideas and those shared with you appear here.'
                : 'Your programmes and projects will appear here.'}
          </p>
        ) : null}
      </div>
      <SidePanel title="New tracker" open={creating} onOpenChange={setCreating}>
        <div className="overflow-y-auto p-5">
          <WorkForm action={programmeAction} submitLabel="Create tracker">
            <Label htmlFor="new-tracker-name">Name</Label>
            <Textarea
              id="new-tracker-name"
              name="name"
              required
              minLength={3}
              maxLength={PROGRAMME_NAME_MAX_LENGTH}
              rows={3}
              autoFocus
            />
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="tracker-kind">Type</Label>
                <select
                  id="tracker-kind"
                  name="kind"
                  className={`${select} w-full`}
                >
                  <option value="programme">Programme</option>
                  <option value="project">Project</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="tracker-stage">Stage</Label>
                <select
                  id="tracker-stage"
                  name="stage"
                  defaultValue="planning"
                  className={`${select} w-full`}
                >
                  {Object.entries(TRACKER_STAGES).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <Label htmlFor="tracker-description">Description (optional)</Label>
            <Textarea
              id="tracker-description"
              name="description"
              rows={3}
              maxLength={2000}
            />
            <p className="text-xs text-muted-foreground">
              Add activities, tasks, documents and related trackers once this is
              created.
            </p>
          </WorkForm>
        </div>
      </SidePanel>
    </div>
  );
}
