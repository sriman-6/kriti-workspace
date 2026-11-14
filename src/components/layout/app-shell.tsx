'use client';

import * as React from 'react';
import Link from 'next/link';
import { LogOut, Menu, X } from 'lucide-react';

import { SidebarNav } from './sidebar-nav';
import { ThemeToggle } from './theme-toggle';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  CAMPUS_LABELS,
  USER_ROLE_LABELS,
  type Campus,
  type UserRole,
} from '@/lib/constants';
import { initials } from '@/lib/format';
import { WORKSPACE_ROLE_LABELS, type WorkspaceRole } from '@/lib/workspace';

export type ShellUser = {
  fullName: string;
  email: string;
  role: UserRole;
  campus: Campus | null;
  workspaceRole?: WorkspaceRole | null;
};

/**
 * Application chrome: a fixed sidebar on desktop, a slide-over on mobile.
 */
export function AppShell({
  user,
  signOutAction,
  children,
}: {
  user: ShellUser;
  signOutAction: () => Promise<void>;
  children: React.ReactNode;
}): React.JSX.Element {
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);
  const signOutFormRef = React.useRef<HTMLFormElement>(null);

  const scopeLabel = user.campus ? CAMPUS_LABELS[user.campus] : 'KRITI';

  return (
    <div className="min-h-dvh bg-background">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-foreground"
      >
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-border bg-card lg:flex">
        <SidebarBrand />
        <div className="flex-1 overflow-y-auto">
          <SidebarNav />
        </div>
      </aside>

      {/* Mobile slide-over */}
      {mobileNavOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside className="relative flex h-full w-64 flex-col border-r border-border bg-card">
            <div className="flex items-center justify-between">
              <SidebarBrand />
              <Button
                variant="ghost"
                size="icon-sm"
                className="mr-2"
                onClick={() => setMobileNavOpen(false)}
                aria-label="Close navigation"
              >
                <X className="size-4" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <SidebarNav onNavigate={() => setMobileNavOpen(false)} />
            </div>
          </aside>
        </div>
      ) : null}

      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border bg-background/95 px-4 backdrop-blur-sm sm:px-6">
          <Button
            variant="ghost"
            size="icon-sm"
            className="lg:hidden"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open navigation"
          >
            <Menu className="size-4" />
          </Button>

          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-2 pr-2 pl-1.5"
                  aria-label={`Account menu for ${user.fullName}`}
                >
                  <span
                    className="flex size-6 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground"
                    aria-hidden="true"
                  >
                    {initials(user.fullName)}
                  </span>
                  <span className="hidden max-w-32 truncate sm:inline">
                    {user.fullName}
                  </span>
                </Button>
              </DropdownMenuTrigger>

              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel className="font-normal">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {user.fullName}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {user.email}
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="font-normal">
                  <span className="block text-xs text-muted-foreground">
                    {user.workspaceRole
                      ? WORKSPACE_ROLE_LABELS[user.workspaceRole]
                      : USER_ROLE_LABELS[user.role]}{' '}
                    · {scopeLabel}
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {/*
                  The form sits outside the menu item on purpose. Nested inside
                  it, Radix closes the menu on click and unmounts the form
                  mid-submit, so sign-out silently did nothing. `onSelect`
                  submits it explicitly instead, and `preventDefault` keeps the
                  menu mounted long enough for the request to leave.
                */}
                <form
                  ref={signOutFormRef}
                  action={signOutAction}
                  className="hidden"
                />
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault();
                    signOutFormRef.current?.requestSubmit();
                  }}
                >
                  <LogOut className="size-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main id="main-content" className="px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}

function SidebarBrand(): React.JSX.Element {
  return (
    <Link
      href="/dashboard"
      className="flex h-14 items-center gap-2.5 border-b border-border px-4 transition-colors hover:bg-accent/40"
    >
      <span
        className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground"
        aria-hidden="true"
      >
        K
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm leading-tight font-semibold">
          KRITI
        </span>
        <span className="block truncate text-[11px] leading-tight text-muted-foreground">
          Workspace
        </span>
      </span>
    </Link>
  );
}
