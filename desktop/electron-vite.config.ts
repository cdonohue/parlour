import { defineConfig } from 'electron-vite'
import { resolve } from 'path'

export default defineConfig({
  main: {},
  preload: {
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'src/shared'),
        '@parlour/platform': resolve(__dirname, '../packages/platform/src/index.ts'),
        '@parlour/api-types': resolve(__dirname, '../packages/api-types/src/index.ts'),
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'src/shared'),
        '@parlour/ui': resolve(__dirname, '../packages/ui/src')
      }
    }
  }
})
