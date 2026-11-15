'use client';

import { useEffect, useState } from 'react';

/** Trả về giá trị sau khi người dùng ngừng thay đổi `delay` ms. */
export function useDebounce<T>(value: T, delay = 350): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}
