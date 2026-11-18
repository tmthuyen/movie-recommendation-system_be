import { PageHeader } from '@/components/common/PageHeader';
import { ForYouList } from '@/components/movie/for-you-list';

export const metadata = {
  title: 'Dành cho bạn',
  description: 'Gợi ý phim cá nhân hoá dựa trên sở thích và hoạt động của bạn.',
};

export default function ForYouPage() {
  return (
    <div className="animate-fade-in w-full space-y-6 pb-10">
      <PageHeader title={metadata.title} description={metadata.description} />
      <ForYouList />
    </div>
  );
}
