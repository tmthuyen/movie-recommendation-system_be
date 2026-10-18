import React from 'react';
import { PageHeader } from '@/components/common/PageHeader';
import { InteractionClient } from './interaction-client';

export const metadata = {
  title: 'Tương tác',
  description: 'Theo dõi tương tác, đánh giá và bình luận của người dùng',
};

export default function Page() {
  return (
    <div className="flex h-full w-full flex-col gap-4">
      <PageHeader title={metadata.title} description={metadata.description} />

      {/* content */}
      <InteractionClient />
    </div>
  );
}
