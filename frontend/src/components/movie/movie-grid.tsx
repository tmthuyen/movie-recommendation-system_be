'use client';

import { MotionReveal, MotionStagger } from '@/components/motion/motion-primitives';
import { Skeleton } from '@/components/ui/skeleton';
import { Movie } from '@/shared/types/movie.types';
import { MovieCard } from './movie-card';

/** Class grid dùng chung cho danh sách phim. */
const MOVIE_GRID_CLASS = 'grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 md:gap-4';

interface MovieGridProps {
  movies: Movie[];
  /**
   * Kiểu animation của grid.
   * `stagger`: stagger toàn bộ grid khi mount.
   * `reveal`: mỗi card fade-up khi vào viewport.
   */
  motion?: 'stagger' | 'reveal';
}

export function MovieGrid({ movies, motion = 'stagger' }: MovieGridProps) {
  if (motion === 'reveal') {
    return (
      <div className={MOVIE_GRID_CLASS}>
        {movies.map((movie, index) => (
          <MotionReveal key={movie.id} index={index % 12} when="in-view" className="h-full min-w-0">
            <MovieCard movie={movie} />
          </MotionReveal>
        ))}
      </div>
    );
  }

  return (
    <MotionStagger when="mount" className={MOVIE_GRID_CLASS}>
      {movies.map((movie) => (
        <MovieCard key={movie.id} movie={movie} />
      ))}
    </MotionStagger>
  );
}

export function MovieGridSkeleton({ items = 12 }: { items?: number }) {
  return (
    <div className={MOVIE_GRID_CLASS}>
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
