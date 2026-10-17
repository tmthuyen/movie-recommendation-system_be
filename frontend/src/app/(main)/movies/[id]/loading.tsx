import { Skeleton } from '@/components/ui/skeleton';

/** Loading state cho route `/movies/[id]` (khi server render suspense). */
export default function MovieDetailLoading() {
  return (
    <div className="w-full space-y-6 pb-10" aria-hidden="true">
      <Skeleton className="h-5 w-64" />
      <div className="grid gap-6 rounded-2xl border bg-card p-6 md:grid-cols-[280px_1fr] md:p-8">
        <Skeleton className="aspect-[2/3] w-full rounded-xl" />
        <div className="space-y-4">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
          <div className="flex gap-2">
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-6 w-24 rounded-full" />
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="size-11 rounded-full" />
            <Skeleton className="size-11 rounded-full" />
            <Skeleton className="size-11 rounded-full" />
          </div>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-4/6" />
        </div>
      </div>
      <Skeleton className="h-24 w-full rounded-xl" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}
