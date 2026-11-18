import { Suspense } from 'react';
import { PageHeader } from '@/components/common/PageHeader';
import { MovieGridSkeleton } from '@/components/movie/movie-grid';
import { SearchClient } from '@/components/search/search-client';
import { Skeleton } from '@/components/ui/skeleton';

export const metadata = {
  title: 'Tìm kiếm phim',
  description: 'Tìm phim theo ngữ nghĩa, kết hợp BM25 + semantic hoặc theo từ khóa.',
};

export default function SearchPage() {
  return (
    <div className="animate-fade-in w-full space-y-6 pb-10">
      <PageHeader title={metadata.title} description={metadata.description} />

      <Suspense
        fallback={
          <div className="space-y-4">
            <Skeleton className="h-11 w-full rounded-full" />
            <MovieGridSkeleton />
          </div>
        }
      >
        <SearchClient />
      </Suspense>
    </div>
  );
}
