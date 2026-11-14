import { Skeleton } from '@/components/ui/skeleton';
export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl space-y-6" aria-label="Loading work">
      <Skeleton className="h-8 w-40" />
      {[1, 2, 3].map((key) => (
        <Skeleton key={key} className="h-20 w-full" />
      ))}
    </div>
  );
}
