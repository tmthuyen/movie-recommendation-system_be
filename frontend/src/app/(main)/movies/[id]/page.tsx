import { MovieDetailView } from '@/components/movie/movie-detail-view';

export const metadata = {
  title: 'Chi tiết phim',
  description: 'Thông tin phim, đánh giá sao và bình luận realtime.',
};

export default async function MovieDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Next.js 16: `params` là Promise — phải await (không đọc đồng bộ).
  const { id } = await params;

  return (
    <div className="w-full">
      <MovieDetailView id={id} />
    </div>
  );
}
