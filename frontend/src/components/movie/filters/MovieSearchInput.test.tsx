import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { MovieSearchInput } from './MovieSearchInput';

describe('MovieSearchInput', () => {
  it('gõ chỉ cập nhật draft, không commit (không gọi API)', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();

    function Harness() {
      const [value, setValue] = useState('');
      return <MovieSearchInput value={value} onChange={setValue} onCommit={onCommit} />;
    }

    render(<Harness />);
    const input = screen.getByRole('searchbox', { name: 'Tìm kiếm phim theo tên' });

    await user.type(input, 'dune');

    expect(input).toHaveValue('dune');
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('nhấn Enter thì commit (áp dụng bộ lọc)', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();

    render(<MovieSearchInput value="dune" onChange={vi.fn()} onCommit={onCommit} />);

    const input = screen.getByRole('searchbox', { name: 'Tìm kiếm phim theo tên' });
    input.focus();
    await user.keyboard('{Enter}');

    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('nút xoá từ khoá chỉ cập nhật draft, không commit', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onCommit = vi.fn();

    render(<MovieSearchInput value="dune" onChange={onChange} onCommit={onCommit} />);

    await user.click(screen.getByRole('button', { name: 'Xoá từ khoá' }));

    expect(onChange).toHaveBeenCalledWith('');
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('không hiển thị nút xoá khi ô tìm kiếm rỗng', () => {
    render(<MovieSearchInput value="" onChange={vi.fn()} />);

    expect(screen.queryByRole('button', { name: 'Xoá từ khoá' })).not.toBeInTheDocument();
  });
});
