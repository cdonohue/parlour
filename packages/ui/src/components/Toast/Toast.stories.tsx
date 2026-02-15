import type { Meta, StoryObj } from '@storybook/react'
import { ToastContainer } from './Toast'
import type { Toast } from '../../types'

const meta: Meta<typeof ToastContainer> = {
  title: 'Components/Toast',
  component: ToastContainer,
}
export default meta

const toasts: Toast[] = [
  { id: '1', message: 'File saved successfully', type: 'info' },
  { id: '2', message: 'Failed to clone project', type: 'error' },
]

export const Default: StoryObj = {
  render: () => <ToastContainer toasts={toasts} onDismiss={(id) => console.log('dismiss', id)} />,
}

export const Empty: StoryObj = {
  render: () => <ToastContainer toasts={[]} onDismiss={() => {}} />,
}
