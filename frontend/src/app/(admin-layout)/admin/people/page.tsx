import React from 'react';
import { PageHeader } from '@/components/common/PageHeader';
import { PeopleClient } from './people-client';

export const metadata = {
  title: 'Diễn viên / Đạo diễn',
  description: 'Quản lý người tham gia phim',
};

export default function Page() {
  return (
    <div className="flex h-full w-full flex-col gap-4">
      <PageHeader title={metadata.title} description={metadata.description} />

      {/* content */}
      <PeopleClient />
    </div>
  );
}
