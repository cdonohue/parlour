import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  root: resolve(__dirname, 'dev'),
  plugins: [react()],
  resolve: {
    alias: {
      '@chorale/platform/testing/mock-adapter': resolve(__dirname, '../platform/src/testing/mock-adapter.ts'),
      '@chorale/platform': resolve(__dirname, '../platform/src/index.ts'),
      '@chorale/ui/styles/design-tokens.css': resolve(__dirname, '../ui/src/styles/design-tokens.css'),
      '@chorale/ui': resolve(__dirname, '../ui/src/index.ts'),
      '@chorale/app': resolve(__dirname, 'src/index.ts'),
      '@chorale/api-types': resolve(__dirname, '../api-types/src/index.ts'),
    },
  },
})
