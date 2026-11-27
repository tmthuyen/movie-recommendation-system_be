'use client';

import { createColumnHelper } from '@tanstack/react-table';
import { AlertTriangle, Eye, RotateCw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { AdminPageHeader } from '@/components/admin/admin-page-header';
import { AdminTablePage } from '@/components/admin/data-view/admin-table-page';
import type { AdminTableFeatures } from '@/components/admin/data-view/features';
import type { AdminColumnDef } from '@/components/admin/data-view/types';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  FAILED_EVENTS_QUERY_ROOT,
  useAdminFailedEvents,
  useRetryFailedEvent,
} from '@/hooks/tankstack/admin-failed-events';
import { useServerTable } from '@/hooks/use-server-table';
import type { FailedEvent, FailedEventStatus } from '@/shared/types/failed-event.types';
import { formatDateTime } from '@/shared/utils/formatting';
import type { FilterFieldConfig } from '@/shared/utils/search-query';

const helper = createColumnHelper<AdminTableFeatures, FailedEvent>();
const EMPTY_EVENTS: FailedEvent[] = [];
const DEFAULT_SORTING = [{ id: 'createdAt', desc: true }];

const FILTER_FIELDS: FilterFieldConfig[] = [
  {
    field: 'status',
    label: 'Trạng thái',
    type: 'enum',
    operators: ['eq', 'ne', 'in', 'notin'],
    options: [
      { value: 'PENDING', label: 'Chờ xử lý' },
      { value: 'RETRIED_SUCCESS', label: 'Đã phát lại' },
      { value: 'RETRIED_FAILED', label: 'Phát lại lỗi' },
    ],
  },
  {
    field: 'source',
    label: 'Nguồn',
    type: 'text',
    operators: ['contains', 'eq', 'ne'],
    placeholder: 'VD: recommendation.consumer',
  },
  {
    field: 'queueName',
    label: 'Queue',
    type: 'text',
    operators: ['contains', 'eq', 'ne'],
  },
  {
    field: 'routingKey',
    label: 'Routing key',
    type: 'text',
    operators: ['contains', 'eq', 'ne'],
  },
  {
    field: 'eventType',
    label: 'Loại sự kiện',
    type: 'text',
    operators: ['contains', 'eq', 'ne'],
  },
  {
    field: 'retryCount',
    label: 'Số lần retry',
    type: 'number',
    operators: ['gte', 'lte', 'between'],
  },
  {
    field: 'createdAt',
    label: 'Ngày tạo',
    type: 'date',
    operators: ['gte', 'lte', 'between'],
  },
];

const STATUS_BADGE: Record<FailedEventStatus, { label: string; className: string }> = {
  PENDING: { label: 'Chờ xử lý', className: 'border-amber-500/30 bg-amber-500/10 text-amber-500' },
  RETRIED_SUCCESS: {
    label: 'Đã phát lại',
    className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500',
  },
  RETRIED_FAILED: {
    label: 'Phát lại lỗi',
    className: 'border-red-500/30 bg-red-500/10 text-red-500',
  },
};

interface FailedEventColumnsOptions {
  onViewPayload: (event: FailedEvent) => void;
  onRetry: (event: FailedEvent) => void;
  retryingId?: string;
}

function createColumns({
  onViewPayload,
  onRetry,
  retryingId,
}: FailedEventColumnsOptions): AdminColumnDef<FailedEvent>[] {
  return helper.columns([
    helper.accessor('createdAt', {
      header: 'Thời gian',
      cell: ({ getValue }) => {
        const value = getValue();
        return (
          <span className="text-muted-foreground text-xs">
            {value ? formatDateTime(value) : '—'}
          </span>
        );
      },
    }),
    helper.accessor('source', {
      header: 'Nguồn',
      cell: ({ getValue }) => (
        <span className="line-clamp-1 max-w-40 text-xs">{getValue() || '—'}</span>
      ),
    }),
    helper.accessor('queueName', {
      header: 'Queue',
      cell: ({ getValue }) => <span className="font-mono text-xs">{getValue() || '—'}</span>,
    }),
    helper.accessor('routingKey', {
      header: 'Routing key',
      cell: ({ getValue }) => (
        <span className="line-clamp-1 max-w-48 font-mono text-xs">{getValue() || '—'}</span>
      ),
    }),
    helper.accessor('status', {
      header: 'Trạng thái',
      cell: ({ getValue }) => {
        const status = getValue();
        const badge = STATUS_BADGE[status] ?? STATUS_BADGE.PENDING;
        return (
          <Badge variant="outline" className={badge.className}>
            {badge.label}
          </Badge>
        );
      },
    }),
    helper.accessor('retryCount', {
      header: 'Retry',
      cell: ({ getValue }) => <span className="text-xs tabular-nums">{getValue() ?? 0}</span>,
    }),
    helper.accessor('errorReason', {
      header: 'Lỗi',
      enableSorting: false,
      cell: ({ getValue }) => {
        const reason = getValue();
        return reason ? (
          <span className="text-destructive line-clamp-2 max-w-72 text-xs" title={reason}>
            {reason}
          </span>
        ) : (
          <span className="text-muted-foreground/60 text-xs">—</span>
        );
      },
    }),
    helper.display({
      id: 'actions',
      header: () => <span className="sr-only">Thao tác</span>,
      enableSorting: false,
      cell: ({ row }) => {
        const event = row.original;
        return (
          <div className="flex items-center justify-end gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-11 cursor-pointer"
              onClick={() => onViewPayload(event)}
              aria-label="Xem payload"
              title="Xem payload"
            >
              <Eye className="size-4" aria-hidden />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-11 cursor-pointer"
              onClick={() => onRetry(event)}
              disabled={retryingId === event.id}
              aria-label={`Phát lại sự kiện ${event.id}`}
              title="Phát lại"
            >
              <RotateCw className="size-4" aria-hidden />
            </Button>
          </div>
        );
      },
    }),
  ]);
}

/** Trang quản lý sự kiện rớt DLQ: tìm kiếm/lọc, xem payload JSON và phát lại thủ công. */
export function FailedEventsClient() {
  const table = useServerTable({ initialPageSize: 10, initialSorting: DEFAULT_SORTING });
  const { clampPageIndex } = table;

  const query = useAdminFailedEvents(table.params);
  const items = query.data?.items ?? EMPTY_EVENTS;
  const total = query.data?.pagination?.total ?? 0;

  useEffect(() => {
    clampPageIndex(total);
  }, [clampPageIndex, total]);

  const retry = useRetryFailedEvent();
  const [payloadTarget, setPayloadTarget] = useState<FailedEvent | null>(null);
  const [retryTarget, setRetryTarget] = useState<FailedEvent | null>(null);

  const columns = useMemo(
    () =>
      createColumns({
        onViewPayload: setPayloadTarget,
        onRetry: setRetryTarget,
        retryingId: retry.isPending ? retry.variables : undefined,
      }),
    [retry.isPending, retry.variables],
  );

  const handleRetry = async () => {
    if (!retryTarget) return;
    try {
      await retry.mutateAsync(retryTarget.id);
      setRetryTarget(null);
    } catch {
      // Lỗi đã được toast trong mutation — giữ dialog mở để user thử lại.
    }
  };

  return (
    <div className="flex h-full w-full flex-col gap-4">
      <AdminPageHeader
        title="Sự kiện lỗi"
        description="Xem và phát lại các sự kiện rớt DLQ (failed events)."
        queryRoots={[[FAILED_EVENTS_QUERY_ROOT]]}
      />

      <AdminTablePage
        table={table}
        columns={columns}
        data={items}
        total={total}
        isLoading={query.isLoading}
        isFetching={query.isFetching}
        error={query.error}
        onRetry={() => void query.refetch()}
        searchPlaceholder="Tìm theo source, queue, routing key, correlation ID, lỗi…"
        searchLabel="Tìm kiếm sự kiện lỗi"
        filterFields={FILTER_FIELDS}
        entityLabel="sự kiện lỗi"
        emptyDescription="Chưa có sự kiện nào rớt DLQ."
      />

      <Dialog
        open={payloadTarget !== null}
        onOpenChange={(open) => {
          if (!open) setPayloadTarget(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Payload sự kiện</DialogTitle>
            <DialogDescription>
              {payloadTarget
                ? `${payloadTarget.queueName} · ${payloadTarget.routingKey}`
                : 'Nội dung message trong DLQ.'}
            </DialogDescription>
          </DialogHeader>
          <pre className="bg-muted max-h-[60vh] overflow-auto rounded-lg p-4 text-xs whitespace-pre-wrap">
            {JSON.stringify(payloadTarget?.payload ?? {}, null, 2)}
          </pre>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        isOpen={retryTarget !== null}
        title="Phát lại sự kiện?"
        description={`Sự kiện ${retryTarget?.id ?? ''} sẽ được đưa lại vào exchange tương ứng. Trạng thái và số lần retry sẽ được cập nhật.`}
        confirmText={retry.isPending ? 'Đang phát lại…' : 'Phát lại'}
        cancelText="Hủy"
        variant="default"
        onConfirm={() => void handleRetry()}
        onCancel={() => setRetryTarget(null)}
      />

      <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <AlertTriangle className="size-3.5" aria-hidden="true" />
        Chỉ phát lại khi đã xử lý nguyên nhân gây lỗi — sự kiện sẽ được consume lại từ đầu.
      </p>
    </div>
  );
}
