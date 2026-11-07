import { SimilarMoviesInfinite } from './similar-movies-infinite';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Movie } from '@/shared/types/movie.types';
import { HorizontalScroller } from '@/components/common/CarouselCustom';
import { MovieColumn, MovieColumnLoading } from '@/components/movie/movie-column';
import useMovie from '@/hooks/tankstack/useMovie';

export function MovieDetailTabs({ movie }: { movie: Movie }) {
  const genreIds = movie.genres?.map((g) => g.id);

  const tabs = [
    {
      value: 'similarity',
      label: 'Phim tương tự',
      contentComponent: <SimilarMoviesInfinite movieId={movie.id} genres={movie.genres} />,
    },
    {
      value: 'forYou',
      label: 'Dành cho bạn',
      contentComponent: <p>Chưa phát triển</p>,
    },
    {
      value: 'topRated',
      label: 'Top Rated',
      contentComponent: <MovieColumnSection typeFilter="topRated" />,
    },
    {
      value: 'trending',
      label: 'Trending',
      contentComponent: <MovieColumnSection typeFilter="trending" />,
    },
    {
      value: 'sameGenre',
      label: 'Cùng thể loại',
      contentComponent: <MovieColumnSection typeFilter="sameGenre" genreIds={genreIds} />,
    },
  ];
  return (
    <Tabs defaultValue="similarity" className="w-full min-w-0">
      <HorizontalScroller gap={8}>
        <TabsList className="h-auto w-max justify-start bg-transparent p-0">
          {tabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className="shrink-0 cursor-pointer">
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </HorizontalScroller>

      {tabs.map((tab) => (
        <TabsContent key={tab.value} value={tab.value}>
          {tab.contentComponent}
        </TabsContent>
      ))}
    </Tabs>
  );
}

/** Props for MovieColumnSection */
interface MovieColumnSectionProps {
  typeFilter?: 'topRated' | 'trending' | 'sameGenre';
  genreIds?: number[];
}

/** Danh sách movies theo cột: loading, empty state, has Data */
export function MovieColumnSection({ typeFilter, genreIds }: MovieColumnSectionProps) {
  switch (typeFilter) {
    case 'topRated':
      return <TopRatedMovieColumn />;

    case 'trending':
      return <TrendingMovieColumn />;

    case 'sameGenre':
      return <SameGenreMovieColumn genreIds={genreIds} />;

    default:
      throw new Error(`Invalid typeFilter: ${typeFilter}`);
  }
}

/** Danh sách top rated movies theo cột: loading, empty state, has Data */
export function TopRatedMovieColumn() {
  const { data, isLoading } = useMovie.useTopRatedMovies({ limit: 12 });

  if (isLoading) {
    return <MovieColumnLoading items={12} />;
  }

  return (
    <section aria-label="Top Rated" className="space-y-3">
      <div className="bg-muted/40 flex flex-col gap-3 rounded-xl border border-dashed p-5">
        <MovieColumn movies={data?.movies || []} />;
      </div>
    </section>
  );
}

/** Danh sách trending (most viewed) movies theo cột: loading, empty state, has Data */
export function TrendingMovieColumn() {
  const { data, isLoading } = useMovie.useMostViewedMovies({ limit: 12 });

  if (isLoading) {
    return <MovieColumnLoading items={12} />;
  }

  return (
    <section aria-label="Trending" className="space-y-3">
      <div className="bg-muted/40 flex flex-col gap-3 rounded-xl border border-dashed p-5">
        <MovieColumn movies={data?.movies || []} />;
      </div>
    </section>
  );
}

/** Danh sách phim cùng thể loại movies theo cột: loading, empty state, has Data */
export function SameGenreMovieColumn({ genreIds }: { genreIds?: number[] }) {
  if (!genreIds || genreIds.length === 0) {
    return <MovieColumn movies={[]} />;
  }

  const { data, isLoading } = useMovie.useSearchMovies({
    limit: 12,
    genreIds,
    sort: 'voteAverage:DESC',
  });

  if (isLoading) {
    return <MovieColumnLoading items={12} />;
  }

  return (
    <section aria-label="Cùng thể loại" className="space-y-3">
      <div className="bg-muted/40 flex flex-col gap-3 rounded-xl border border-dashed p-5">
        <MovieColumn movies={data?.movies || []} />;
      </div>
    </section>
  );
}
