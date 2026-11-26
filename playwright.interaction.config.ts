import { defineConfig } from '@playwright/test'
import base from './playwright.config'
export default defineConfig({
  ...base,
  testMatch: '**/interaction.spec.ts',
  projects: [
    { name: 'chromium', use: { ...base.use, browserName: 'chromium' } },
    { name: 'webkit', use: { ...base.use, browserName: 'webkit', launchOptions: {} } },
  ],
})
