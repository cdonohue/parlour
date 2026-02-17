import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  root: resolve(__dirname, 'dev'),
  plugins: [react()],
  resolve: {
    alias: {
      '@parlour/platform/testing/mock-adapter': resolve(__dirname, '../platform/src/testing/mock-adapter.ts'),
      '@parlour/platform': resolve(__dirname, '../platform/src/index.ts'),
      '@parlour/ui/styles/design-tokens.css': resolve(__dirname, '../ui/src/styles/design-tokens.css'),
      '@parlour/ui': resolve(__dirname, '../ui/src/index.ts'),
      '@parlour/app': resolve(__dirname, 'src/index.ts'),
      '@parlour/api-types': resolve(__dirname, '../api-types/src/index.ts'),
    },
  },
})
