import type { Metadata } from 'next';
import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { SearchParams } from '@/lib/page-params';
import { readParam } from '@/lib/page-params';

export const metadata: Metadata = { title: 'Access denied' };

/**
 * Shown when authentication succeeded but authorisation did not.
 *
 * The distinction matters to the person reading it: a BITS student who signs
 * in correctly and is simply not admin staff should not see anything that
 * looks like a failure on their part.
 */
const REASONS: Record<string, { title: string; body: string }> = {
  domain: {
    title: 'That Google account is not approved',
    body: 'Use your registered BITS account. External Google addresses need explicit approval for that exact account before they can sign in.',
  },
  not_authorised: {
    title: 'Your workspace access is not set up yet',
    body: 'Your Google identity is valid, but it is not registered in KRITI Workspace. Ask the Head, Program Head, Manager or Administrative Support to add your account.',
  },
  disabled: {
    title: 'This account has been disabled',
    body: 'Your workspace access has been turned off. Contact your workspace administrator if you believe this is a mistake.',
  },
};

const FALLBACK = {
  title: 'Access denied',
  body: 'You do not currently have access to KRITI Workspace.',
};

export default async function AccessDeniedPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}): Promise<React.JSX.Element> {
  const params = await searchParams;
  const reason = readParam(params, 'reason') ?? '';
  const email = readParam(params, 'email');

  const { title, body } = REASONS[reason] ?? FALLBACK;

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md">
        <CardContent className="space-y-5 p-6 text-center">
          <span
            className="mx-auto flex size-12 items-center justify-center rounded-xl bg-attention-surface"
            aria-hidden="true"
          >
            <ShieldAlert className="size-6 text-attention" />
          </span>

          <div className="space-y-2">
            <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
            <p className="text-sm text-balance text-muted-foreground">{body}</p>
          </div>

          {email ? (
            <p className="rounded-md bg-muted px-3 py-2 text-xs break-all text-muted-foreground">
              Signed in as {email}
            </p>
          ) : null}

          <div className="space-y-2">
            <Button asChild className="w-full">
              <Link href="/">Back to sign in</Link>
            </Button>
            <p className="text-xs text-muted-foreground">
              Need access? Ask the KRITI team to register your account.
            </p>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
