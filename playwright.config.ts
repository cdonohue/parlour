import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 0,
  workers: 1,
  projects: [
    {
      name: 'browser',
      use: { browserName: 'chromium' },
    },
  ],
  webServer: {
    command: './e2e/start-test-env.sh',
    port: 5199,
    timeout: 30_000,
    reuseExistingServer: false,
  },
})
