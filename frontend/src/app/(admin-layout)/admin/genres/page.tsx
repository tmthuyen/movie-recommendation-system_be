import React from 'react';
import { PageHeader } from '@/components/common/PageHeader';
import { GenresClient } from './genres-client';

export const metadata = {
  title: 'Thể loại',
  description: 'Quản lý các nhóm thể loại phim',
};

export default function Page() {
  return (
    <div className="flex h-full w-full flex-col gap-4">
      <PageHeader title={metadata.title} description={metadata.description} />

      {/* content */}
      <GenresClient />
    </div>
  );
}
