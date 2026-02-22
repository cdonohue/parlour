import type { Meta, StoryObj } from '@storybook/react'
import { HeaderBar } from './HeaderBar'

const noop = () => {}

const meta: Meta<typeof HeaderBar> = {
  title: 'Components/HeaderBar',
  component: HeaderBar,
}
export default meta

export const Default: StoryObj<typeof HeaderBar> = {
  args: {
    title: 'Fix auth bug',
  },
}

export const WithBreadcrumbs: StoryObj<typeof HeaderBar> = {
  args: {
    title: 'Investigate token refresh',
    breadcrumbs: [
      { label: 'Fix auth bug', onClick: noop },
    ],
  },
}

export const WithProject: StoryObj<typeof HeaderBar> = {
  args: {
    title: 'Fix auth bug',
    projects: [
      { name: 'chorale', path: '/tmp/chorale', branch: 'chad/fix-auth', isGitRepo: true },
    ],
  },
}

export const WithPrPassing: StoryObj<typeof HeaderBar> = {
  args: {
    title: 'Fix auth bug',
    projects: [
      {
        name: 'chorale', path: '/tmp/chorale', branch: 'chad/fix-auth', isGitRepo: true,
        prInfo: { number: 142, state: 'open', title: 'Fix auth token refresh', url: 'https://github.com/org/chorale/pull/142', checkStatus: 'passing', updatedAt: '2026-02-15T00:00:00Z' },
      },
    ],
    onOpenUrl: noop,
  },
}

export const WithPrPending: StoryObj<typeof HeaderBar> = {
  args: {
    title: 'Add dark mode',
    projects: [
      {
        name: 'chorale', path: '/tmp/chorale', branch: 'chad/dark-mode', isGitRepo: true,
        prInfo: { number: 88, state: 'open', title: 'Add dark mode support', url: 'https://github.com/org/chorale/pull/88', checkStatus: 'pending', updatedAt: '2026-02-15T00:00:00Z' },
      },
    ],
    onOpenUrl: noop,
  },
}

export const WithPrFailing: StoryObj<typeof HeaderBar> = {
  args: {
    title: 'Refactor queries',
    projects: [
      {
        name: 'api', path: '/tmp/api', branch: 'chad/refactor-queries', isGitRepo: true,
        prInfo: { number: 301, state: 'open', title: 'Refactor database queries', url: 'https://github.com/org/api/pull/301', checkStatus: 'failing', updatedAt: '2026-02-15T00:00:00Z' },
      },
    ],
    onOpenUrl: noop,
  },
}

export const WithMergedPr: StoryObj<typeof HeaderBar> = {
  args: {
    title: 'Update types',
    projects: [
      {
        name: 'sdk', path: '/tmp/sdk', branch: 'chad/update-types', isGitRepo: true,
        prInfo: { number: 55, state: 'merged', title: 'Update shared types', url: 'https://github.com/org/sdk/pull/55', checkStatus: 'passing', updatedAt: '2026-02-15T00:00:00Z' },
      },
    ],
    onOpenUrl: noop,
  },
}

export const MultipleProjects: StoryObj<typeof HeaderBar> = {
  args: {
    title: 'Cross-repo refactor',
    projects: [
      {
        name: 'chorale', path: '/tmp/chorale', branch: 'chad/fix-auth', isGitRepo: true,
        prInfo: { number: 142, state: 'open', title: 'Fix auth', url: 'https://github.com/org/chorale/pull/142', checkStatus: 'passing', updatedAt: '2026-02-15T00:00:00Z' },
      },
      {
        name: 'api', path: '/tmp/api', branch: 'chad/fix-auth', isGitRepo: true,
        prInfo: { number: 301, state: 'open', title: 'Fix auth API', url: 'https://github.com/org/api/pull/301', checkStatus: 'failing', updatedAt: '2026-02-15T00:00:00Z' },
      },
      { name: 'docs', path: '/tmp/docs', branch: 'main', isGitRepo: true },
    ],
    onOpenUrl: noop,
  },
}

export const Minimal: StoryObj<typeof HeaderBar> = {
  args: {
    title: 'Quick question',
  },
}
