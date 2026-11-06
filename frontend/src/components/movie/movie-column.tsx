import { Movie } from '@/shared/types/movie.types';
import { MotionStagger } from '@/components/motion/motion-primitives';

import { MovieCard } from '@/components/movie/movie-card';
import { EmptyState } from '@/components/common/EmptyState';
import { Sparkles } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Movie Column infinite scroll
 */
interface MovieColumnProps {
  movies: Movie[];
}

/**
 * Nếu không có phim thì trả trạng thái rỗng
 */
export function MovieColumn({ movies }: MovieColumnProps) {
  if (!movies.length || movies.length === 0) {
    return (
      <EmptyState
        title="Không tìm thấy phim"
        description="Hệ thống chưa có phim để hiển thị."
        icon={Sparkles}
      />
    );
  }

  return (
    <MotionStagger when="in-view" className="flex flex-col gap-3">
      {movies.map((movie) => (
        <MovieCard key={movie.id} movie={movie} />
      ))}
    </MotionStagger>
  );
}

/** Loading state */
export function MovieColumnLoading({ items = 10 }: { items?: number }) {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      {Array.from({ length: items }).map((_, index) => (
        <div key={index} className="w-full">
          <Skeleton className="aspect-[6/3] w-full rounded-lg" />
          <Skeleton className="mt-2 h-4 w-3/4" />
          <Skeleton className="mt-1 h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}
