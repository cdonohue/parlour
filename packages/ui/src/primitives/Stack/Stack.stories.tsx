import type { Meta, StoryObj } from '@storybook/react'
import { HStack, VStack } from './Stack'

const box = (label: string): React.ReactElement => (
  <div style={{
    padding: 'var(--space-6) var(--space-8)',
    background: 'var(--surface-3)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-sm)',
  }}>
    {label}
  </div>
)

const meta: Meta = { title: 'Layout/Stack' }
export default meta

export const Horizontal: StoryObj = {
  render: () => (
    <HStack gap={4} align="center">
      {box('A')}{box('B')}{box('C')}
    </HStack>
  ),
}

export const Vertical: StoryObj = {
  render: () => (
    <VStack gap={4}>
      {box('A')}{box('B')}{box('C')}
    </VStack>
  ),
}

export const Nested: StoryObj = {
  render: () => (
    <VStack gap={6}>
      <HStack gap={4} align="center">
        {box('Row 1A')}{box('Row 1B')}
      </HStack>
      <HStack gap={4} align="center">
        {box('Row 2A')}{box('Row 2B')}{box('Row 2C')}
      </HStack>
    </VStack>
  ),
}

export const WithWrap: StoryObj = {
  render: () => (
    <div style={{ maxWidth: 200 }}>
      <HStack gap={4} wrap>
        {box('A')}{box('B')}{box('C')}{box('D')}
      </HStack>
    </div>
  ),
}
