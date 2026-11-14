import * as React from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export type StatTone = 'neutral' | 'positive' | 'attention' | 'critical';

const TONE_CLASSES: Record<StatTone, string> = {
  neutral: 'text-foreground',
  positive: 'text-positive',
  attention: 'text-attention',
  critical: 'text-critical',
};

/**
 * A dashboard KPI. Every tile links to the filtered table behind it, so a
 * number is never a dead end.
 */
export function StatCard({
  label,
  value,
  context,
  tone = 'neutral',
  href,
}: {
  label: string;
  value: string | number;
  context?: string;
  tone?: StatTone;
  href?: string;
}): React.JSX.Element {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
        {href ? (
          <ArrowRight
            className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
            aria-hidden="true"
          />
        ) : null}
      </div>
      <p className={cn('tabular mt-2 text-2xl font-semibold', TONE_CLASSES[tone])}>{value}</p>
      {context ? <p className="mt-1 text-xs text-muted-foreground">{context}</p> : null}
    </>
  );

  if (href) {
    return (
      <Card className="group transition-colors hover:border-foreground/20 hover:bg-accent/40">
        <Link href={href} className="block p-4">
          {body}
        </Link>
      </Card>
    );
  }

  return <Card className="p-4">{body}</Card>;
}
