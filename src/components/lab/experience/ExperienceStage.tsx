import { useCallback, useEffect, useRef, useState, type ReactNode, type Ref } from 'react'
import { cx } from '../../../utils/cx'
import { useIntro } from '../../intro/useIntro'
import { createLabClock } from '../core/labClock'
import { LabPointer } from '../core/LabPointer'
import { LiveScene, StageBoundary } from '../core/LabStage'
import { useLabText } from '../core/useLabText'
import { useExperience } from './context'
import styles from './ExperienceStage.module.scss'

interface ExperienceStageProps {
  /** What the stage is, for assistive technology. */
  label: string
  camera: { fov: number; position: [number, number, number]; near?: number; far?: number }
  antialias?: boolean
  /** Draw only when something asks: right for an editor, wrong for a game. */
  onDemand?: boolean
  maxDpr?: number
  /** `none` where the stage owns every gesture, `pan-y` where a finger should still scroll the page. */
  touchAction?: 'none' | 'pan-y' | 'auto'
  /** The scene's parts, rendered inside the canvas. */
  children: ReactNode
  /** HTML laid over the canvas (a HUD, touch pads). It takes input; the canvas below does not lose its own. */
  overlay?: ReactNode
  className?: string
  /** The stage's own element, for a controller to listen to. */
  stageRef?: Ref<HTMLDivElement>
  /** Whether the stage can take the keyboard focus (so arrows and +/- can drive its camera). */
  focusable?: boolean
}

/**
 * The canvas of an experience: the same engine as every Lab stage (pixel budget, frame-rate
 * watchdog, context loss, error boundary, pausing while hidden or off screen, theme colours), with
 * no pointer-as-force on top, because an application handles its own input. It fills its parent.
 */
export function ExperienceStage({
  label,
  camera,
  antialias,
  onDemand,
  maxDpr,
  touchAction = 'none',
  children,
  overlay,
  className,
  stageRef,
  focusable = true,
}: ExperienceStageProps) {
  const { view } = useExperience()
  const { text } = useLabText()
  const { phase } = useIntro()
  const root = useRef<HTMLDivElement | null>(null)
  // The engine's LabPointer is for stages that read the pointer as a force; here it simply stays at rest.
  const [pointer] = useState(() => new LabPointer())
  const [clock] = useState(createLabClock)
  const [inView, setInView] = useState(true)
  const [tabVisible, setTabVisible] = useState(() => typeof document === 'undefined' || !document.hidden)

  const setRefs = useCallback(
    (node: HTMLDivElement | null) => {
      root.current = node
      if (typeof stageRef === 'function') stageRef(node)
      else if (stageRef) stageRef.current = node
    },
    [stageRef],
  )

  useEffect(() => {
    const element = root.current
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

  // The global intro owns the page's one WebGL context while it is open.
  const hasScene = view.view !== 'still' && phase === 'completed'

  return (
    <div
      ref={setRefs}
      className={cx(styles.stage, className)}
      style={{ touchAction }}
      role="group"
      aria-label={label}
      tabIndex={focusable ? 0 : undefined}
      data-view={view.view}
      data-lab-stage
    >
      {hasScene && (
        <StageBoundary onError={view.onFail}>
          <LiveScene
            pointer={pointer}
            clock={clock}
            tier={view.tier}
            view={view.view === 'calm' ? 'calm' : 'live'}
            active={inView && tabVisible}
            camera={camera}
            antialias={antialias}
            maxDpr={maxDpr}
            onDemand={onDemand}
            onSlow={view.onSlow}
            notices={{ loading: text.experience.loading, contextLost: text.notices.contextLost }}
          >
            {children}
          </LiveScene>
        </StageBoundary>
      )}
      {overlay}
    </div>
  )
}
