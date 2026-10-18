import React from 'react';
import { PageHeader } from '@/components/common/PageHeader';
import { CountriesClient } from './countries-client';

export const metadata = {
  title: 'Quốc gia',
  description: 'Quản lý quốc gia xuất xứ của phim',
};

export default function Page() {
  return (
    <div className="flex h-full w-full flex-col gap-4">
      <PageHeader title={metadata.title} description={metadata.description} />

      {/* content */}
      <CountriesClient />
    </div>
  );
}
