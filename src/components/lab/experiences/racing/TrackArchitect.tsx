import { lazy, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { useNavigate } from 'react-router'
import { experimentPath } from '../../../../content/lab'
import { useI18n } from '../../../../i18n/useI18n'
import { localizedPath } from '../../../../i18n/paths'
import { fill, useLabText, useLocalized } from '../../core/useLabText'
import { ExperienceFrame } from '../../experience/ExperienceFrame'
import { ExperienceStage } from '../../experience/ExperienceStage'
import { isTypingTarget } from '../../experience/input'
import { downloadJson, readFileText, safeFilename } from '../../experience/persist'
import { useStore } from '../../experience/store'
import { Glyph, PanelSection, Stepper, TabBar, Toast, ToolButton, ToolRow } from '../../experience/ui'
import { useMedia } from '../../experience/useMedia'
import { award } from '../../progress/progress'
import { LabAction, LabSlider, LabToggle } from '../../ui/LabControls'
import { architectText } from './architectText'
import {
  addPoint,
  dailyChallenge,
  evaluateChallenge,
  insertPoint,
  movePoint,
  patchPoint,
  removePoint,
  renameTrack,
  reverseTrack,
  rouletteTrack,
  setAllWidths,
  setClosed,
  setStart,
  trackStats,
} from './architectOps'
import {
  MAX_SLOTS,
  architect,
  checkpoint,
  commit,
  deleteSlot,
  patchUi,
  readSlots,
  redo,
  replace,
  saveSlot,
  select,
  setMessage,
  transient,
  undo,
  type Slot,
} from './architectStore'
import type { ArchitectApi } from './ArchitectScene'
import { PlanEditor, type PlanApi } from './PlanEditor'
import { describeIssue, issueText } from './trackIssues'
import {
  ELEMENT_KINDS,
  TRACK,
  appendElement,
  defaultTrack,
  emptyTrack,
  parseTrack,
  serializeTrack,
  trackSignature,
  validateTrack,
  type ElementKind,
  type Side,
} from './trackModel'
import { setActiveTrack } from './trackStore'
import styles from './TrackArchitect.module.scss'

const ArchitectScene = lazy(() => import('./ArchitectScene'))

const CAMERA = { fov: 45, position: [600, 700, 600] as [number, number, number], near: 2, far: 14000 }

type Text = ReturnType<typeof useLocalized<typeof architectText>>
type Issues = ReturnType<typeof useLocalized<typeof issueText>>
type TabId = 'build' | 'point' | 'check' | 'project'

const ELEMENT_ICONS: Record<ElementKind, string> = {
  straight: 'M4 12h16',
  gentle: 'M4 18c8 0 14-6 14-14',
  tight: 'M5 19c9 0 9-14 14-14',
  hairpin: 'M5 6h8a5 5 0 0 1 0 10H5',
  sbend: 'M4 8c6 0 6 8 12 8h4',
  climb: 'M4 17l5-3 5-5 6-3M16 6h4v4',
  descent: 'M4 7l5 3 5 5 6 3M16 18h4v-4',
}

// ── Panels ─────────────────────────────────────────────────────────────────────────────

function BuildPanel({ t, onFit }: { t: Text; onFit: () => void }) {
  const track = useStore(architect, (s) => s.track)
  const draw = useStore(architect, (s) => s.draw)
  const [side, setSide] = useState<Side>('right')

  const append = (kind: ElementKind) => {
    const next = appendElement(track, kind, side)
    if (next === track) return setMessage(fill(t.build.full, { max: TRACK.maxPoints }))
    commit(next, next.points.length - 1)
    setMessage('')
  }
  return (
    <>
      <PanelSection title={t.build.title}>
        <p className={styles.note}>{t.build.note}</p>
        <div className={styles.segments} role="group" aria-label={t.build.side}>
          {(['left', 'right'] as const).map((s) => (
            <button
              key={s}
              type="button"
              className={styles.segment}
              aria-pressed={side === s}
              onClick={() => setSide(s)}
            >
              {t.build[s]}
            </button>
          ))}
        </div>
        <div className={styles.elements}>
          {ELEMENT_KINDS.map((kind) => (
            <ToolButton
              key={kind}
              label={t.build[kind]}
              icon={
                <Glyph>
                  <path d={ELEMENT_ICONS[kind]} />
                </Glyph>
              }
              onClick={() => append(kind)}
            />
          ))}
        </div>
        <ToolRow>
          <ToolButton
            label={track.closed ? t.build.open : t.build.close}
            pressed={track.closed}
            icon={
              <Glyph>
                <path
                  d={track.closed ? 'M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6z' : 'M7 11V8a5 5 0 0 1 9.5-2M6 11h12v9H6z'}
                />
              </Glyph>
            }
            onClick={() => {
              commit(setClosed(track, !track.closed))
              setMessage(track.closed ? t.build.opened : t.build.closed)
            }}
          />
          <ToolButton
            label={t.build.reverse}
            icon={
              <Glyph>
                <path d="M7 4l-4 4 4 4M3 8h14M17 20l4-4-4-4M21 16H7" />
              </Glyph>
            }
            onClick={() => commit(reverseTrack(track))}
          />
        </ToolRow>
        <LabSlider
          label={t.build.widthAll}
          value={track.points[0]?.width ?? 12}
          min={TRACK.minWidth}
          max={TRACK.maxWidth}
          step={1}
          format={(v) => `${v} m`}
          onChange={(width) => commit(setAllWidths(track, width))}
        />
      </PanelSection>
      <PanelSection title={t.build.roulette}>
        <p className={styles.note}>{t.build.rouletteNote}</p>
        <LabAction
          variant="primary"
          onClick={() => {
            replace(rouletteTrack(draw), fill(t.build.drawn, { n: draw }))
            patchUi({ draw: draw + 1 })
            window.requestAnimationFrame(onFit)
          }}
        >
          {t.build.spin}
        </LabAction>
      </PanelSection>
      <PanelSection title={t.build.start} collapsible defaultOpen={false}>
        <ToolRow>
          <ToolButton
            label={t.build.labCircuit}
            onClick={() => {
              replace(defaultTrack())
              window.requestAnimationFrame(onFit)
            }}
          />
          <ToolButton
            label={t.build.empty}
            onClick={() => {
              replace(emptyTrack())
              window.requestAnimationFrame(onFit)
            }}
          />
        </ToolRow>
      </PanelSection>
    </>
  )
}

function PointPanel({ t, onCentre }: { t: Text; onCentre: (x: number, z: number) => void }) {
  const track = useStore(architect, (s) => s.track)
  const selected = useStore(architect, (s) => s.selected)
  const point = track.points[selected]
  const count = track.points.length
  const step = (delta: number) => {
    if (count === 0) return
    const next = (selected + delta + count) % count
    select(next)
    onCentre(track.points[next].x, track.points[next].z)
  }
  return (
    <PanelSection
      title={t.point.title}
      actions={<span className={styles.which}>{point ? fill(t.point.which, { n: selected + 1, count }) : ''}</span>}
    >
      <ToolRow>
        <ToolButton
          label={t.point.previous}
          icon={
            <Glyph>
              <path d="M14 5l-7 7 7 7" />
            </Glyph>
          }
          disabled={count === 0}
          onClick={() => step(-1)}
        />
        <ToolButton
          label={t.point.next}
          icon={
            <Glyph>
              <path d="M10 5l7 7-7 7" />
            </Glyph>
          }
          disabled={count === 0}
          onClick={() => step(1)}
        />
      </ToolRow>
      {!point ? (
        <p className={styles.note}>{t.point.none}</p>
      ) : (
        <>
          <LabSlider
            label={t.point.width}
            value={point.width}
            min={TRACK.minWidth}
            max={TRACK.maxWidth}
            step={1}
            format={(v) => `${v} m`}
            onChange={(width) => commit(patchPoint(track, selected, { width }))}
          />
          <LabSlider
            label={t.point.elevation}
            value={point.y}
            min={-TRACK.maxElevation}
            max={TRACK.maxElevation}
            step={0.5}
            format={(v) => `${v} m`}
            onChange={(y) => commit(patchPoint(track, selected, { y }))}
          />
          <fieldset className={styles.fieldset}>
            <legend>{t.point.flags}</legend>
            <LabToggle
              label={t.point.kerb}
              checked={point.kerb}
              onChange={(kerb) => commit(patchPoint(track, selected, { kerb }))}
            />
            <LabToggle
              label={t.point.gravel}
              checked={point.gravel}
              onChange={(gravel) => commit(patchPoint(track, selected, { gravel }))}
            />
            <p className={styles.note}>{t.point.flagsNote}</p>
          </fieldset>
          <div className={styles.coords}>
            <Stepper
              label={t.point.x}
              value={point.x}
              step={5}
              digits={1}
              min={-TRACK.maxCoord}
              max={TRACK.maxCoord}
              onChange={(x) => commit(movePoint(track, selected, x, point.z))}
            />
            <Stepper
              label={t.point.z}
              value={point.z}
              step={5}
              digits={1}
              min={-TRACK.maxCoord}
              max={TRACK.maxCoord}
              onChange={(z) => commit(movePoint(track, selected, point.x, z))}
            />
          </div>
          <ToolRow>
            <ToolButton
              label={selected === track.start ? t.point.isStart : t.point.start}
              pressed={selected === track.start}
              icon={
                <Glyph>
                  <path d="M5 21V4M5 4h13l-3 4 3 4H5" />
                </Glyph>
              }
              onClick={() => commit(setStart(track, selected))}
            />
            <ToolButton
              tone="danger"
              label={t.point.remove}
              icon={
                <Glyph>
                  <path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13" />
                </Glyph>
              }
              onClick={() => commit(removePoint(track, selected), -1)}
            />
          </ToolRow>
        </>
      )}
    </PanelSection>
  )
}

const metricText = (t: Text, metric: string) =>
  (t.check as Record<string, string>)[metric === 'straight' ? 'straight' : metric] ?? metric
const formatMetric = (metric: string, value: number) =>
  metric === 'length' || metric === 'straight' || metric === 'elevation' || metric === 'radius'
    ? `${Math.round(value)} m`
    : String(Math.round(value))

function CheckPanel({ t, issues, onShow }: { t: Text; issues: Issues; onShow: (x: number, z: number) => void }) {
  const track = useStore(architect, (s) => s.track)
  const report = useMemo(() => validateTrack(track, 4), [track])
  const stats = useMemo(() => (report.samples ? trackStats(report.samples) : null), [report.samples])
  const [challenge] = useState(() => dailyChallenge(new Date()))
  const result = evaluateChallenge(challenge, report, stats)
  const errors = report.issues.filter((issue) => issue.severity === 'error')
  const [today] = useState(() => new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState('')

  // Completion is a fact about the track, so the points follow from it, once per day per challenge.
  useEffect(() => {
    if (!result.complete) return
    const paid = award(`track:challenge:${challenge.id}:${today}`, 40)
    setNote(paid.fresh ? fill(t.challenge.done, { xp: paid.xp }) : t.challenge.again)
  }, [result.complete, challenge.id, today, t])

  return (
    <>
      <PanelSection title={t.check.title}>
        <p className={styles.verdict} data-ok={report.drivable}>
          <span aria-hidden="true">{report.drivable ? '✓' : '✕'}</span>{' '}
          {report.drivable ? t.check.ok : fill(t.check.fail, { n: errors.length })}
        </p>
        {report.issues.length === 0 ? (
          <p className={styles.note}>{t.check.nothing}</p>
        ) : (
          <ul className={styles.issues}>
            {report.issues.map((issue, i) => (
              <li key={i} data-severity={issue.severity}>
                <span className={styles.badge}>{issue.severity === 'error' ? t.check.error : t.check.warning}</span>
                <span>{describeIssue(issues, issue)}</span>
                {issue.at && (
                  <button type="button" className={styles.link} onClick={() => onShow(issue.at!.x, issue.at!.z)}>
                    {t.check.show}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </PanelSection>
      <PanelSection title={t.check.stats} collapsible defaultOpen>
        {stats ? (
          <dl className={styles.stats}>
            {(['length', 'corners', 'hairpins', 'straight', 'elevation', 'radius'] as const).map((key) => (
              <div key={key}>
                <dt>{t.check[key]}</dt>
                <dd>{formatMetric(key, stats[key])}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className={styles.note}>{t.check.nothing}</p>
        )}
        <p className={styles.note}>{t.check.statsNote}</p>
      </PanelSection>
      <PanelSection title={`${t.challenge.title}: ${t.challenge[challenge.id as 'technical']}`}>
        <p className={styles.note}>{t.challenge.note}</p>
        <ul className={styles.rules}>
          {result.rules.map(({ rule, actual, pass }, i) => (
            <li key={i} data-pass={pass}>
              <span aria-hidden="true">{pass ? '✓' : '○'}</span>
              <span>
                {fill(rule.kind === 'min' ? t.challenge.min : t.challenge.max, {
                  metric: metricText(t, rule.metric),
                  value: formatMetric(rule.metric, rule.value),
                })}
                <em>
                  {' · '}
                  {fill(t.challenge.now, { value: stats ? formatMetric(rule.metric, actual) : '–' })} ·{' '}
                  {pass ? t.check.pass : t.check.miss}
                </em>
              </span>
            </li>
          ))}
        </ul>
        <Toast message={result.complete ? note : ''} />
      </PanelSection>
    </>
  )
}

function ProjectPanel({ t }: { t: Text }) {
  const track = useStore(architect, (s) => s.track)
  const message = useStore(architect, (s) => s.message)
  const navigate = useNavigate()
  const { lang } = useI18n()
  const report = useMemo(() => validateTrack(track, 4), [track])
  const [slots, setSlots] = useState<Slot[]>(readSlots)
  const file = useRef<HTMLInputElement>(null)

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const picked = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!picked) return
    try {
      const parsed = parseTrack(JSON.parse(await readFileText(picked, 1_000_000)))
      if (parsed) replace(parsed, t.project.loaded)
      else setMessage(t.project.badFile)
    } catch (error) {
      setMessage(error instanceof Error && error.message === 'too-large' ? t.project.tooBig : t.project.badFile)
    }
  }

  const drive = () => {
    // Checked once more at full resolution, because this is the check that lets a car on.
    const full = validateTrack(track)
    if (!full.drivable) return setMessage(t.project.driveOff)
    setActiveTrack(track)
    award(`track:drive:${trackSignature(track)}`, 30, 'track-designer')
    navigate(localizedPath(lang, experimentPath('racing')))
  }

  return (
    <PanelSection title={t.project.title}>
      <label className={styles.nameField}>
        <span>{t.project.name}</span>
        <input
          key={track.name}
          defaultValue={track.name}
          maxLength={40}
          onBlur={(e) => e.currentTarget.value !== track.name && commit(renameTrack(track, e.currentTarget.value))}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
      </label>
      <p className={styles.note}>{t.project.driveHelp}</p>
      <LabAction variant="primary" onClick={drive} disabled={!report.drivable}>
        {t.project.drive}
      </LabAction>
      {!report.drivable && <p className={styles.note}>{t.project.driveOff}</p>}
      <div className={styles.actions}>
        <ToolButton
          label={t.project.save}
          icon={
            <Glyph>
              <path d="M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6" />
            </Glyph>
          }
          onClick={() => {
            const result = saveSlot(track)
            if (result.ok) {
              setSlots(result.slots)
              setMessage(t.project.saved)
            } else
              setMessage(result.reason === 'full' ? fill(t.project.full, { max: MAX_SLOTS }) : t.project.saveFailed)
          }}
        />
        <ToolButton
          label={t.project.download}
          icon={
            <Glyph>
              <path d="M12 4v11M7 11l5 5 5-5M5 20h14" />
            </Glyph>
          }
          onClick={() => {
            downloadJson(serializeTrack(track), safeFilename(track.name, 'json'))
            setMessage(t.project.downloaded)
          }}
        />
        <ToolButton
          label={t.project.open}
          icon={
            <Glyph>
              <path d="M12 20V9M7 13l5-5 5 5M5 4h14" />
            </Glyph>
          }
          onClick={() => file.current?.click()}
        />
        <input
          ref={file}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={onFile}
          aria-label={t.project.open}
        />
      </div>
      <p className={styles.note}>{t.project.note}</p>
      <h3 className={styles.sub}>{t.project.slots}</h3>
      {slots.length === 0 ? (
        <p className={styles.note}>{t.project.noSlots}</p>
      ) : (
        <ul className={styles.slots} aria-label={t.project.slots}>
          {slots.map((slot) => (
            <li key={slot.id}>
              <button
                type="button"
                className={styles.slotName}
                aria-label={fill(t.project.load, { name: slot.name })}
                onClick={() => replace(slot.track, t.project.loaded)}
              >
                {slot.name}
              </button>
              <ToolButton
                iconOnly
                tone="danger"
                label={fill(t.project.remove, { name: slot.name })}
                icon={
                  <Glyph>
                    <path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13" />
                  </Glyph>
                }
                onClick={() => setSlots(deleteSlot(slot.id))}
              />
            </li>
          ))}
        </ul>
      )}
      <ToolButton label={t.project.reset} onClick={() => replace(defaultTrack(), '')} />
      <Toast
        message={message}
        tone={
          message === t.project.saveFailed ||
          message === t.project.badFile ||
          message === t.project.tooBig ||
          message === t.project.driveOff
            ? 'error'
            : 'info'
        }
      />
    </PanelSection>
  )
}

// ── The page ──────────────────────────────────────────────────────────────────────────

function ArchitectApp() {
  const t = useLocalized(architectText)
  const issues = useLocalized(issueText)
  const { experiments } = useLabText()
  const track = useStore(architect, (s) => s.track)
  const selected = useStore(architect, (s) => s.selected)
  const tool = useStore(architect, (s) => s.tool)
  const snap = useStore(architect, (s) => s.snap)
  const canUndo = useStore(architect, (s) => s.past.length > 0)
  const canRedo = useStore(architect, (s) => s.future.length > 0)
  const wide = useMedia('(min-width: 68.75rem)')
  const both = useMedia('(min-width: 88rem)')
  const coarse = useMedia('(pointer: coarse)')
  const [tab, setTab] = useState<TabId | null>('build')
  const [pane, setPane] = useState<'plan' | 'preview'>('plan')
  const plan = useRef<PlanApi>(null)
  const preview = useRef<ArchitectApi | null>(null)

  const report = useMemo(() => validateTrack(track, 4), [track])
  const samples = useDeferredValue(report.samples)
  const showPlan = both || pane === 'plan'
  const showPreview = both || pane === 'preview'

  const fit = useCallback(() => {
    plan.current?.fit()
    preview.current?.frame()
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return
      const mod = event.ctrlKey || event.metaKey
      const key = event.key.toLowerCase()
      if (mod && key === 'z') (event.shiftKey ? redo : undo)()
      else if (mod && key === 'y') redo()
      else return
      event.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const onAdd = (x: number, z: number, after: number) => {
    const current = architect.get().track
    if (current.points.length >= TRACK.maxPoints) return setMessage(fill(t.build.full, { max: TRACK.maxPoints }))
    if (after >= 0) commit(insertPoint(current, after, x, z), after + 1)
    else commit(addPoint(current, x, z), current.points.length)
  }

  const tabs = [
    {
      id: 'build' as const,
      label: t.tabs.build,
      icon: (
        <Glyph>
          <path d="M4 18c8 0 14-6 14-14" />
        </Glyph>
      ),
    },
    {
      id: 'point' as const,
      label: t.tabs.point,
      icon: (
        <Glyph>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
        </Glyph>
      ),
    },
    {
      id: 'check' as const,
      label: t.tabs.check,
      icon: (
        <Glyph>
          <path d="M5 12l5 5 9-10" />
        </Glyph>
      ),
    },
    {
      id: 'project' as const,
      label: t.tabs.project,
      icon: (
        <Glyph>
          <path d="M5 4h11l3 3v13H5zM8 4v5h7V4" />
        </Glyph>
      ),
    },
  ]
  const panel = (id: TabId) =>
    id === 'build' ? (
      <BuildPanel t={t} onFit={fit} />
    ) : id === 'point' ? (
      <PointPanel t={t} onCentre={(x, z) => plan.current?.centreOn(x, z)} />
    ) : id === 'check' ? (
      <CheckPanel
        t={t}
        issues={issues}
        onShow={(x, z) => {
          setPane('plan')
          plan.current?.centreOn(x, z)
        }}
      />
    ) : (
      <ProjectPanel t={t} />
    )

  const toolbar = (
    <div className={styles.toolbar}>
      <ToolRow label={t.tools.group} className={styles.toolGroup}>
        <ToolButton
          iconOnly
          label={t.tools.select}
          pressed={tool === 'select'}
          icon={
            <Glyph>
              <path d="M6 4l12 7-5 1.5L11 18z" />
            </Glyph>
          }
          onClick={() => patchUi({ tool: 'select' })}
        />
        <ToolButton
          iconOnly
          label={t.tools.add}
          pressed={tool === 'add'}
          icon={
            <Glyph>
              <circle cx="12" cy="12" r="4" />
              <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
            </Glyph>
          }
          onClick={() => patchUi({ tool: 'add' })}
        />
        <ToolButton
          iconOnly
          label={t.tools.snap}
          pressed={snap}
          icon={
            <Glyph>
              <path d="M5 5h2M11 5h2M17 5h2M5 12h2M11 12h2M17 12h2M5 19h2M11 19h2M17 19h2" />
            </Glyph>
          }
          onClick={() => patchUi({ snap: !snap })}
        />
        <ToolButton
          iconOnly
          label={t.tools.undo}
          shortcut="Ctrl+Z"
          disabled={!canUndo}
          icon={
            <Glyph>
              <path d="M9 7H5v4M5.5 11A7 7 0 1 1 8 17" />
            </Glyph>
          }
          onClick={undo}
        />
        <ToolButton
          iconOnly
          label={t.tools.redo}
          shortcut="Ctrl+Y"
          disabled={!canRedo}
          icon={
            <Glyph>
              <path d="M15 7h4v4M18.5 11A7 7 0 1 0 16 17" />
            </Glyph>
          }
          onClick={redo}
        />
      </ToolRow>
      <ToolRow label={t.tools.fit} className={styles.toolGroup}>
        <ToolButton
          iconOnly
          label={t.tools.zoomOut}
          icon={
            <Glyph>
              <path d="M5 12h14" />
            </Glyph>
          }
          onClick={() => plan.current?.zoom(0.8)}
        />
        <ToolButton
          iconOnly
          label={t.tools.zoomIn}
          icon={
            <Glyph>
              <path d="M12 5v14M5 12h14" />
            </Glyph>
          }
          onClick={() => plan.current?.zoom(1.25)}
        />
        <ToolButton
          iconOnly
          label={t.tools.fit}
          shortcut="0"
          icon={
            <Glyph>
              <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />
            </Glyph>
          }
          onClick={fit}
        />
        {!both && (
          <ToolButton
            label={pane === 'plan' ? t.tools.preview : t.tools.plan}
            pressed={pane === 'preview'}
            icon={
              <Glyph>
                <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12L4 7.5" />
              </Glyph>
            }
            onClick={() => setPane(pane === 'plan' ? 'preview' : 'plan')}
          />
        )}
      </ToolRow>
    </div>
  )

  return (
    <div className={styles.architect} data-wide={wide}>
      {wide && (
        <aside className={styles.side} aria-label={t.tabs.build}>
          {panel('build')}
        </aside>
      )}

      <div className={styles.center}>
        {toolbar}
        <div className={styles.panes} data-both={both}>
          {showPlan && (
            <div className={styles.pane}>
              <PlanEditor
                apiRef={plan}
                track={track}
                report={report}
                selected={selected}
                tool={tool}
                snap={snap}
                coarse={coarse}
                label={t.plan.label}
                describe={(index, x, z) => fill(t.plan.point, { n: index + 1, x: Math.round(x), z: Math.round(z) })}
                onSelect={select}
                onDragStart={checkpoint}
                onMove={(index, x, z) => transient(movePoint(architect.get().track, index, x, z))}
                onAdd={onAdd}
                onRemove={(index) => commit(removePoint(architect.get().track, index), -1)}
              />
              <p className={styles.help}>{t.plan.help}</p>
            </div>
          )}
          {showPreview && (
            <div className={styles.pane}>
              <ExperienceStage
                label={experiments['track-architect'].stageLabel}
                camera={CAMERA}
                onDemand
                maxDpr={1.5}
                touchAction="none"
                className={styles.preview}
              >
                <ArchitectScene samples={samples} apiRef={preview} />
              </ExperienceStage>
              <p className={styles.help}>{t.plan.preview}</p>
            </div>
          )}
        </div>
        {wide && <p className={styles.keys}>{t.keys}</p>}
      </div>

      {wide ? (
        <aside className={styles.side} aria-label={t.tabs.label}>
          {panel('point')}
          {panel('check')}
          {panel('project')}
        </aside>
      ) : (
        <div className={styles.dock} data-open={tab !== null}>
          <TabBar
            label={t.tabs.label}
            tabs={tabs}
            value={tab ?? 'build'}
            onChange={(id) => setTab((current) => (current === id ? null : id))}
            className={styles.dockTabs}
          />
          {tab && (
            <div className={styles.dockBody} role="tabpanel">
              {panel(tab)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Track Architect: design a circuit and drive it. */
export default function TrackArchitect() {
  return (
    <ExperienceFrame id="track-architect">
      <ArchitectApp />
    </ExperienceFrame>
  )
}
