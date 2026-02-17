import type { Preview, Decorator } from '@storybook/react'
import '../src/styles/index.css'

const withTheme: Decorator = (Story, context) => {
  const theme = context.globals.theme ?? 'dark'
  document.documentElement.setAttribute('data-theme', theme === 'dark' ? '' : theme)
  return Story()
}

const preview: Preview = {
  globalTypes: {
    theme: {
      description: 'Color theme',
      toolbar: {
        title: 'Theme',
        icon: 'mirror',
        items: [
          { value: 'dark', title: 'Dark' },
          { value: 'light', title: 'Light' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {
    theme: 'dark',
  },
  decorators: [withTheme],
  parameters: {
    backgrounds: { disable: true },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
}

export default preview
