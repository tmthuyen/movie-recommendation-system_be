import React from 'react';
import { PageHeader } from '@/components/common/PageHeader';

export const metadata = {
  title: 'Dashboard',
  description:
    'Trang tổng quan của hệ thống, nơi hiển thị các thông tin quan trọng và các chỉ số liên quan đến hoạt động của ứng dụng.',
};

// fake async function to simulate data fetching
const fetchData = async () => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve('Data fetched successfully');
    }, 1000);
  });
};

export default async function DashBoardPage() {
  const data = await fetchData();

  return (
    <div className="flex h-full w-full flex-col gap-4">
      <PageHeader title={metadata.title} description={metadata.description} />

      {/* content */}
      <div className="flex items-center justify-center">Content</div>
    </div>
  );
}
