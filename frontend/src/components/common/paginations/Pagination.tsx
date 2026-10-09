import { useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeftIcon, ArrowRightIcon, RotateCw } from 'lucide-react';

/*
{
  'statusCode': 200,
  'message': '',
  'data': {
    'data': [
      { ... },
      { ... },
      { ... }
    ],
    'pagination': {
      'page': 1,
      'limit': 10,
      'totalItems': 100,
      'totalPages': 10
    }
  }
}
*/

interface Pagination {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
}

export interface ResponseList<T> {
  statusCode: number;
  message: string;
  data: {
    data: T[];
    pagination: Pagination;
  };
}


interface PaginatedTableProps<T> {
  queryKeyName: string;
  fetchFn: (page: number, limit: number) => Promise<ResponseList<T>>;
  ContentComponent: React.ComponentType<{ data: T[] }>
  title?: string;
  staleTime?: number,
  gcTime?: number
}

const LoadingPagination = () => {
  return (
    <Card className='flex flex-col gap-8 p-4 md:p-6 py-8 bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700'>
      <Skeleton className='h-16 w-1/3 rounded-lg' />
      <Skeleton className='h-64 w-full rounded-lg' />
      <Skeleton className='h-16 w-full rounded-lg' />
    </Card>
  )
}

const ErrorFetch = () => {
  return (
    <Card className='flex flex-col gap-8 p-4 md:p-6 py-8 bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700'>
      <div className="flex flex-col gap-2 py-12 px-4 text-center max-w-sm mx-auto">
        {/* Biểu tượng biểu cảm buồn/lỗi */}
        <span className="text-5xl block mb-4 filter drop-shadow-sm select-none">( &gt; &lt; )</span>
        <p className="text-2xl font-bold text-gray-800 dark:text-gray-200">Kết nối bị gián đoạn</p>
        <p className="text-lg text-gray-400 mt-1 px-4">
          Hệ thống phản hồi chậm hoặc thiết bị của bạn mất mạng tạm thời.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="cursor-pointer mt-5 text-lg font-bold uppercase tracking-wider text-red-500 hover:text-red-600 underline underline-offset-4"
        >
          Chạm để thử lại
        </button>
        <button
          onClick={() => window.location.href = '/dashboard'}
          className="cursor-pointer text-lg font-bold uppercase tracking-wider text-blue-500 hover:text-red-600 underline underline-offset-4"
        >
          Về trang chủ
        </button>
      </div>
    </Card>
  )
}


export function PaginatedTable<T>({ queryKeyName, fetchFn, ContentComponent, title, staleTime, gcTime }: PaginatedTableProps<T>) {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(5);

  const { data, refetch, isPending, isError } = useQuery({
    queryKey: [queryKeyName, page, limit],
    queryFn: () => fetchFn(page, limit),
    placeholderData: keepPreviousData,
    staleTime: staleTime ?? 1 * 60 * 1000,
    gcTime: gcTime ?? 5 * 60 * 1000
  });

  if (isPending) return <LoadingPagination />;
  if (isError) return <ErrorFetch />;

  const items = data?.data?.data || [];
  const pagination = data?.data?.pagination;
  const hasMore = pagination.totalPages > page;

  return (
    <Card className='p-4 md:p-6 py-8 bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700'>
      <div className="flex flex-col md:flex-row items-center w-full">
        {title && <h2 className="text-xl font-bold mb-2">{title}</h2>}

        {/* refetch */}
        {/* refetch */}
        <button
          className='ms-auto font-bold flex items-center gap-2  rounded-full border bottom-1 border-primary dark:border-primary/10 bg-primary/10 dark:bg-primary/5 px-3 py-1.5 text-sm text-primary backdrop-blur-md shadow-sm cursor-pointer transition-all hover:bg-primary/20 hover:dark:bg-primary/10 hover:shadow-md active:scale-95'
          onClick={() => refetch()}
        >
          <RotateCw className="w-4 h-4" />
          Refetch
        </button>
      </div>

      <ContentComponent data={items} />


      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span className='font-medium'>Hiển thị</span>
          <Select
            value={pagination.limit.toString()}
            onValueChange={(val) => {
              setLimit(Number(val));
              setPage(1);
            }}
          >
            <SelectTrigger className="w-20 h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="2">2</SelectItem>
              <SelectItem value="5">5</SelectItem>
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="20">20</SelectItem>
              <SelectItem value="50">50</SelectItem>
            </SelectContent>
          </Select>
          <span className='font-medium'>/ trang</span>

          {/* Số items */}
          <span className='font-medium'>Tổng số: {pagination.totalItems} </span>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className='p-2 aspect-square'
            disabled={pagination.page <= 1}
            onClick={() => setPage((old) => Math.max(old - 1, 1))}
          >
            <ArrowLeftIcon />
          </Button>
          <span className="text-sm px-2">
            Trang <span className="font-bold">{page}</span> / {pagination.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            className='p-2 aspect-square'
            disabled={!hasMore}
            onClick={() => setPage((old) => old + 1)}
          >
            <ArrowRightIcon />
          </Button>
        </div>
      </div>
    </Card>

  );
}
