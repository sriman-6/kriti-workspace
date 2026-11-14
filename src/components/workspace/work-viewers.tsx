'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';

export function WorkViewers({ people, selected = [], prefix = 'work' }: {
  people: { id: string; fullName: string }[];
  selected?: string[];
  prefix?: string;
}) {
  const [search, setSearch] = useState('');
  const query = search.trim().toLowerCase();
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium">Share with people</legend>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Selected members can follow this work and open its files and updates.
        The owner, creator and reviewer keep access. Head KRITI can see all official
        work; programme leads, managers, reviewers and advisers can see work in their programmes.
        Sharing does not give permission to edit, submit or review the work.
      </p>
      <Input
        type="search"
        aria-label="Find members to share with"
        placeholder="Find a KRITI member"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border border-border p-3">
        {people.map((person) => (
          <label key={person.id} htmlFor={`${prefix}-viewer-${person.id}`}
            hidden={Boolean(query && !person.fullName.toLowerCase().includes(query))}
            className="items-center gap-2 text-sm not-[hidden]:flex">
            <input type="checkbox" id={`${prefix}-viewer-${person.id}`} name="viewerIds"
              value={person.id} defaultChecked={selected.includes(person.id)} />
            {person.fullName}
          </label>
        ))}
        {!people.some((person) => person.fullName.toLowerCase().includes(query)) ?
          <p className="text-xs text-muted-foreground">No matching members.</p> : null}
      </div>
    </fieldset>
  );
}
