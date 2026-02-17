import { createContext, useContext } from 'react'
import type { PlatformAdapter } from './adapter'

const PlatformContext = createContext<PlatformAdapter | null>(null)

export const PlatformProvider = PlatformContext.Provider

export function usePlatform(): PlatformAdapter {
  const adapter = useContext(PlatformContext)
  if (!adapter) throw new Error('usePlatform must be used within PlatformProvider')
  return adapter
}
