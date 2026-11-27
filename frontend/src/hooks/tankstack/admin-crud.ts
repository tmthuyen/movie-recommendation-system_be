import { parseAxiosError } from '@/lib/axiosClient';
import { ApiPaginatedResponse, Pagination } from '@/shared/types/api.types';
import type { SearchListParams } from '@/shared/utils/list-params';
import { UseMutationResult, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

/** Query params danh sách admin — đầy đủ `BaseSearchRequest`. */
export type CrudListParams = SearchListParams;

/** Chuẩn hoá params thành object ổn định để hash queryKey (bỏ field rỗng). */
function useNormalizedListParams({
  page = 1,
  limit = 10,
  keyword,
  filters,
  sort,
}: SearchListParams): SearchListParams {
  return useMemo<SearchListParams>(
    () => ({
      page,
      limit,
      ...(keyword ? { keyword } : {}),
      ...(filters && filters.length > 0 ? { filters } : {}),
      ...(sort && sort.length > 0 ? { sort } : {}),
    }),
    [page, limit, keyword, filters, sort],
  );
}

/** Kết quả danh sách phân trang cho bảng admin (items + pagination từ envelope). */
export interface CrudListResult<T> {
  items: T[];
  pagination: Pagination;
}

/** Contract API CRUD mà mỗi domain cung cấp cho factory. */
export interface CrudApi<T, TInput, TUpdateInput = TInput> {
  /** QueryKey root riêng cho domain (vd. `admin-genres`) — invalidate theo root. */
  domain: string;
  list: (params: SearchListParams) => Promise<ApiPaginatedResponse<T[]>>;
  create: (data: TInput) => Promise<unknown>;
  update: (id: string | number, data: TUpdateInput) => Promise<unknown>;
  remove: (id: string | number) => Promise<unknown>;
}

/**
 * Bộ hooks CRUD dùng chung — mỗi domain chỉ cần cung cấp `CrudApi`, không viết lại query/mutation.
 * `TUpdateInput` cho phép PATCH/PUT nhận payload từng phần (dirty fields) trong khi create vẫn đủ field.
 */
export function createCrudHooks<T, TInput, TUpdateInput = TInput>(
  api: CrudApi<T, TInput, TUpdateInput>,
) {
  function useList(params: SearchListParams & { enabled?: boolean } = {}) {
    const { enabled = true, ...rest } = params;
    const queryParams = useNormalizedListParams(rest);
    return useQuery({
      queryKey: [api.domain, 'list', queryParams],
      queryFn: async (): Promise<CrudListResult<T>> => {
        const response = await api.list(queryParams);
        return { items: response.result ?? [], pagination: response.pagination };
      },
      enabled,
      staleTime: 1000 * 60, // 1 phút
      placeholderData: (previous) => previous, // giữ data cũ khi đổi trang/tìm kiếm (giảm nháy)
    });
  }

  function useCreate(): UseMutationResult<unknown, Error, TInput> {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (data: TInput) => api.create(data),
      onSuccess: () => {
        toast.success('Đã tạo mới.');
        queryClient.invalidateQueries({ queryKey: [api.domain] });
      },
      onError: (error) =>
        toast.error(parseAxiosError(error).message || 'Không thể tạo mới. Vui lòng thử lại.'),
    });
  }

  function useUpdate(): UseMutationResult<
    unknown,
    Error,
    { id: string | number; data: TUpdateInput }
  > {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: ({ id, data }: { id: string | number; data: TUpdateInput }) =>
        api.update(id, data),
      onSuccess: () => {
        toast.success('Đã cập nhật.');
        queryClient.invalidateQueries({ queryKey: [api.domain] });
      },
      onError: (error) =>
        toast.error(parseAxiosError(error).message || 'Không thể cập nhật. Vui lòng thử lại.'),
    });
  }

  function useDelete(): UseMutationResult<unknown, Error, string | number> {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (id: string | number) => api.remove(id),
      onSuccess: () => {
        toast.success('Đã xóa.');
        queryClient.invalidateQueries({ queryKey: [api.domain] });
      },
      onError: (error) =>
        toast.error(parseAxiosError(error).message || 'Không thể xóa. Vui lòng thử lại.'),
    });
  }

  return { useList, useCreate, useUpdate, useDelete };
}

/** Mutation "chỉ xóa" cho các danh sách read-only (rating/comment/interaction ở trang admin). */
export function useDeleteOnly(
  domain: string,
  remove: (id: string | number) => Promise<unknown>,
): UseMutationResult<unknown, Error, string | number> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string | number) => remove(id),
    onSuccess: () => {
      toast.success('Đã xóa.');
      queryClient.invalidateQueries({ queryKey: [domain] });
    },
    onError: (error) =>
      toast.error(parseAxiosError(error).message || 'Không thể xóa. Vui lòng thử lại.'),
  });
}

/**
 * Query "chỉ list" cho danh sách read-only (hỗ trợ đầy đủ
 * `page/limit/keyword/filters/sort` + `enabled` để không fetch tab ẩn).
 */
export function usePagedList<T>(
  domain: string,
  fetcher: (params: SearchListParams) => Promise<ApiPaginatedResponse<T[]>>,
) {
  return function usePagedListQuery({
    enabled = true,
    ...rest
  }: SearchListParams & { enabled?: boolean }) {
    const queryParams = useNormalizedListParams(rest);
    return useQuery({
      queryKey: [domain, 'list', queryParams],
      queryFn: async (): Promise<CrudListResult<T>> => {
        const response = await fetcher(queryParams);
        return { items: response.result ?? [], pagination: response.pagination };
      },
      enabled,
      staleTime: 1000 * 60,
      placeholderData: (previous) => previous,
    });
  };
}

interface CrudPageMutations<TInput> {
  create: UseMutationResult<unknown, Error, TInput>;
  update: UseMutationResult<unknown, Error, { id: string | number; data: TInput }>;
  remove: UseMutationResult<unknown, Error, string | number>;
}

/**
 * State orchestration dùng chung cho **mọi trang CRUD admin**:
 * phân trang, tìm kiếm debounce 400ms (reset về trang 1), dialog thêm/sửa,
 * dialog xóa xác nhận. Mỗi trang chỉ khai báo columns/fields — không lặp wiring.
 */
export function useCrudPage<T extends { id: number | string }, TInput>(
  mutations: CrudPageMutations<TInput>,
) {
  const [page, setPage] = useState(1);
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');

  // Debounce tìm kiếm — đổi keyword luôn quay về trang 1.
  useEffect(() => {
    const timer = setTimeout(() => {
      setKeyword(keywordInput);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [keywordInput]);

  const [editing, setEditing] = useState<T | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<T | null>(null);

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (item: T) => {
    setEditing(item);
    setDialogOpen(true);
  };

  /** Submit form thêm/sửa — lỗi đã được hook mutation toast sẵn, chỉ nuốt rejection. */
  const submit = async (values: TInput, onSuccess?: () => void) => {
    try {
      if (editing) {
        await mutations.update.mutateAsync({ id: String(editing.id), data: values });
      } else {
        await mutations.create.mutateAsync(values);
      }
      setDialogOpen(false);

      // reset state
      onSuccess?.();
    } catch {
      // Đã toast trong mutation onError — giữ dialog mở để user sửa.
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await mutations.remove.mutateAsync(String(deleteTarget.id));
      setDeleteTarget(null);
    } catch {
      // Đã toast trong mutation onError — giữ dialog mở.
    }
  };

  return {
    page,
    setPage,
    keyword,
    keywordInput,
    setKeywordInput,
    editing,
    dialogOpen,
    setDialogOpen,
    openCreate,
    openEdit,
    deleteTarget,
    setDeleteTarget,
    submit,
    confirmDelete,
    saving: mutations.create.isPending || mutations.update.isPending,
    deleting: mutations.remove.isPending,
  };
}
