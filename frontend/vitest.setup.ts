import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

/**
 * Setup dùng chung cho toàn bộ test frontend (Vitest + jsdom).
 *
 * - `@testing-library/jest-dom/vitest`: thêm matcher (`toBeInTheDocument`, `toHaveAttribute`…).
 * - `cleanup()` sau mỗi test để DOM không rò rỉ giữa các file/case.
 * - Mock `next/image` (không tối ưu ảnh trong unit test) và `next/navigation`
 *   (App Router không chạy trong jsdom).
 * - Polyfill các Web API mà jsdom chưa hỗ trợ (matchMedia, ResizeObserver…).
 */

// ---------------------------------------------------------------------------
// next/image → <img> thuần (giữ nguyên src/alt/width/height để test assert được)
// ---------------------------------------------------------------------------
vi.mock('next/image', async () => {
  const React = await import('react');

  const NextImageMock = (props: Record<string, unknown>) => {
    const {
      src,
      alt,
      width,
      height,
      fill: _fill,
      priority: _priority,
      sizes: _sizes,
      quality: _quality,
      placeholder: _placeholder,
      blurDataURL: _blurDataURL,
      loader: _loader,
      unoptimized: _unoptimized,
      ...rest
    } = props;

    return React.createElement('img', { src, alt, width, height, ...rest });
  };

  return { __esModule: true, default: NextImageMock };
});

// ---------------------------------------------------------------------------
// next/navigation → stub an toàn (router không điều hướng thật trong test).
// Test nào cần assert điều hướng có thể tự `vi.mock('next/navigation')` lại.
// ---------------------------------------------------------------------------
vi.mock('next/navigation', () => {
  const router = {
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  };

  return {
    useRouter: () => router,
    usePathname: () => '/',
    useSearchParams: () => new URLSearchParams(),
    useParams: () => ({}),
    useSelectedLayoutSegment: () => null,
    useSelectedLayoutSegments: () => [],
    redirect: vi.fn(),
    permanentRedirect: vi.fn(),
    notFound: vi.fn(),
  };
});

// ---------------------------------------------------------------------------
// Polyfill Web API còn thiếu trong jsdom
// ---------------------------------------------------------------------------
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }) as unknown as MediaQueryList;
}

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

if (!globalThis.IntersectionObserver) {
  globalThis.IntersectionObserver = class IntersectionObserver {
    root = null;
    rootMargin = '';
    thresholds: number[] = [];
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  } as unknown as typeof IntersectionObserver;
}

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn();
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
});
