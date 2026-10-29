import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    testTimeout: 60000,
    hookTimeout: 60000,
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
  },
});
