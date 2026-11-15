'use client';

import type { DataTableToolbarProps } from './types';

/** Khung toolbar: slot trái (search/filter) và slot phải (hành động). */
export function DataTableToolbar({ children, actions }: DataTableToolbarProps) {
  return (
    <div className="neo-surface flex flex-col gap-3 rounded-2xl p-3 lg:flex-row lg:items-center lg:justify-between">
      {children ? (
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          {children}
        </div>
      ) : null}
      {actions ? (
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">{actions}</div>
      ) : null}
    </div>
  );
}
