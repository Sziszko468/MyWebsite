import { useState, type ReactNode } from 'react'
import { findExperiment, type LabId } from '../../../content/lab'
import { LanguageSwitcher } from '../../LanguageSwitcher/LanguageSwitcher'
import { LocalizedLink } from '../../LocalizedLink/LocalizedLink'
import { ThemeToggle } from '../../ThemeToggle/ThemeToggle'
import { useTouchFirst } from '../../hero/capabilities'
import { labProfileFor, type LabProfile } from '../core/labProfile'
import { LabPointer } from '../core/LabPointer'
import { LabStage } from '../core/LabStage'
import { useLabText } from '../core/useLabText'
import { useLabView } from '../core/useLabView'
import { ExperimentDetails } from './ExperimentDetails'
import styles from './ExperimentFrame.module.scss'
import { LabArt } from './LabArt'
import { LabChoice } from './LabControls'
import { LabDock } from './LabDock'
import { LabPanel } from './LabPanel'
import type { LabView } from '../core/labMode'

interface ExperimentFrameProps {
  id: LabId
  /** The scene's parts. They render inside the canvas and read `useLabScene()`. */
  scene: ReactNode
  /** The experiment's own controls (the panel adds the display switch under them). */
  panel: ReactNode
  camera: { fov: number; position: [number, number, number]; near?: number; far?: number }
  /** Solid objects with silhouettes want multisampling; fields of soft points do not. */
  antialias?: boolean
  /** The pixel-ratio ceiling for this experiment at a given tier, when its shader is heavier per pixel than the tier assumes. */
  dprCap?: (profile: LabProfile) => number
  /** Hides everything around the stage (the generative full view). */
  clean?: boolean
  /** Extra controls in the top bar, e.g. the way out of a full view. */
  topExtra?: ReactNode
  /** Hands the stage's pointer out, so a control outside the canvas can send it a pulse. */
  pointerRef?: { current: LabPointer | null }
  /** The stage's picture; defaults to the experiment's artwork. */
  poster?: ReactNode
}

function useDefaultPanelOpen(): boolean {
  const [open] = useState(() => typeof window === 'undefined' || !window.matchMedia('(max-width: 47.99rem)').matches)
  return open
}

/**
 * The page of one experiment: a full-height stage with the Lab's own chrome over it (title, theme
 * and language, the control panel, the dock), then the plain-text details. The chrome never covers
 * the middle of the stage: the title and switches hug the top edge, the dock the bottom, and the
 * panel one side (above the dock on a phone).
 */
export function ExperimentFrame({
  id,
  scene,
  panel,
  camera,
  antialias,
  dprCap,
  clean = false,
  topExtra,
  pointerRef,
  poster,
}: ExperimentFrameProps) {
  const { text, experiments } = useLabText()
  const state = useLabView()
  const touchFirst = useTouchFirst()
  const panelOpen = useDefaultPanelOpen()
  const experiment = findExperiment(id)
  const copy = experiments[id]
  if (!experiment) return null

  const viewOptions: Array<{ value: LabView; label: string; help: string }> = [
    { value: 'live', label: text.view.live, help: text.view.liveHelp },
    { value: 'calm', label: text.view.calm, help: text.view.calmHelp },
    { value: 'still', label: text.view.still, help: text.view.stillHelp },
  ]

  const notice =
    state.reason === 'no-webgl'
      ? text.notices.noWebgl
      : state.reason === 'failed'
        ? text.notices.failed
        : state.reason === 'user'
          ? text.notices.still
          : state.view === 'calm'
            ? text.notices.calm
            : null

  return (
    <>
      <div className={styles.frame} data-clean={clean} data-view={state.view} data-lab-experiment={id}>
        <div className={styles.stageArea}>
          <LabStage
            label={copy.stageLabel}
            view={state.view}
            tier={state.tier}
            camera={camera}
            antialias={antialias}
            maxDpr={dprCap ? dprCap(labProfileFor(state.tier)) : undefined}
            touchAction="none"
            poster={poster ?? <LabArt id={id} />}
            hint={touchFirst ? copy.hintTouch : copy.hint}
            onSlow={state.onSlow}
            onHeadroom={state.onHeadroom}
            onFail={state.onFail}
            notices={{ loading: text.notices.loading, contextLost: text.notices.contextLost }}
            pointerRef={pointerRef}
          >
            {scene}
          </LabStage>
        </div>

        <div className={styles.chrome}>
          <header className={styles.top}>
            <div className={styles.heading}>
              <LocalizedLink to="/lab" className={styles.crumb}>
                <span aria-hidden="true">←</span> {text.nav.lab}
              </LocalizedLink>
              <h1 className={styles.title}>
                <span className={styles.number}>{experiment.number}</span> {experiment.name}
              </h1>
            </div>
            <div className={styles.utils}>
              {topExtra}
              <ThemeToggle />
              <LanguageSwitcher />
            </div>
          </header>

          <div className={styles.middle}>
            {notice && (
              <p className={styles.notice} role="status">
                {notice}
                {state.reason === 'failed' && (
                  <>
                    {' '}
                    <button type="button" className={styles.retry} onClick={() => state.choose('live')}>
                      {text.notices.tryLive}
                    </button>
                  </>
                )}
              </p>
            )}

            <div className={styles.side}>
              <LabPanel
                title={text.panel.controls}
                showLabel={text.panel.show}
                hideLabel={text.panel.hide}
                defaultOpen={panelOpen}
                footer={
                  <LabChoice<LabView>
                    label={text.view.label}
                    value={state.view}
                    options={viewOptions}
                    onChange={state.choose}
                    columns={3}
                  />
                }
              >
                {panel}
              </LabPanel>
            </div>
          </div>

          <div className={styles.bottom}>
            <LabDock id={id} />
            <a className={styles.scrollCue} href="#details">
              {text.nav.details}
              <span aria-hidden="true"> ↓</span>
            </a>
          </div>
        </div>
      </div>

      <ExperimentDetails id={id} />
    </>
  )
}
