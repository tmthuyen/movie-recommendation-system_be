import RequireAuth from '@/components/auth/require-auth';
import { PageHeader } from '@/components/common/PageHeader';
import { MyInteractionList } from '@/components/movie/interaction-movie-list';

export const metadata = {
  title: 'Lịch sử tương tác',
  description: 'Toàn bộ tương tác của bạn: đã xem, yêu thích, đánh giá và bình luận.',
};

/** Trang lịch sử tương tác đầy đủ — cần đăng nhập (`RequireAuth`). */
export default function MyInteractionsPage() {
  return (
    <RequireAuth>
      <div className="animate-fade-in w-full space-y-6 pb-10">
        <PageHeader title={metadata.title} description={metadata.description} />
        <MyInteractionList source="activities" />
      </div>
    </RequireAuth>
  );
}
