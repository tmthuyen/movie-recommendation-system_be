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
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: './coverage',
      include: [
        'src/shared/utils/**/*.ts',
        'src/lib/axiosClient.ts',
        'src/lib/utils.ts',
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
      thresholds: {
        statements: 50,
        lines: 50,
        functions: 50,
        branches: 50,
      },
    },
  },
});
