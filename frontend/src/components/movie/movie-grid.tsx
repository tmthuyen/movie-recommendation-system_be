'use client';

import { MotionStagger } from '@/components/motion/motion-primitives';
import { Skeleton } from '@/components/ui/skeleton';
import { Movie } from '@/shared/types/movie.types';
import { MovieCard } from './movie-card';

interface MovieGridProps {
  movies: Movie[];
}

export function MovieGrid({ movies }: MovieGridProps) {
  return (
    <MotionStagger
      when="mount"
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 md:gap-4"
    >
      {movies.map((movie) => (
        <MovieCard key={movie.id} movie={movie} />
      ))}
    </MotionStagger>
  );
}

export function MovieGridSkeleton({ items = 12 }: { items?: number }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 md:gap-4">
      {Array.from({ length: items }).map((_, index) => (
        <div key={index} className="flex flex-col overflow-hidden rounded-lg border">
          <Skeleton className="aspect-[6/3] w-full rounded-none" />
          <div className="flex flex-col gap-2 p-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}
