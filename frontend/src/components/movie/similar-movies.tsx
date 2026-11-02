'use client';

import { Sparkles } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { MovieRow } from '@/components/movie/movie-row';
import { SectionHeader } from '@/components/common/SectionHeader';
import useRecommendation from '@/hooks/tankstack/useRecommendation';
import { MovieGrid } from '@/components/movie/movie-grid';
import { Movie } from '@/shared/types/movie.types';
import { MovieCard } from '@/components/movie/movie-card';

interface SimilarMoviesProps {
  movieId: number;
  /** Thể loại của phim hiện tại — dùng để gợi ý link khám phá cùng thể loại. */
  genres?: { id: number | string; name: string }[];
}

/**
 * Movie Column infinite scroll
 */
interface MovieGridProps {
  movies: Movie[];
}

export function MovieColumn({ movies }: MovieGridProps) {
  return (
    <div className="flex flex-col gap-3">
      {movies.map((movie) => (
        <MovieCard key={movie.id} movie={movie} />
      ))}
    </div>
  );
}

/**
 * **Placeholder** cho mục "Phim tương tự" — backend chưa có endpoint gợi ý
 * phim tương tự (chỉ có recommendation qua ai-service `/api/recommendations`).
 * Hiện tại hiển thị link khám phá theo thể loại của phim; khi backend có
 * endpoint sẽ thay thế bằng danh sách `MovieRow`.
 */
export function SimilarMovies({ movieId, genres = [] }: SimilarMoviesProps) {
  const { data: similarMovies } = useRecommendation.useGetSimilarMovies(movieId, {
    topK: 12,
  });

  return (
    <section aria-label="Phim tương tự" className="space-y-3">
      <div className="bg-muted/40 flex flex-col gap-3 rounded-xl border border-dashed p-5">
        {/* <MovieRow movies={similarMovies || []} max={12} /> */}
        <MovieColumn movies={similarMovies || []} />
      </div>
    </section>
  );
}
