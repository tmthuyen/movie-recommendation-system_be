import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { PageHeader } from '@/components/common/PageHeader';
import { LatestMovies } from '@/components/movie/latest-movies';
import { Button } from '@/components/ui/button';

export const metadata = {
  title: 'Trang chủ',
  description:
    'Ứng dụng gợi ý phim — khám phá phim mới nhất, tìm kiếm theo thể loại và quốc gia.',
};

export default function HomePage() {
  return (
    <div className="animate-fade-in w-full space-y-10 pb-10">
      <section className="from-primary/10 to-primary/5 relative overflow-hidden rounded-2xl border bg-gradient-to-br p-6 md:p-10">
        <div className="max-w-2xl space-y-4">
          <PageHeader
            title="Khám phá thế giới điện ảnh"
            description="Tìm kiếm phim theo tên, thể loại và quốc gia. Đánh giá, bình luận và xây dựng danh sách phim yêu thích của bạn."
          />
          <Button asChild size="lg">
            <Link href="/movies">
              Khám phá phim <ArrowRight />
            </Link>
          </Button>
        </div>
      </section>

      <LatestMovies />
    </div>
  );
}
