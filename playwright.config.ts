import { defineConfig } from '@playwright/test'
import { existsSync } from 'node:fs'

const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const baseURL = process.env.MARPORA_TEST_URL || 'http://127.0.0.1:1420'
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL,
    viewport: { width: 1440, height: 960 },
    launchOptions: existsSync(chrome) ? { executablePath: chrome } : {},
    screenshot: 'only-on-failure',
  },
  webServer: { command: 'npm run dev', url: baseURL, reuseExistingServer: !process.env.CI },
})
