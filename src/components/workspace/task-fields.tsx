'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import type { TaskInput } from '@/lib/schemas/work';
import { WorkViewers } from './work-viewers';

const selectClass =
  'h-9 w-full rounded-md border border-input bg-background px-3 text-sm';
export function TaskFields({
  people,
  programmes,
  defaults,
  prefix = 'task',
  currentUserId,
  canAssignToOthers = true,
  ownProgrammeIds,
  delegateProgrammeIds,
  creatorId = currentUserId,
}: {
  people: { id: string; fullName: string }[];
  programmes: { id: string; name: string }[];
  defaults?: Partial<TaskInput>;
  prefix?: string;
  currentUserId: string;
  canAssignToOthers?: boolean;
  ownProgrammeIds: string[];
  delegateProgrammeIds: string[];
  creatorId?: string;
}) {
  const [ownerId, setOwnerId] = useState(defaults?.ownerId ?? currentUserId);
  const ownWork = ownerId === currentUserId;
  const reviewOptional = ownerId === creatorId;
  const availableProgrammes = programmes.filter((programme) =>
    (ownWork ? ownProgrammeIds : delegateProgrammeIds).includes(programme.id));
  return (
    <>
      {defaults?.trackerSheetId ? <input type="hidden" name="trackerSheetId" value={defaults.trackerSheetId} /> : null}
      <div className="space-y-1.5">
        <Label htmlFor={`${prefix}-title`}>Task</Label>
        <Input
          id={`${prefix}-title`}
          name="title"
          required
          minLength={3}
          maxLength={200}
          defaultValue={defaults?.title}
          placeholder="What needs to be done?"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${prefix}-description`}>Brief</Label>
        <Textarea
          id={`${prefix}-description`}
          name="description"
          maxLength={10000}
          defaultValue={defaults?.description}
          placeholder="Expected output and useful context"
          rows={3}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${prefix}-owner`}>Owner</Label>
          <select
            id={`${prefix}-owner`}
            name="ownerId"
            className={selectClass}
            value={ownerId}
            onChange={(event) => setOwnerId(event.target.value)}
            required
          >
            <option value="" disabled>
              Choose a person
            </option>
            {people.filter((person) => canAssignToOthers || person.id === currentUserId).map((person) => (
              <option key={person.id} value={person.id}>
                {person.fullName}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${prefix}-reviewer`}>Reviewer {reviewOptional ? '(optional)' : ''}</Label>
          <select
            id={`${prefix}-reviewer`}
            name="reviewerId"
            className={selectClass}
            key={ownerId}
            defaultValue={defaults?.reviewerId !== ownerId ? (defaults?.reviewerId ?? '') : ''}
            required={!reviewOptional}
          >
            <option value="" disabled={!reviewOptional}>
              {reviewOptional ? 'No review needed' : 'Choose a different person'}
            </option>
            {people.filter((person) => person.id !== ownerId).map((person) => (
              <option key={person.id} value={person.id}>
                {person.fullName}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${prefix}-programme`}>Programme</Label>
          <select
            id={`${prefix}-programme`}
            name="programmeId"
            className={selectClass}
            key={ownerId}
            defaultValue={availableProgrammes.some((programme) => programme.id === defaults?.programmeId) ? (defaults?.programmeId ?? '') : ''}
          >
            <option value="">{ownWork ? 'General KRITI work' : 'Direct assignment'}</option>
            {availableProgrammes.map((programme) => (
              <option key={programme.id} value={programme.id}>
                {programme.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${prefix}-due`}>
            Due date{' '}
            <span className="font-normal text-muted-foreground">
              (optional)
            </span>
          </Label>
          <Input
            id={`${prefix}-due`}
            name="dueOn"
            type="date"
            defaultValue={defaults?.dueOn ?? ''}
          />
        </div>
      </div>
      <details className="border-t border-border pt-4">
        <summary className="cursor-pointer text-sm font-medium">Who can see this work?</summary>
        <div className="mt-4"><WorkViewers people={people.filter((person) => person.id !== ownerId)} selected={defaults?.viewerIds} prefix={prefix} /></div>
      </details>
      <div className="space-y-1.5">
        <Label htmlFor={`${prefix}-priority`}>Priority</Label>
        <select
          id={`${prefix}-priority`}
          name="priority"
          className={selectClass}
          defaultValue={defaults?.priority ?? 'normal'}
        >
          <option value="normal">Normal</option>
          <option value="high">High</option>
        </select>
      </div>
    </>
  );
}
