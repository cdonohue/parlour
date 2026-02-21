import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@parlour/platform': resolve(__dirname, '../packages/platform/src/index.ts'),
      '@parlour/ui/styles/design-tokens.css': resolve(__dirname, '../packages/ui/src/styles/design-tokens.css'),
      '@parlour/ui': resolve(__dirname, '../packages/ui/src/index.ts'),
      '@parlour/app': resolve(__dirname, '../packages/app/src/index.ts'),
      '@parlour/api-types': resolve(__dirname, '../packages/api-types/src/index.ts'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          xterm: ['@xterm/xterm', '@xterm/addon-fit', '@xterm/addon-webgl', '@xterm/addon-web-links'],
        },
      },
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  envPrefix: ['VITE_', 'TAURI_'],
})
