import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './test/browser',
  use: { baseURL: 'http://127.0.0.1:8099', headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined },
  webServer: { command: 'node src/server.js', url: 'http://127.0.0.1:8099/healthz', reuseExistingServer: false,
    env: { PORT: '8099', STORAGE: 'sqlite', SQLITE_PATH: ':memory:', NODE_ENV: 'test', ADMIN_KEY: '' } },
});
