// Sprint 7 Phase 3B §8.1 — vitest 配置
// 单测覆盖 lib/ 层的纯函数 + 简单逻辑分支
// integration / E2E 走 Playwright(暂未配)

import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'tests/**/*.test.ts'],
    coverage: {
      reporter: ['text', 'html'],
      include: ['src/lib/**', 'src/app/api/**/route.ts'],
      exclude: ['**/*.test.ts', '**/__mocks__/**'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
