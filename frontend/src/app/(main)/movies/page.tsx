import { Suspense } from 'react';
import { MovieList } from '@/components/movie/movie-list';
import { PageHeader } from '@/components/common/PageHeader';
import { MovieGridSkeleton } from '@/components/movie/movie-grid';

export const metadata = {
  title: 'Danh sách phim',
  description: 'Khám phá và tìm kiếm phim theo tên, thể loại, quốc gia và năm phát hành.',
};

export default function MoviesPage() {
  return (
    <div className="animate-fade-in w-full space-y-6 pb-10">
      <PageHeader title={metadata.title} description={metadata.description} />

      <Suspense fallback={<MovieGridSkeleton />}>
        <MovieList />
      </Suspense>
    </div>
  );
}
