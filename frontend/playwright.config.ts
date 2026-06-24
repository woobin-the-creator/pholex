import { defineConfig, devices } from '@playwright/test'

// e2e는 백엔드 없이 실제 앱을 VITE_DEMO_MODE로 띄워 검증한다(데모 데이터로 end-to-end 렌더).
// vitest(jsdom 단위/통합)와 분리: 스펙은 e2e/ 디렉터리에만 두고, vite.config.ts의
// test.exclude 가 vitest 쪽에서 e2e/ 를 무시한다.
const PORT = 5199

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: { VITE_DEMO_MODE: 'true' },
  },
})
