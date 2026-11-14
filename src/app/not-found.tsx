import Link from 'next/link';

import { Button } from '@/components/ui/button';

export default function NotFound(): React.JSX.Element {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="max-w-md space-y-4 text-center">
        <p className="tabular font-mono text-sm text-muted-foreground">404</p>
        <h1 className="text-lg font-semibold tracking-tight">Page not found</h1>
        <p className="text-sm text-muted-foreground">
          That page does not exist, or it belongs to a part of the programme you cannot access.
        </p>
        <Button asChild>
          <Link href="/dashboard">Back to overview</Link>
        </Button>
      </div>
    </main>
  );
}
