import { MovieList } from '@/components/movie/movie-list';
import { PageHeader } from '@/components/common/PageHeader';

export const metadata = {
  title: 'Danh sách phim',
  description: 'Khám phá và tìm kiếm phim theo tên, thể loại và quốc gia.',
};

export default async function MoviesPage({
  searchParams,
}: {
  searchParams: Promise<{ genre?: string; country?: string; keyword?: string }>;
}) {
  const { genre, country, keyword } = await searchParams;

  return (
    <div className="animate-fade-in w-full space-y-6 pb-10">
      <PageHeader title={metadata.title} description={metadata.description} />

      <MovieList initialGenreId={genre} initialCountryId={country} initialKeyword={keyword} />
    </div>
  );
}
