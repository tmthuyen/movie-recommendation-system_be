import RequireAuth from '@/components/auth/require-auth';
import { PageHeader } from '@/components/common/PageHeader';
import { MyInteractionList } from '@/components/movie/interaction-movie-list';

export const metadata = {
  title: 'Lịch sử xem',
  description: 'Danh sách các bộ phim bạn đã xem gần đây.',
};

/** Trang lịch sử xem phim cá nhân — cần đăng nhập (`RequireAuth` redirect kèm `return-page`). */
export default function MyHistoryPage() {
  return (
    <RequireAuth>
      <div className="animate-fade-in w-full space-y-6 pb-10">
        <PageHeader title={metadata.title} description={metadata.description} />
        <MyInteractionList source="history" />
      </div>
    </RequireAuth>
  );
}
