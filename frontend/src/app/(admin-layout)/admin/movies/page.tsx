import React from 'react';
import { PageHeader } from '@/components/common/PageHeader';
import { MoviesClient } from './movies-client';

export const metadata = {
  title: 'Phim',
  description: 'Quản lý phim',
};

export default function Page() {
  return (
    <div className="flex h-full w-full flex-col gap-4">
      <PageHeader title={metadata.title} description={metadata.description} />

      {/* content */}
      <MoviesClient />
    </div>
  );
}
