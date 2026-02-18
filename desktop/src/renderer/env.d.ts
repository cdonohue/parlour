/// <reference types="vite/client" />

import type { PlatformAdapter } from '@parlour/platform'

declare global {
  interface Window {
    api: PlatformAdapter
  }
}

declare module '*.module.css' {
  const classes: { [key: string]: string }
  export default classes
}
