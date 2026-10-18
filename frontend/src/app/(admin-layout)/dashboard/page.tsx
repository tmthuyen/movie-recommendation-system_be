import React from 'react';
import { PageHeader } from '@/components/common/PageHeader';
import { DashboardClient } from './dashboard-client';

export const metadata = {
  title: 'Dashboard',
  description:
    'Trang tổng quan của hệ thống, nơi hiển thị các thông tin quan trọng và các chỉ số liên quan đến hoạt động của ứng dụng.',
};

export default function DashBoardPage() {
  return (
    <div className="flex h-full w-full flex-col gap-4">
      <PageHeader title={metadata.title} description={metadata.description} />

      {/* content */}
      <DashboardClient />
    </div>
  );
}
