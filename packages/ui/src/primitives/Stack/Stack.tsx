import type { CSSProperties, ReactNode, HTMLAttributes } from 'react'

type Space = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 8 | 10 | 12 | 16

interface StackProps extends HTMLAttributes<HTMLDivElement> {
  gap?: Space
  align?: CSSProperties['alignItems']
  justify?: CSSProperties['justifyContent']
  wrap?: boolean
  flex?: CSSProperties['flex']
  padding?: Space
  children: ReactNode
}

function stackStyle(
  direction: 'row' | 'column',
  { gap, align, justify, wrap, flex, padding, style }: Omit<StackProps, 'children' | 'className' | 'onClick'>,
): CSSProperties {
  return {
    display: 'flex',
    flexDirection: direction,
    gap: gap != null ? `var(--space-${gap})` : undefined,
    alignItems: align,
    justifyContent: justify,
    flexWrap: wrap ? 'wrap' : undefined,
    flex,
    padding: padding != null ? `var(--space-${padding})` : undefined,
    ...style,
  }
}

export function HStack({ className, children, gap, align, justify, wrap, flex, padding, style, ...rest }: StackProps): React.ReactElement {
  return <div className={className} style={stackStyle('row', { gap, align, justify, wrap, flex, padding, style })} {...rest}>{children}</div>
}

export function VStack({ className, children, gap, align, justify, wrap, flex, padding, style, ...rest }: StackProps): React.ReactElement {
  return <div className={className} style={stackStyle('column', { gap, align, justify, wrap, flex, padding, style })} {...rest}>{children}</div>
}
