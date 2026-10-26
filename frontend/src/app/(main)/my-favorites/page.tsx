import RequireAuth from '@/components/auth/require-auth';
import { PageHeader } from '@/components/common/PageHeader';
import { MyInteractionList } from '@/components/movie/interaction-movie-list';

export const metadata = {
  title: 'Phim yêu thích',
  description: 'Các bộ phim bạn đã yêu thích.',
};

/** Trang phim yêu thích cá nhân — cần đăng nhập (`RequireAuth` redirect kèm `return-page`). */
export default function MyFavoritesPage() {
  return (
    <RequireAuth>
      <div className="animate-fade-in w-full space-y-6 pb-10">
        <PageHeader title={metadata.title} description={metadata.description} />
        <MyInteractionList source="favorites" />
      </div>
    </RequireAuth>
  );
}
