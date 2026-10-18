import React from 'react';
import { DashboardClient } from './dashboard-client';

export const metadata = {
  title: 'Dashboard',
  description:
    'Trang tổng quan của hệ thống, nơi hiển thị các thông tin quan trọng và các chỉ số liên quan đến hoạt động của ứng dụng.',
};

export default function DashBoardPage() {
  return (
    <div className="flex h-full w-full min-w-0 flex-col gap-4">
      {/* Tiêu đề + thanh công cụ (lọc thời gian, làm mới, xuất CSV) nằm trong client vì cần state */}
      <DashboardClient />
    </div>
  );
}
