'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Search, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';

/**
 * The filter row above every index table (students, teams, sessions).
 *
 * Filters live in the URL, so a filtered list is a shareable link and the
 * browser's back button behaves the way people expect.
 *
 * One component rather than one per page: the debounce, the URL sync and the
 * "Clear" behaviour were previously copied three times, including the subtle
 * render-phase state adjustment below, which has to stay identical everywhere
 * or one page regresses.
 */

export type FilterSelect = {
  /** URL query key, e.g. `campus`. */
  key: string;
  /** Accessible name, e.g. "Filter by campus". */
  label: string;
  /** Label for the unfiltered option, e.g. "All campuses". */
  allLabel: string;
  options: { value: string; label: string }[];
  /** Width utility for this select, matching the original per-page sizing. */
  className?: string;
};

export function FilterBar({
  searchPlaceholder,
  searchLabel,
  selects,
  resultCount,
  resultNoun,
}: {
  /** Omit both search props on views that have no text search. */
  searchPlaceholder?: string;
  searchLabel?: string;
  selects: FilterSelect[];
  resultCount: number;
  /** Singular form; pluralised with a trailing "s". */
  resultNoun: string;
}): React.JSX.Element {
  const hasSearch = Boolean(searchPlaceholder && searchLabel);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = React.useTransition();

  const currentSearch = searchParams.get('q') ?? '';
  const [searchValue, setSearchValue] = React.useState(currentSearch);

  // Keep the input in step when navigation changes the query — for example
  // "Clear", or the back button. Adjusting state during render rather than in
  // an effect avoids a second render pass with stale text.
  const [syncedSearch, setSyncedSearch] = React.useState(currentSearch);
  if (syncedSearch !== currentSearch) {
    setSyncedSearch(currentSearch);
    setSearchValue(currentSearch);
  }

  const applyParam = React.useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value && value !== 'all') params.set(key, value);
      else params.delete(key);

      const query = params.toString();
      startTransition(() => {
        router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
      });
    },
    [pathname, router, searchParams],
  );

  // Debounce typing so each keystroke does not trigger a server round trip.
  React.useEffect(() => {
    if (searchValue === currentSearch) return;
    const timer = setTimeout(() => applyParam('q', searchValue), 250);
    return () => clearTimeout(timer);
  }, [searchValue, currentSearch, applyParam]);

  const hasFilters =
    Boolean(currentSearch) ||
    selects.some((select) => (searchParams.get(select.key) ?? 'all') !== 'all');

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        {hasSearch ? (
          <div className="relative flex-1 sm:max-w-xs">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchLabel}
              className="pl-8"
            />
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-2 sm:flex sm:w-auto">
          {selects.map((select) => (
            <Select
              key={select.key}
              value={searchParams.get(select.key) ?? 'all'}
              onChange={(event) => applyParam(select.key, event.target.value)}
              aria-label={select.label}
              className={select.className}
            >
              <option value="all">{select.allLabel}</option>
              {select.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          ))}
        </div>

        {hasFilters ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => startTransition(() => router.replace(pathname, { scroll: false }))}
          >
            <X className="size-4" />
            Clear
          </Button>
        ) : null}
      </div>

      <p className="text-xs text-muted-foreground" aria-live="polite" aria-atomic="true">
        {isPending
          ? 'Searching…'
          : `${resultCount} ${resultCount === 1 ? resultNoun : `${resultNoun}s`}`}
      </p>
    </div>
  );
}
