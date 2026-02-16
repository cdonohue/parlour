import type { Meta, StoryObj } from '@storybook/react'
import DecryptedText from './DecryptedText'

const meta: Meta<typeof DecryptedText> = {
  title: 'Components/DecryptedText',
  component: DecryptedText,
  decorators: [(Story) => <div style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-lg)', padding: 'var(--space-16)' }}><Story /></div>],
}
export default meta
type Story = StoryObj<typeof DecryptedText>

export const HoverToReveal: Story = {
  args: { text: 'Parlour', speed: 50, animateOn: 'hover' },
}

export const RevealOnView: Story = {
  args: { text: 'Hello, World!', speed: 60, sequential: true, animateOn: 'view' },
}

export const Sequential: Story = {
  args: { text: 'Decrypting...', speed: 40, sequential: true, revealDirection: 'start', animateOn: 'hover' },
}

export const FromCenter: Story = {
  args: { text: 'Center Reveal', speed: 40, sequential: true, revealDirection: 'center', animateOn: 'hover' },
}
