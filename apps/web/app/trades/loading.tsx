import { Skeleton } from '@/components/ui/skeleton';

/** Shown on first navigation to the route, before the page shell renders. */
export default function TradesLoading() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-7 w-32" />
      <Skeleton className="h-9 w-full max-w-3xl" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-[5.5rem] rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-40 rounded-lg" />
    </div>
  );
}
