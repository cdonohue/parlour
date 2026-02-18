import { initApp, hydrateFromDisk as hydrateFromDiskWithAdapter } from '@parlour/app/store'
import type { AppState } from './types'

const adapter = window.api

export const useAppStore = initApp(adapter)

export async function hydrateFromDisk(): Promise<void> {
  await hydrateFromDiskWithAdapter(adapter, useAppStore)
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    import.meta.hot!.data.state = useAppStore.getState()
  })

  if (import.meta.hot.data.state) {
    const prev = import.meta.hot.data.state as AppState
    useAppStore.setState(prev)

    window.api.pty.list()
  }
}
