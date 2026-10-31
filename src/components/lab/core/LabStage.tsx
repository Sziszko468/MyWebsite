import { Component, lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode, type Ref } from 'react'
import { useTheme } from '../../../theme/useTheme'
import { cx } from '../../../utils/cx'
import type { QualityTier } from '../../hero/velocityHeroConfig'
import { useIntro } from '../../intro/useIntro'
import { createLabClock, type LabClock } from './labClock'
import type { LabView } from './labMode'
import { LabPointer } from './LabPointer'
import styles from './LabStage.module.scss'
import { useLabInput } from './useLabInput'

// Three.js and react-three-fiber are their own chunk: the stage's text, controls and picture are
// plain HTML and SVG and never wait for them.
const LabCanvas = lazy(() => import('./LabScene').then((module) => ({ default: module.LabCanvas })))

/** A scene that throws (WebGL unavailable, a shader that will not compile) must never take the page with it. */
class StageBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.error('A Lab scene failed to render; the still view takes over.', error)
    this.props.onError()
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}

interface Camera {
  fov: number
  position: [number, number, number]
  near?: number
  far?: number
}

interface LiveSceneProps {
  pointer: LabPointer
  clock: LabClock
  tier: QualityTier
  view: 'live' | 'calm'
  active: boolean
  camera: Camera
  antialias?: boolean
  maxDpr?: number
  onSlow: (averageMs: number) => void
  notices: { loading: string; contextLost: string }
  children: ReactNode
}

/**
 * The canvas of a stage that is running. It exists only while a scene runs, so "has the first frame
 * been drawn" and "was the context lost" are its own state and begin afresh each time a scene starts:
 * the picture underneath stays until the first frame, then the canvas fades in over it.
 */
function LiveScene({
  pointer,
  clock,
  tier,
  view,
  active,
  camera,
  antialias,
  maxDpr,
  onSlow,
  notices,
  children,
}: LiveSceneProps) {
  const { theme } = useTheme()
  const [ready, setReady] = useState(false)
  const [contextLost, setContextLost] = useState(false)
  const onReady = useCallback(() => setReady(true), [])
  const onContextLost = useCallback(() => setContextLost(true), [])
  const onContextRestored = useCallback(() => setContextLost(false), [])
  const visible = ready && !contextLost

  return (
    <>
      <div className={cx(styles.canvas, visible && styles.canvasVisible)} aria-hidden="true" data-ready={visible}>
        <Suspense fallback={null}>
          <LabCanvas
            pointer={pointer}
            clock={clock}
            tier={tier}
            view={view}
            theme={theme}
            active={active}
            camera={camera}
            antialias={antialias}
            maxDpr={maxDpr}
            onReady={onReady}
            onSlow={onSlow}
            onContextLost={onContextLost}
            onContextRestored={onContextRestored}
          >
            {children}
          </LabCanvas>
        </Suspense>
      </div>
      {!visible && (
        <p className={styles.status} role="status">
          {contextLost ? notices.contextLost : notices.loading}
        </p>
      )}
    </>
  )
}

export interface LabStageProps {
  /** What the stage is, for assistive technology; also names the keyboard controls. */
  label: string
  view: LabView
  tier: QualityTier
  camera: Camera
  antialias?: boolean
  /** This experiment's own ceiling for the pixel ratio, if lower than the tier's. */
  maxDpr?: number
  /** `none` for a stage that owns every gesture, `pan-y` where the page must keep scrolling under a finger. */
  touchAction?: 'none' | 'pan-y'
  /** The picture shown while the scene loads and instead of it in the still view. */
  poster: ReactNode
  /** The line laid over the stage until the first interaction. */
  hint?: string
  onSlow: (averageMs: number) => void
  onFail: () => void
  /** The scene's parts (they render inside the canvas and read `useLabScene()`). */
  children: ReactNode
  /** Text for the "loading" and "context lost" notices. */
  notices: { loading: string; contextLost: string }
  className?: string
  /** The stage's own element, e.g. to attach more listeners. */
  ref?: Ref<HTMLDivElement>
  /** Hands the stage's pointer to its owner, so a control outside the canvas can send it a pulse. */
  pointerRef?: { current: LabPointer | null }
  /** Whether the stage takes the focus and keyboard (off for a decorative backdrop). */
  focusable?: boolean
}

/**
 * The DOM side of one live scene: the stage element that takes the visitor's input, the canvas
 * inside it, the picture that stands in for it, and the rules for when it may draw.
 *
 *  - It mounts the canvas only when the view is live or calm, and only once the global intro (which
 *    owns the page's one WebGL context while it is open) has gone.
 *  - It stops drawing while the stage is off screen or the tab is hidden.
 *  - A scene that throws is caught here and reported; the picture stays.
 *  - The picture is the stage's first paint and fades under the canvas when the first frame is drawn.
 */
export function LabStage({
  label,
  view,
  tier,
  camera,
  antialias,
  maxDpr,
  touchAction = 'none',
  poster,
  hint,
  onSlow,
  onFail,
  children,
  notices,
  className,
  ref: outerRef,
  pointerRef,
  focusable = true,
}: LabStageProps) {
  const { phase } = useIntro()
  const stageRef = useRef<HTMLDivElement | null>(null)
  const [pointer] = useState(() => new LabPointer())
  const [clock] = useState(createLabClock)
  const [inView, setInView] = useState(true)
  const [tabVisible, setTabVisible] = useState(() => typeof document === 'undefined' || !document.hidden)

  const heldByIntro = phase !== 'completed'
  const hasScene = view !== 'still' && !heldByIntro

  const setRefs = useCallback(
    (node: HTMLDivElement | null) => {
      stageRef.current = node
      if (typeof outerRef === 'function') outerRef(node)
      else if (outerRef) outerRef.current = node
    },
    [outerRef],
  )

  useEffect(() => {
    if (!pointerRef) return
    pointerRef.current = pointer
    return () => {
      if (pointerRef.current === pointer) pointerRef.current = null
    }
  }, [pointerRef, pointer])

  useLabInput(stageRef, pointer, clock, hasScene)

  useEffect(() => {
    const element = stageRef.current
    if (!element) return
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const onVisibility = () => setTabVisible(!document.hidden)
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  return (
    <div
      ref={setRefs}
      className={cx(styles.stage, className)}
      style={{ touchAction }}
      role="group"
      aria-label={label}
      tabIndex={focusable && hasScene ? 0 : undefined}
      data-view={view}
      data-lab-tier={tier}
    >
      <div className={styles.poster} aria-hidden="true">
        {poster}
      </div>

      {hasScene && (
        <StageBoundary onError={onFail}>
          <LiveScene
            pointer={pointer}
            clock={clock}
            tier={tier}
            view={view === 'calm' ? 'calm' : 'live'}
            active={inView && tabVisible}
            camera={camera}
            antialias={antialias}
            maxDpr={maxDpr}
            onSlow={onSlow}
            notices={notices}
          >
            {children}
          </LiveScene>
        </StageBoundary>
      )}

      {hasScene && hint && (
        <p className={styles.hint} aria-hidden="true">
          {hint}
        </p>
      )}
    </div>
  )
}
