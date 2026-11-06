import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  describeYearRange,
  MAX_RELEASE_YEAR,
  MIN_RELEASE_YEAR,
  MovieYearRange,
  toYearDraft,
  toYearRange,
} from './MovieYearRange';

describe('describeYearRange', () => {
  it('hiển thị "Tất cả các năm" khi cả hai đầu chạm biên', () => {
    expect(describeYearRange([MIN_RELEASE_YEAR, MAX_RELEASE_YEAR])).toBe('Tất cả các năm');
  });

  it('hiển thị "Đến …" / "Từ …" khi một đầu chạm biên', () => {
    expect(describeYearRange([MIN_RELEASE_YEAR, 2010])).toBe('Đến 2010');
    expect(describeYearRange([2000, MAX_RELEASE_YEAR])).toBe('Từ 2000');
  });

  it('hiển thị khoảng năm, hoặc một năm khi hai đầu bằng nhau', () => {
    expect(describeYearRange([2000, 2010])).toBe('2000 – 2010');
    expect(describeYearRange([2000, 2000])).toBe('2000');
  });
});

describe('toYearDraft / toYearRange', () => {
  it('mặc định là toàn bộ khoảng khi props undefined', () => {
    expect(toYearDraft()).toEqual([MIN_RELEASE_YEAR, MAX_RELEASE_YEAR]);
  });

  it('đảo lại nếu from > to', () => {
    expect(toYearDraft(2010, 2000)).toEqual([2000, 2010]);
  });

  it('bỏ param khi chạm biên để URL gọn', () => {
    expect(toYearRange([MIN_RELEASE_YEAR, MAX_RELEASE_YEAR])).toEqual({
      releaseYearFrom: undefined,
      releaseYearTo: undefined,
    });
    expect(toYearRange([2000, MAX_RELEASE_YEAR])).toEqual({
      releaseYearFrom: 2000,
      releaseYearTo: undefined,
    });
  });
});

describe('MovieYearRange', () => {
  it('hiển thị text khoảng năm và aria-valuenow đúng trên 2 thumb', () => {
    render(<MovieYearRange from={2000} to={2010} onChange={vi.fn()} />);

    expect(screen.getByText('2000 – 2010')).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Năm phát hành từ' })).toHaveAttribute(
      'aria-valuenow',
      '2000',
    );
    expect(screen.getByRole('slider', { name: 'Năm phát hành đến' })).toHaveAttribute(
      'aria-valuenow',
      '2010',
    );
  });

  it('kéo bằng bàn phím gọi onChange với khoảng đã chuẩn hoá', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<MovieYearRange from={2000} to={2010} onChange={onChange} />);

    const fromThumb = screen.getByRole('slider', { name: 'Năm phát hành từ' });
    fromThumb.focus();
    await user.keyboard('{ArrowRight}');

    expect(onChange).toHaveBeenCalledWith({
      releaseYearFrom: 2001,
      releaseYearTo: 2010,
    });
  });

  it('đồng bộ lại khi props đổi (back/forward hoặc xoá chip)', () => {
    const { rerender } = render(<MovieYearRange from={2000} to={2010} onChange={vi.fn()} />);

    rerender(<MovieYearRange from={1990} to={2005} onChange={vi.fn()} />);

    expect(screen.getByText('1990 – 2005')).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Năm phát hành từ' })).toHaveAttribute(
      'aria-valuenow',
      '1990',
    );
  });

  it('layout stack vẫn hiển thị nhãn năm của 2 thumb', () => {
    render(<MovieYearRange from={1995} to={2001} onChange={vi.fn()} layout="stack" />);

    expect(screen.getByText('Khoảng năm')).toBeInTheDocument();
    expect(screen.getByText('1995 – 2001')).toBeInTheDocument();
    expect(screen.getAllByRole('slider')).toHaveLength(2);
  });
});
