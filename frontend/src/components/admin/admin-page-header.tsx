'use client';

import type { ReactNode } from 'react';
import { RefreshButton } from '@/components/common/RefreshButton';
import { PageHeader } from '@/components/common/PageHeader';
import { useRefreshQueries, type QueryRoot } from '@/hooks/tankstack/useRefreshQueries';

interface AdminPageHeaderProps {
  title: string;
  description?: string;
  /** QueryKey root cần invalidate khi bấm "Làm mới". */
  queryRoots: readonly QueryRoot[];
  actions?: ReactNode;
  className?: string;
}

/** Tiêu đề trang admin kèm nút làm mới dữ liệu theo queryKey root của trang. */
export function AdminPageHeader({
  title,
  description,
  queryRoots,
  actions,
  className,
}: AdminPageHeaderProps) {
  const { refresh, isFetching } = useRefreshQueries(queryRoots);

  return (
    <PageHeader
      title={title}
      description={description}
      className={className}
      actions={
        <>
          <RefreshButton onRefresh={refresh} isFetching={isFetching} />
          {actions}
        </>
      }
    />
  );
}
