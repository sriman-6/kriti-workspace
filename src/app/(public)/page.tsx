import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { readParam, type SearchParams } from '@/lib/page-params';
import { AdminSignIn } from './admin-sign-in';

export const metadata = { title: 'KRITI Workspace' };
export default async function LandingPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  if (await getCurrentUser()) redirect('/dashboard');
  const params = await searchParams;
  return (
    <main className="flex min-h-dvh items-center justify-center px-5 py-16">
      <div className="w-full max-w-sm space-y-8">
        <header>
          <div
            className="mb-7 flex size-10 items-center justify-center rounded-lg bg-primary text-lg font-semibold text-primary-foreground"
            aria-hidden
          >
            K
          </div>
          <p className="text-xs font-medium tracking-widest text-muted-foreground">
            KRITI · BITS PILANI
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            Work, together.
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Your assignments, programmes and shared progress, in one workspace.
          </p>
        </header>
        <AdminSignIn error={readParam(params, 'error')} />
        <p className="text-xs leading-relaxed text-muted-foreground">
          Sign in with your registered Google account. Your responsibilities
          determine what you can see and do.
        </p>
      </div>
    </main>
  );
}
