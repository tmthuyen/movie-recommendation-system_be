import { MovieGridSkeleton } from '@/components/movie/movie-grid';
import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="w-full space-y-6 pb-10">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>

      <Skeleton className="h-20 w-full rounded-xl" />

      <MovieGridSkeleton items={12} />
    </div>
  );
}
