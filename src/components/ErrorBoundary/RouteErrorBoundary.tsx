import { Component, useEffect, useRef, type ReactNode } from 'react'
import { useI18n } from '../../i18n/useI18n'
import { Button } from '../Button/Button'
import { Container } from '../Container/Container'
import { isChunkLoadError } from './chunkError'
import styles from './ErrorPanel.module.scss'

/**
 * What a visitor sees when a page's code could not be fetched or the page threw while drawing: a
 * real explanation and a way on, in their language, instead of an empty screen. Focus moves to the
 * heading so a keyboard or screen-reader user is told at once.
 */
function ErrorPanel({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { t } = useI18n()
  const heading = useRef<HTMLHeadingElement>(null)
  const outdated = isChunkLoadError(error)
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false

  useEffect(() => heading.current?.focus(), [])

  return (
    <Container size="narrow" className={styles.panel}>
      <h1 ref={heading} tabIndex={-1} className={styles.title}>
        {t.errors.title}
      </h1>
      <p className={styles.text} role="status">
        {offline ? t.errors.offline : outdated ? t.errors.outdated : t.errors.text}
      </p>
      <div className={styles.actions}>
        {/* A lazy page remembers that its code failed, so only a reload fetches it again. */}
        <Button onClick={outdated ? () => window.location.reload() : onRetry} arrow>
          {outdated ? t.errors.reload : t.errors.retry}
        </Button>
        <Button to="/" variant="secondary">
          {t.errors.home}
        </Button>
      </div>
    </Container>
  )
}

interface Props {
  /** The error clears when this changes (the page the visitor moved to), without the boundary being remounted. */
  resetKey: string
  children: ReactNode
}

/**
 * One boundary around the page area of every route (routes/LanguageLayout.tsx): the header, the footer
 * and the language and theme controls stay, and moving to another page clears the error. It is not
 * remounted per page on purpose, so the page frame's Suspense above the transition keeps working (a
 * new boundary per page would show its fallback instead of keeping the old page on screen). The
 * Lab's own boundaries sit below this one, so a failed experience never gets here.
 */
export class RouteErrorBoundary extends Component<Props, { error: unknown; resetKey: string }> {
  state: { error: unknown; resetKey: string } = { error: null, resetKey: this.props.resetKey }

  static getDerivedStateFromError(error: unknown) {
    return { error: error ?? new Error('unknown') }
  }

  // Moving to another page clears the error: the key the error belongs to is the page it happened on.
  static getDerivedStateFromProps(props: Props, state: { error: unknown; resetKey: string }) {
    return props.resetKey === state.resetKey ? null : { error: null, resetKey: props.resetKey }
  }

  componentDidCatch(error: unknown) {
    console.error('A page failed to load or draw.', error)
  }

  render() {
    return this.state.error ? <ErrorPanel error={this.state.error} onRetry={() => this.setState({ error: null })} /> : this.props.children
  }
}
