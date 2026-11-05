import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.{test,spec}.?(c|m)[jt]s?(x)'],
    exclude: ['**/node_modules/**', '**/.next/**', '**/dist/**', '**/e2e/**'],
    // Xoá mock/spy trước mỗi test để không rò rỉ giữa các case.
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: './coverage',
      // Bám theo phạm vi V19 Phase 3: helper + lib + stores + hooks + apis.
      include: [
        'src/shared/utils/**/*.ts',
        'src/lib/axiosClient.ts',
        'src/lib/utils.ts',
        'src/lib/motion.ts',
        'src/stores/**/*.ts',
        'src/hooks/tankstack/**/*.ts',
        'src/apis/**/*.ts',
        'src/components/motion/**/*.tsx',
        'src/components/movie/movie-card.tsx',
        'src/components/common/DataPagination.tsx',
        'src/components/auth/RequireRole.tsx',
        'src/components/auth/require-auth.tsx',
      ],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/**/__tests__/**'],
      // Chốt ngưỡng tối thiểu (V19 Phase 3). Số liệu hiện tại: ~68% statements/lines,
      // ~86% branches, ~85% functions — đặt 60% để không chặn CI nhưng vẫn bắt regression.
      thresholds: {
        statements: 60,
        lines: 60,
        functions: 60,
        branches: 60,
      },
    },
  },
});
