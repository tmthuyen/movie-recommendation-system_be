import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ColumnInfiniteScroll } from './ColumnInfiniteScroll';

type TestItem = { id: number; name: string };

interface ScrollOverrides {
  items?: TestItem[];
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  isFetchNextPageError?: boolean;
  isLoading?: boolean;
  isError?: boolean;
  errorMessage?: string;
  loadingState?: ReactNode;
  emptyState?: ReactNode;
}

const items: TestItem[] = [
  { id: 1, name: 'Phim A' },
  { id: 2, name: 'Phim B' },
];

const triggerIntersection = () => {
  (
    globalThis as typeof globalThis & { __triggerIntersection?: () => void }
  ).__triggerIntersection?.();
};

const renderScroll = (overrides: ScrollOverrides = {}) => {
  const fetchNextPage = vi.fn();
  const onRetry = vi.fn();
  const onRetryNextPage = vi.fn();

  render(
    <ColumnInfiniteScroll
      items={items}
      getKey={(item) => item.id}
      renderItem={(item) => <p>{item.name}</p>}
      hasNextPage
      isFetchingNextPage={false}
      fetchNextPage={fetchNextPage}
      onRetry={onRetry}
      onRetryNextPage={onRetryNextPage}
      {...overrides}
    />,
  );

  return { fetchNextPage, onRetry, onRetryNextPage };
};

describe('ColumnInfiniteScroll', () => {
  it('render item và gọi fetchNextPage khi sentinel lọt viewport', () => {
    const { fetchNextPage } = renderScroll();

    expect(screen.getByText('Phim A')).toBeInTheDocument();
    expect(screen.getByText('Phim B')).toBeInTheDocument();

    act(() => triggerIntersection());

    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it('không gọi fetchNextPage khi đang tải trang kế', () => {
    const { fetchNextPage } = renderScroll({ isFetchingNextPage: true });

    act(() => triggerIntersection());

    expect(fetchNextPage).not.toHaveBeenCalled();
  });

  it('hiển thị trạng thái đang tải trang kế', () => {
    renderScroll({ isFetchingNextPage: true });

    expect(screen.getByRole('status')).toHaveTextContent('Đang tải thêm phim');
  });

  it('hiển thị trạng thái hết dữ liệu', () => {
    renderScroll({ hasNextPage: false });

    expect(screen.getByText('Đã hiển thị tất cả.')).toBeInTheDocument();
  });

  it('hiển thị lỗi trang kế và cho phép thử lại', async () => {
    const { onRetryNextPage } = renderScroll({ isFetchNextPageError: true });

    expect(screen.getByRole('alert')).toHaveTextContent('Không tải thêm được phim');
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));

    expect(onRetryNextPage).toHaveBeenCalledTimes(1);
  });

  it('hiển thị loading state', () => {
    renderScroll({
      isLoading: true,
      loadingState: <p>Đang tải danh sách</p>,
    });

    expect(screen.getByText('Đang tải danh sách')).toBeInTheDocument();
  });

  it('hiển thị empty state', () => {
    renderScroll({
      items: [],
      emptyState: <p>Chưa có phim</p>,
    });

    expect(screen.getByText('Chưa có phim')).toBeInTheDocument();
  });

  it('hiển thị lỗi trang đầu và gọi onRetry', async () => {
    const { onRetry } = renderScroll({
      items: [],
      isError: true,
      errorMessage: 'Mất kết nối',
    });

    expect(screen.getByRole('alert')).toHaveTextContent('Mất kết nối');
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
