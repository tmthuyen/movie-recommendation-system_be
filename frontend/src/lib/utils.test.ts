import { describe, expect, it } from 'vitest';
import { cn } from './utils';

describe('cn', () => {
  it('ghép các class có điều kiện và bỏ giá trị falsy', () => {
    expect(cn('px-2', false && 'hidden', undefined, 'text-sm')).toBe('px-2 text-sm');
  });

  it('class sau ghi đè class trước khi xung đột Tailwind', () => {
    expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4');
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500');
  });

  it('nhận mảng và object điều kiện (API của clsx)', () => {
    // `block` cùng nhóm display với `flex` nên tailwind-merge loại `flex`.
    expect(cn(['flex', 'items-center'], { hidden: false, block: true })).toBe(
      'items-center block',
    );
  });
});
