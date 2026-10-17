import React from 'react';
import { PageHeader } from '@/components/common/PageHeader';

export const metadata = {
  title: 'Diễn viên / Đạo diễn',
  description: 'Quản lý diễn viên và đạo diễn',
};

export default function Page() {
  return (
    <div className="flex h-full w-full flex-col gap-4">
      <PageHeader title={metadata.title} description={metadata.description} />

      {/* content */}
      <div className="flex items-center justify-center">Content</div>
    </div>
  );
}
