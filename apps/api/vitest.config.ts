import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts', 'src/**/*.test.ts', 'test/**/*.spec.ts'],
    setupFiles: ['./test/setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: [
        'src/modules/accounting/**/*.service.ts',
        'src/modules/channels/**/*.service.ts',
        'src/modules/finance/**/*.service.ts',
        'src/modules/hr/**/*.service.ts',
        'src/modules/reports/**/*.service.ts',
        'src/modules/reservations/**/*.service.ts',
        'src/common/auth/**/*.ts',
        'src/common/locks/**/*.ts',
        'src/common/sequence/**/*.ts',
      ],
      exclude: ['src/**/*.spec.ts', 'src/main.ts', 'src/**/*.module.ts', 'src/**/dto/**'],
      // Phase 1 coverage floor; the core-logic target is raised as modules land.
      thresholds: {
        statements: 70,
        branches: 50,
        functions: 60,
        lines: 70,
      },
    },
  },
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
    },
  },
});
