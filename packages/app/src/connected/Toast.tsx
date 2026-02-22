import { ToastContainer as ToastContainerUI } from '@chorale/ui'
import { useAppStore } from '../store/app-store'

export function ToastContainer() {
  const { toasts, dismissToast } = useAppStore()

  return <ToastContainerUI toasts={toasts} onDismiss={dismissToast} />
}
