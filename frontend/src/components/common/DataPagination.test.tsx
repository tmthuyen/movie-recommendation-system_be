import type { ComponentProps } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DataPagination } from './DataPagination';

const renderPagination = (overrides: Partial<ComponentProps<typeof DataPagination>> = {}) => {
  const onPageChange = vi.fn();
  const utils = render(
    <DataPagination page={2} totalPages={5} onPageChange={onPageChange} {...overrides} />,
  );
  return { onPageChange, ...utils };
};

describe('DataPagination', () => {
  it('không render khi chỉ có 1 trang', () => {
    const { container } = renderPagination({ page: 1, totalPages: 1 });

    expect(container).toBeEmptyDOMElement();
  });

  it('hiển thị trang hiện tại / tổng số trang và tổng kết quả', () => {
    renderPagination({ page: 2, totalPages: 5, total: 42 });

    const nav = screen.getByRole('navigation', { name: 'Phân trang' });
    expect(nav).toHaveTextContent('Trang 2 / 5');
    expect(nav).toHaveTextContent('42 kết quả');
  });

  it('dựng dải trang có ellipsis cho khoảng giữa', () => {
    renderPagination({ page: 5, totalPages: 10 });

    expect(screen.getByRole('button', { name: '1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '4' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '5' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '6' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '10' })).toBeInTheDocument();
    expect(screen.getAllByText('…')).toHaveLength(2);
  });

  it('đánh dấu aria-current cho trang hiện tại', () => {
    renderPagination({ page: 3, totalPages: 5 });

    expect(screen.getByRole('button', { name: '3' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: '2' })).not.toHaveAttribute('aria-current');
  });

  it('vô hiệu hoá nút "Trang trước" ở trang đầu và "Trang sau" ở trang cuối', () => {
    const { unmount } = renderPagination({ page: 1, totalPages: 5 });
    expect(screen.getByRole('button', { name: 'Trang trước' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Trang sau' })).toBeEnabled();
    unmount();

    renderPagination({ page: 5, totalPages: 5 });
    expect(screen.getByRole('button', { name: 'Trang sau' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Trang trước' })).toBeEnabled();
  });

  it('click số trang gọi onPageChange với đúng trang', async () => {
    const user = userEvent.setup();
    const { onPageChange } = renderPagination({ page: 3, totalPages: 5 });

    await user.click(screen.getByRole('button', { name: '4' }));

    expect(onPageChange).toHaveBeenCalledWith(4);
  });

  it('click trang trước/sau gọi onPageChange với trang kề', async () => {
    const user = userEvent.setup();
    const { onPageChange } = renderPagination({ page: 3, totalPages: 5 });

    await user.click(screen.getByRole('button', { name: 'Trang sau' }));
    await user.click(screen.getByRole('button', { name: 'Trang trước' }));

    expect(onPageChange).toHaveBeenNthCalledWith(1, 4);
    expect(onPageChange).toHaveBeenNthCalledWith(2, 2);
  });

  it('disabled=true vô hiệu hoá mọi nút', () => {
    renderPagination({ page: 2, totalPages: 5, disabled: true });

    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
    buttons.forEach((button) => expect(button).toBeDisabled());
  });

  it('cho phép đổi aria-label của nav', () => {
    renderPagination({ page: 2, totalPages: 5, ariaLabel: 'Phân trang phim' });

    expect(screen.getByRole('navigation', { name: 'Phân trang phim' })).toBeInTheDocument();
  });
});
