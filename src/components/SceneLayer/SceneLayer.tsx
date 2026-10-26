import { Component, type ReactNode, type Ref } from 'react'
import { cx } from '../../utils/cx'
import styles from './SceneLayer.module.scss'

interface BoundaryProps {
  fallback: ReactNode
  onError?: (error: unknown) => void
  children: ReactNode
}

/** A scene that throws (WebGL unavailable, context lost) must never take the page with it. */
class SceneBoundary extends Component<BoundaryProps, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.error('Scene failed to render; showing the fallback instead.', error)
    this.props.onError?.(error)
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

interface SceneLayerProps {
  /** The scene itself (a Canvas, later). */
  children: ReactNode
  /** Shown if the scene throws. Defaults to nothing, which leaves a plain themed background. */
  fallback?: ReactNode
  /** Called once if the scene throws, so the owner can stop trying to render it. */
  onError?: (error: unknown) => void
  className?: string
  /** The layer's own element, e.g. to measure the area the scene covers. */
  ref?: Ref<HTMLDivElement>
}

/**
 * Contract for the Hero's 3D scene. It fills the nearest positioned ancestor, sits behind the
 * content and the header, never captures pointer or touch input (so links, buttons and
 * scrolling are unaffected) and is hidden from assistive technology.
 *
 * Usage: the section sets `position: relative; isolation: isolate`, renders <SceneLayer>, and
 * puts its text and buttons in a wrapper with `position: relative; z-index: var(--z-content)`.
 * Use the `under-header` mixin to run the section beneath the sticky header. The scene reads
 * its colours from the `--scene-*` tokens and the theme from `useTheme()`.
 */
export function SceneLayer({ children, fallback = null, onError, className, ref }: SceneLayerProps) {
  return (
    <div ref={ref} className={cx(styles.layer, className)} aria-hidden="true">
      <SceneBoundary fallback={fallback} onError={onError}>
        {children}
      </SceneBoundary>
    </div>
  )
}
