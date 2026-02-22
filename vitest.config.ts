import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@chorale/api-types': resolve(__dirname, 'packages/api-types/src/index.ts'),
      '@chorale/platform': resolve(__dirname, 'packages/platform/src/index.ts'),
      '@chorale/ui': resolve(__dirname, 'packages/ui/src/index.ts'),
      '@chorale/app': resolve(__dirname, 'packages/app/src/index.ts'),
      '@chorale/server': resolve(__dirname, 'packages/server/src/index.ts'),
    },
  },
  test: {
    include: [
      'packages/*/src/**/*.test.ts',
      'chorale-cli/src/**/*.test.ts',
    ],
  },
})
