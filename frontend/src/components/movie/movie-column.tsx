import { Movie } from '@/shared/types/movie.types';
import { MovieCard } from '@/components/movie/movie-card';
import { ColumnList } from '@/components/common/ColumnList';
import { EmptyState } from '@/components/common/EmptyState';
import { Sparkles } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface MovieColumnProps {
  movies: Movie[];
}

/** Danh sách phim dạng cột; rỗng thì hiển thị EmptyState. */
export function MovieColumn({ movies }: MovieColumnProps) {
  return (
    <ColumnList
      items={movies}
      getKey={(movie) => movie.id}
      renderItem={(movie) => <MovieCard movie={movie} />}
      emptyState={
        <EmptyState
          title="Không tìm thấy phim"
          description="Hệ thống chưa có phim để hiển thị."
          icon={Sparkles}
        />
      }
    />
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
