import type { CSSProperties, ReactNode, MouseEventHandler } from 'react'

type Space = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 8 | 10 | 12 | 16

interface StackProps {
  gap?: Space
  align?: CSSProperties['alignItems']
  justify?: CSSProperties['justifyContent']
  wrap?: boolean
  flex?: CSSProperties['flex']
  padding?: Space
  className?: string
  style?: CSSProperties
  onClick?: MouseEventHandler<HTMLDivElement>
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

export function HStack({ className, children, onClick, ...props }: StackProps): React.ReactElement {
  return <div className={className} style={stackStyle('row', props)} onClick={onClick}>{children}</div>
}

export function VStack({ className, children, onClick, ...props }: StackProps): React.ReactElement {
  return <div className={className} style={stackStyle('column', props)} onClick={onClick}>{children}</div>
}
