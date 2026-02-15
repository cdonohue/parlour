import type { Meta, StoryObj } from '@storybook/react'
import { SidebarItem } from './SidebarItem'
import type { PrInfo } from '../../types'

const meta: Meta<typeof SidebarItem> = {
  title: 'Components/SidebarItem',
  component: SidebarItem,
  decorators: [
    (Story) => (
      <div style={{ width: 220, background: 'var(--surface-0)', padding: 4 }}>
        <Story />
      </div>
    ),
  ],
}
export default meta

const noop = () => {}

const baseProps = {
  name: 'feature-auth',
  branch: 'chad/feature-auth',
  projectId: 'p1',
  prStatusMap: new Map<string, PrInfo>(),
  ghAvailability: new Map<string, boolean>(),
  prLinkProvider: 'github' as const,
  onSelect: noop,
  onDelete: noop,
  onRename: noop,
}

export const Default: StoryObj = {
  render: () => <SidebarItem {...baseProps} />,
}

export const Active: StoryObj = {
  render: () => <SidebarItem {...baseProps} active />,
}

export const WithBranch: StoryObj = {
  render: () => (
    <SidebarItem {...baseProps} name="auth-work" branch="chad/feature-auth" />
  ),
}

const prOpen = new Map<string, PrInfo>([
  [
    'p1:chad/feature-auth',
    {
      number: 42,
      state: 'open',
      title: 'Add auth',
      url: 'https://github.com/org/repo/pull/42',
      checkStatus: 'passing',
      updatedAt: new Date().toISOString(),
    },
  ],
])
const ghAvailable = new Map([['p1', true]])

export const WithPrOpen: StoryObj = {
  render: () => (
    <SidebarItem
      {...baseProps}
      name="auth-work"
      prStatusMap={prOpen}
      ghAvailability={ghAvailable}
    />
  ),
}

export const WithPrMerged: StoryObj = {
  render: () => (
    <SidebarItem
      {...baseProps}
      name="auth-work"
      prStatusMap={
        new Map([
          [
            'p1:chad/feature-auth',
            {
              number: 42,
              state: 'merged',
              title: 'Add auth',
              url: 'https://github.com/org/repo/pull/42',
              checkStatus: 'passing',
              updatedAt: new Date().toISOString(),
            },
          ],
        ])
      }
      ghAvailability={ghAvailable}
    />
  ),
}

export const WithPrClosed: StoryObj = {
  render: () => (
    <SidebarItem
      {...baseProps}
      name="auth-work"
      prStatusMap={
        new Map([
          [
            'p1:chad/feature-auth',
            {
              number: 42,
              state: 'closed',
              title: 'Add auth',
              url: 'https://github.com/org/repo/pull/42',
              checkStatus: 'none',
              updatedAt: new Date().toISOString(),
            },
          ],
        ])
      }
      ghAvailability={ghAvailable}
    />
  ),
}

export const Unread: StoryObj = {
  render: () => <SidebarItem {...baseProps} unread />,
}

export const ClaudeActive: StoryObj = {
  render: () => <SidebarItem {...baseProps} claudeActive />,
}

export const Simple: StoryObj = {
  render: () => (
    <SidebarItem {...baseProps} name="nightly-build" branch="main" />
  ),
}
