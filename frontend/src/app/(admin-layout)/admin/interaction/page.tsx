import React from 'react';
import { PageHeader } from '@/components/common/PageHeader';

export const metadata = {
  title: 'Tương tác',
  description:
    'Trang tổng quan của hệ thống, nơi hiển thị các thông tin quan trọng và các chỉ số liên quan đến hoạt động của ứng dụng.',
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
