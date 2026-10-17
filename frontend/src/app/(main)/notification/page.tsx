import React from 'react';
import { PageHeader } from '@/components/common/PageHeader';

export const metadata = {
  title: 'Thông báo',
  description: 'Thông báo hệ thống của ứng dụng Movie Recommendation',
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
