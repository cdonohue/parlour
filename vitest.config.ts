import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@parlour/api-types': resolve(__dirname, 'packages/api-types/src/index.ts'),
      '@parlour/platform': resolve(__dirname, 'packages/platform/src/index.ts'),
      '@parlour/ui': resolve(__dirname, 'packages/ui/src/index.ts'),
      '@parlour/app': resolve(__dirname, 'packages/app/src/index.ts'),
    },
  },
  test: {
    include: [
      'packages/*/src/**/*.test.ts',
      'desktop/src/**/*.test.ts',
    ],
  },
})
