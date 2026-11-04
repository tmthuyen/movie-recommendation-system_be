import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCrudPage } from './admin-crud';

type Row = { id: number; name: string };

const createMutations = () => ({
  create: { mutateAsync: vi.fn(), isPending: false },
  update: { mutateAsync: vi.fn(), isPending: false },
  remove: { mutateAsync: vi.fn(), isPending: false },
});

type Mutations = ReturnType<typeof createMutations>;

const useTestPage = (mutations: Mutations) =>
  useCrudPage<Row, { name: string }>(mutations as any);

describe('useCrudPage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('khởi tạo ở trang 1, keyword rỗng', () => {
    const mutations = createMutations();
    const { result } = renderHook(() => useTestPage(mutations));

    expect(result.current.page).toBe(1);
    expect(result.current.keyword).toBe('');
    expect(result.current.keywordInput).toBe('');
    expect(result.current.dialogOpen).toBe(false);
    expect(result.current.editing).toBeNull();
    expect(result.current.deleteTarget).toBeNull();
  });

  it('debounce 400ms trước khi cập nhật keyword tìm kiếm', () => {
    const mutations = createMutations();
    const { result } = renderHook(() => useTestPage(mutations));

    act(() => result.current.setKeywordInput('dune'));

    expect(result.current.keywordInput).toBe('dune');
    expect(result.current.keyword).toBe('');

    act(() => vi.advanceTimersByTime(399));
    expect(result.current.keyword).toBe('');

    act(() => vi.advanceTimersByTime(1));
    expect(result.current.keyword).toBe('dune');
  });

  it('gõ tiếp sẽ reset debounce (chỉ giá trị cuối được áp dụng)', () => {
    const mutations = createMutations();
    const { result } = renderHook(() => useTestPage(mutations));

    act(() => result.current.setKeywordInput('du'));
    act(() => vi.advanceTimersByTime(300));
    act(() => result.current.setKeywordInput('dune'));
    act(() => vi.advanceTimersByTime(300));

    expect(result.current.keyword).toBe('');

    act(() => vi.advanceTimersByTime(100));
    expect(result.current.keyword).toBe('dune');
  });

  it('đổi keyword tìm kiếm quay về trang 1', () => {
    const mutations = createMutations();
    const { result } = renderHook(() => useTestPage(mutations));

    act(() => result.current.setPage(4));
    expect(result.current.page).toBe(4);

    act(() => result.current.setKeywordInput('avatar'));
    act(() => vi.advanceTimersByTime(400));

    expect(result.current.keyword).toBe('avatar');
    expect(result.current.page).toBe(1);
  });

  it('openCreate mở dialog không có editing; openEdit gắn đúng item', () => {
    const mutations = createMutations();
    const { result } = renderHook(() => useTestPage(mutations));
    const row: Row = { id: 9, name: 'Dune' };

    act(() => result.current.openCreate());
    expect(result.current.dialogOpen).toBe(true);
    expect(result.current.editing).toBeNull();

    act(() => result.current.openEdit(row));
    expect(result.current.dialogOpen).toBe(true);
    expect(result.current.editing).toEqual(row);
  });

  it('submit tạo mới gọi create, đóng dialog và gọi onSuccess', async () => {
    const mutations = createMutations();
    mutations.create.mutateAsync.mockResolvedValue(undefined);
    const { result } = renderHook(() => useTestPage(mutations));
    const onSuccess = vi.fn();

    act(() => result.current.openCreate());

    await act(async () => {
      await result.current.submit({ name: 'Dune' }, onSuccess);
    });

    expect(mutations.create.mutateAsync).toHaveBeenCalledWith({ name: 'Dune' });
    expect(mutations.update.mutateAsync).not.toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(result.current.dialogOpen).toBe(false);
  });

  it('submit khi đang editing gọi update với id dạng string', async () => {
    const mutations = createMutations();
    mutations.update.mutateAsync.mockResolvedValue(undefined);
    const { result } = renderHook(() => useTestPage(mutations));

    act(() => result.current.openEdit({ id: 3, name: 'Cũ' }));

    await act(async () => {
      await result.current.submit({ name: 'Mới' });
    });

    expect(mutations.update.mutateAsync).toHaveBeenCalledWith({
      id: '3',
      data: { name: 'Mới' },
    });
    expect(mutations.create.mutateAsync).not.toHaveBeenCalled();
  });

  it('submit lỗi giữ dialog mở và không gọi onSuccess', async () => {
    const mutations = createMutations();
    mutations.create.mutateAsync.mockRejectedValue(new Error('400'));
    const { result } = renderHook(() => useTestPage(mutations));
    const onSuccess = vi.fn();

    act(() => result.current.openCreate());

    await act(async () => {
      await result.current.submit({ name: 'Dune' }, onSuccess);
    });

    expect(onSuccess).not.toHaveBeenCalled();
    expect(result.current.dialogOpen).toBe(true);
  });

  it('confirmDelete gọi remove và reset deleteTarget khi thành công', async () => {
    const mutations = createMutations();
    mutations.remove.mutateAsync.mockResolvedValue(undefined);
    const { result } = renderHook(() => useTestPage(mutations));

    act(() => result.current.setDeleteTarget({ id: 8, name: 'Xoá' }));

    await act(async () => {
      await result.current.confirmDelete();
    });

    expect(mutations.remove.mutateAsync).toHaveBeenCalledWith('8');
    expect(result.current.deleteTarget).toBeNull();
  });

  it('confirmDelete lỗi giữ deleteTarget để thử lại', async () => {
    const mutations = createMutations();
    mutations.remove.mutateAsync.mockRejectedValue(new Error('500'));
    const { result } = renderHook(() => useTestPage(mutations));

    act(() => result.current.setDeleteTarget({ id: 8, name: 'Xoá' }));

    await act(async () => {
      await result.current.confirmDelete();
    });

    expect(result.current.deleteTarget).toEqual({ id: 8, name: 'Xoá' });
  });

  it('confirmDelete không có target thì không gọi API', async () => {
    const mutations = createMutations();
    const { result } = renderHook(() => useTestPage(mutations));

    await act(async () => {
      await result.current.confirmDelete();
    });

    expect(mutations.remove.mutateAsync).not.toHaveBeenCalled();
  });

  it('saving/deleting phản ánh trạng thái pending của mutation', () => {
    const mutations = createMutations();
    mutations.update.isPending = true;
    mutations.remove.isPending = true;
    const { result } = renderHook(() => useTestPage(mutations));

    expect(result.current.saving).toBe(true);
    expect(result.current.deleting).toBe(true);
  });
});
