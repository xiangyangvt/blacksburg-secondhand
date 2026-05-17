// Sprint 7 Phase 3B §8.2 — Playwright E2E 配置
//
// 跑命令:npx playwright test (或加到 npm script)
// 只跑 chromium(够 happy path 验证;FF / Safari 后续按需扩展)
// 自动启 dev server(reuse 已开的实例)

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  timeout: 30 * 1000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: false, // 共享 SQLite dev.db,跑 sequence 避免锁
  retries: 0,
  workers: 1,
  reporter: [['list']],

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      // chromium + 手动 mobile viewport(站定位移动优先,FAB 等 UI 在 sm- 才显)
      // 只装 chromium 减小 download(~150MB),webkit/firefox 视需要后加
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: false,  // chromium 不支持 isMobile=true(只 webkit)
      },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
