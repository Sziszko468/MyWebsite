import { useCallback, type CSSProperties, type MouseEvent, type ReactNode } from 'react'
import { cx } from '../utils/cx'
import type { PreviewTheme } from './color'
import styles from './PreviewStage.module.scss'

interface PreviewStageProps {
  theme: PreviewTheme
  /** Custom properties for the stage (a palette's tokens, a type style, a layout, a motion). They are set on THIS element only. */
  vars?: Record<string, string>
  label?: string
  className?: string
  children?: ReactNode
}

/**
 * Where everything the visitor changes is drawn (PROMPT 36). The stage carries a theme of its own (`data-theme`, which tokens.css lets any element do) and the custom
 * properties of the visitor's choices as its own inline style, so a palette, a typeface or a duration reaches the components inside it and nothing else: not the page
 * around it, not `<html>`, not the other stages. A link inside never leaves the page (a preview is not a destination).
 */
export function PreviewStage({ theme, vars, label, className, children }: PreviewStageProps) {
  // Capture phase: runs before the router's own handler, which then sees a prevented click and does not navigate.
  const block = useCallback((event: MouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement | null)?.closest?.('a[href]')) event.preventDefault()
  }, [])

  return (
    <div
      className={cx(styles.stage, className)}
      data-theme={theme}
      data-playground-stage=""
      role={label ? 'group' : undefined}
      aria-label={label}
      style={vars as CSSProperties}
      onClickCapture={block}
      onAuxClickCapture={block}
    >
      {children}
    </div>
  )
}
