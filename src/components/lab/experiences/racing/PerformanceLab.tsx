import { lazy, useDeferredValue, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { useNavigate } from 'react-router'
import { experimentPath } from '../../../../content/lab'
import { localizedPath } from '../../../../i18n/paths'
import { useI18n } from '../../../../i18n/useI18n'
import { fill, useLabText, useLocalized } from '../../core/useLabText'
import { ExperienceFrame } from '../../experience/ExperienceFrame'
import { ExperienceStage } from '../../experience/ExperienceStage'
import { downloadJson, readFileText, safeFilename } from '../../experience/persist'
import { useStore } from '../../experience/store'
import { Glyph, Meter, PanelSection, TabBar, Toast, ToolButton, ToolRow } from '../../experience/ui'
import { useMedia } from '../../experience/useMedia'
import { artifactId, saveArtifact } from '../../artifacts/artifactActions'
import { artifactText } from '../../artifacts/artifactText'
import { setupThumbnail } from '../../artifacts/thumbnails'
import { award } from '../../progress/progress'
import { LabAction, LabSlider } from '../../ui/LabControls'
import { AeroView } from './AeroView'
import { aeroForces, deriveCarParams } from './carPhysics'
import {
  DEFAULT_SETUP,
  SETUP_RANGES,
  activeSetup,
  sameSetup,
  sanitizeSetup,
  setActiveSetup,
  setupSignature,
  type CarSetup,
  type SetupKey,
} from './carSetup'
import { formatLapTime, simulateLap, type LapEstimate } from './lapSim'
import { runBench, type BenchResult } from './perfBench'
import {
  MAX_SETUP_SLOTS,
  copySetup,
  deleteSetupSlot,
  perf,
  readSetupSlots,
  replaceCurrent,
  resetCurrent,
  saveSetupSlot,
  setEdit,
  setMessage,
  setParam,
  type SetupSlot,
} from './perfStore'
import { perfText } from './perfText'
import { defaultTrack, sampleTrack, trackSignature, validateTrack } from './trackModel'
import { activeTrack, readBest } from './trackStore'
import styles from './PerformanceLab.module.scss'

const PerfScene = lazy(() => import('./PerfScene'))

const CAMERA = { fov: 36, position: [6, 4, 7] as [number, number, number], near: 0.1, far: 120 }

type Text = ReturnType<typeof useLocalized<typeof perfText>>
type TabId = 'setup' | 'aero' | 'results' | 'saved'

const GROUPS: Array<{ id: 'aero' | 'chassis' | 'drivetrain' | 'tyres'; keys: SetupKey[] }> = [
  { id: 'aero', keys: ['downforce', 'drag', 'rideHeight'] },
  { id: 'chassis', keys: ['springs', 'mass', 'weightFront'] },
  { id: 'drivetrain', keys: ['gearing', 'brakeBias'] },
  { id: 'tyres', keys: ['tyreGrip'] },
]

interface Evaluation {
  lap: LapEstimate
  bench: BenchResult
}

const evaluate = (setup: CarSetup, samples: NonNullable<ReturnType<typeof sampleTrack>>): Evaluation => ({
  lap: simulateLap(samples, deriveCarParams(setup)),
  bench: runBench(setup),
})

function fixed(value: number | null, digits: number, unit: string): string {
  return value === null ? '–' : `${value.toFixed(digits)} ${unit}`
}

// ── Panels ─────────────────────────────────────────────────────────────────────────────

function WhichSwitch({ t }: { t: Text }) {
  const edit = useStore(perf, (s) => s.edit)
  return (
    <div className={styles.which}>
      <div className={styles.segments} role="group" aria-label={t.which.label}>
        {(['a', 'b'] as const).map((which) => (
          <button
            key={which}
            type="button"
            className={styles.segment}
            aria-pressed={edit === which}
            onClick={() => setEdit(which)}
          >
            {t.which[which]}
          </button>
        ))}
      </div>
      <ToolRow>
        <ToolButton
          label={edit === 'a' ? t.which.copyAB : t.which.copyBA}
          icon={
            <Glyph>
              <path d="M8 8h11v11H8zM5 16V5h11" />
            </Glyph>
          }
          onClick={() => copySetup(edit)}
        />
        <ToolButton
          label={t.which.reset}
          icon={
            <Glyph>
              <path d="M20 12a8 8 0 1 1-2.5-5.8M20 4v5h-5" />
            </Glyph>
          }
          onClick={resetCurrent}
        />
      </ToolRow>
    </div>
  )
}

function SetupPanel({ t }: { t: Text }) {
  const edit = useStore(perf, (s) => s.edit)
  const setup = useStore(perf, (s) => s[s.edit])
  return (
    <>
      <PanelSection title={t.which.label}>
        <WhichSwitch t={t} />
      </PanelSection>
      {GROUPS.map((group, index) => (
        <PanelSection key={`${group.id}-${edit}`} title={t.groups[group.id]} collapsible defaultOpen={index === 0}>
          {group.keys.map((key) => {
            const range = SETUP_RANGES[key]
            return (
              <div key={key} className={styles.param}>
                <LabSlider
                  label={t.params[key]}
                  value={setup[key]}
                  min={range.min}
                  max={range.max}
                  step={range.step}
                  format={(value) => `${value.toFixed(range.digits)} ${range.unit}`}
                  onChange={(value) => setParam(key, value)}
                />
                <p className={styles.help}>{t.help[key]}</p>
              </div>
            )
          })}
        </PanelSection>
      ))}
    </>
  )
}

function AeroPanel({ t }: { t: Text }) {
  const setup = useStore(perf, (s) => s[s.edit])
  const forces = aeroForces(deriveCarParams(setup), 200 / 3.6)
  const weight = setup.mass * 9.81
  const gapMm = Math.round(setup.rideHeight)
  return (
    <PanelSection title={t.aero.title}>
      <AeroView
        downforce={setup.downforce}
        drag={setup.drag}
        rideHeight={setup.rideHeight}
        label={t.aero.label}
        downforceLabel={t.aero.downforce}
        dragLabel={t.aero.drag}
        gapLabel={fill(t.aero.gap, { mm: gapMm })}
      />
      <p className={styles.note}>{t.aero.note}</p>
      <h3 className={styles.sub}>{t.aero.numbers}</h3>
      <dl className={styles.facts}>
        <div>
          <dt>{t.aero.downAt}</dt>
          <dd>{Math.round(forces.downforce)} N</dd>
        </div>
        <div>
          <dt>{t.aero.dragAt}</dt>
          <dd>{Math.round(forces.drag)} N</dd>
        </div>
        <div>
          <dt>{t.aero.ratio}</dt>
          <dd>{(forces.downforce / weight).toFixed(2)}</dd>
        </div>
      </dl>
      <p className={styles.note}>{t.aero.formula}</p>
    </PanelSection>
  )
}

interface Row {
  key: string
  label: string
  a: number | null
  b: number | null
  digits: number
  unit: string
  /** Whether a higher number is the better one. */
  higher: boolean
}

function Profile({ t, a, b, length }: { t: Text; a: Float32Array; b: Float32Array; length: number }) {
  const width = 300
  const height = 96
  const top = Math.max(...a, ...b) * 3.6 + 10
  const path = (speed: Float32Array) => {
    const step = Math.max(1, Math.floor(speed.length / 120))
    const points: string[] = []
    for (let i = 0; i < speed.length; i += step)
      points.push(`${((i / speed.length) * width).toFixed(1)} ${(height - (speed[i] * 3.6 * height) / top).toFixed(1)}`)
    return `M${points.join('L')}`
  }
  return (
    <figure className={styles.profile}>
      <svg viewBox={`0 0 ${width} ${height + 14}`} role="img" aria-label={t.results.profileLabel}>
        <line x1="0" y1={height} x2={width} y2={height} className={styles.axis} />
        <path d={path(a)} className={styles.lineA} fill="none" />
        <path d={path(b)} className={styles.lineB} fill="none" />
        <text x="0" y={height + 11}>
          0
        </text>
        <text x={width} y={height + 11} textAnchor="end">
          {Math.round(length)} m
        </text>
        <text x="2" y="9">
          {Math.round(top)} km/h
        </text>
      </svg>
      <figcaption>
        <span className={styles.keyA}>A ──</span> <span className={styles.keyB}>B - - -</span> · {t.results.profile}
      </figcaption>
    </figure>
  )
}

function ResultsPanel({
  t,
  resA,
  resB,
  trackName,
  length,
  reference,
  trackKey,
  onTest,
}: {
  t: Text
  resA: Evaluation
  resB: Evaluation
  trackName: string
  length: number
  reference: LapEstimate
  trackKey: string
  onTest: () => void
}) {
  const a = useStore(perf, (s) => s.a)
  const b = useStore(perf, (s) => s.b)
  const edit = useStore(perf, (s) => s.edit)
  const racing = useStore(activeSetup, (s) => s)
  const current = edit === 'a' ? resA : resB
  const bestA = readBest(`${trackKey}:${setupSignature(a)}`)
  const bestB = readBest(`${trackKey}:${setupSignature(b)}`)

  const rows: Row[] = [
    {
      key: 'lap',
      label: t.results.estLap,
      a: resA.lap.lapTime,
      b: resB.lap.lapTime,
      digits: 2,
      unit: 's',
      higher: false,
    },
    {
      key: 'min',
      label: t.results.estMin,
      a: resA.lap.minSpeed * 3.6,
      b: resB.lap.minSpeed * 3.6,
      digits: 0,
      unit: 'km/h',
      higher: true,
    },
    {
      key: 'avg',
      label: t.results.estAvg,
      a: resA.lap.averageSpeed * 3.6,
      b: resB.lap.averageSpeed * 3.6,
      digits: 0,
      unit: 'km/h',
      higher: true,
    },
  ]
  const bench: Row[] = [
    {
      key: '100',
      label: t.results.zeroTo100,
      a: resA.bench.zeroTo100,
      b: resB.bench.zeroTo100,
      digits: 2,
      unit: 's',
      higher: false,
    },
    {
      key: '200',
      label: t.results.zeroTo200,
      a: resA.bench.zeroTo200,
      b: resB.bench.zeroTo200,
      digits: 2,
      unit: 's',
      higher: false,
    },
    {
      key: 'top',
      label: t.results.top,
      a: resA.bench.topSpeed,
      b: resB.bench.topSpeed,
      digits: 0,
      unit: 'km/h',
      higher: true,
    },
    {
      key: 'brake',
      label: t.results.braking,
      a: resA.bench.braking,
      b: resB.bench.braking,
      digits: 0,
      unit: 'm',
      higher: false,
    },
    {
      key: 'corner',
      label: t.results.cornering,
      a: resA.bench.cornering,
      b: resB.bench.cornering,
      digits: 2,
      unit: 'g',
      higher: true,
    },
  ]
  const table = (list: Row[]) => (
    <table className={styles.table}>
      <thead>
        <tr>
          <th scope="col">{t.results.row}</th>
          <th scope="col">A</th>
          <th scope="col">B</th>
          <th scope="col">{t.results.delta}</th>
        </tr>
      </thead>
      <tbody>
        {list.map((row) => {
          const diff = row.a !== null && row.b !== null ? row.b - row.a : null
          const same = diff === null || Math.abs(diff) < Math.pow(10, -row.digits) / 2
          const good = diff !== null && (row.higher ? diff > 0 : diff < 0)
          return (
            <tr key={row.key}>
              <th scope="row">{row.label}</th>
              <td>{fixed(row.a, row.digits, row.unit)}</td>
              <td>{fixed(row.b, row.digits, row.unit)}</td>
              <td data-trend={same ? 'same' : good ? 'better' : 'worse'}>
                {same
                  ? t.results.same
                  : `${diff! > 0 ? '+' : '−'}${Math.abs(diff!).toFixed(row.digits)} · ${good ? t.results.better : t.results.worse}`}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )

  // The challenge: a fraction better than the default setup on this track, by the same estimate.
  const target = reference.lapTime * 0.985
  const percent = ((reference.lapTime - current.lap.lapTime) / reference.lapTime) * 100
  const met = current.lap.lapTime <= target
  const [today] = useState(() => new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState('')
  useEffect(() => {
    if (!met) return
    const paid = award(`perf:challenge:${trackKey}:${today}`, 50)
    setNote(paid.fresh ? fill(t.challenge.met, { xp: paid.xp }) : t.challenge.metAgain)
  }, [met, trackKey, today, t])

  const sourceName = { default: t.which.reset, a: t.which.a, b: t.which.b, custom: t.which.a }[racing.source]

  return (
    <>
      <PanelSection title={t.results.title}>
        <p className={styles.sub}>{t.results.estimateTitle}</p>
        <p className={styles.note}>{fill(t.results.track, { name: trackName, length: Math.round(length) })}</p>
        {table(rows)}
        <p className={styles.note}>{t.results.estimateNote}</p>
        <Profile t={t} a={resA.lap.speed} b={resB.lap.speed} length={length} />
      </PanelSection>
      <PanelSection title={t.results.benchTitle}>
        {table(bench)}
        <dl className={styles.facts}>
          <div>
            <dt>{t.results.slid} (A / B)</dt>
            <dd>
              {resA.bench.slid ? t.results.slidYes : t.results.slidNo} /{' '}
              {resB.bench.slid ? t.results.slidYes : t.results.slidNo}
            </dd>
          </div>
          <div>
            <dt>{t.results.driven} (A)</dt>
            <dd>{bestA ? formatLapTime(bestA) : t.results.notDriven}</dd>
          </div>
          <div>
            <dt>{t.results.driven} (B)</dt>
            <dd>{bestB ? formatLapTime(bestB) : t.results.notDriven}</dd>
          </div>
        </dl>
        <p className={styles.note}>{t.results.benchNote}</p>
      </PanelSection>
      <PanelSection title={t.challenge.title}>
        <p className={styles.note}>{t.challenge.text}</p>
        <Meter
          label={edit === 'a' ? 'A' : 'B'}
          value={Math.max(0, percent)}
          max={1.5}
          text={`${percent.toFixed(2)} %`}
          tone={met ? 'blue' : 'red'}
        />
        <p className={styles.note}>{fill(t.challenge.reference, { time: formatLapTime(reference.lapTime) })}</p>
        <p className={styles.note}>{fill(t.challenge.target, { time: formatLapTime(target) })}</p>
        <p className={styles.note}>
          {fill(t.challenge.yours, { time: formatLapTime(current.lap.lapTime), percent: percent.toFixed(2) })}
        </p>
        <p className={styles.verdict} data-ok={met}>
          <span aria-hidden="true">{met ? '✓' : '○'}</span>{' '}
          {met ? t.challenge.met.replace(' +{xp} XP', '') : t.challenge.notYet}
        </p>
        <Toast message={met ? note : ''} />
        <LabAction variant="primary" onClick={onTest}>
          {t.results.test}
        </LabAction>
        <p className={styles.note}>{t.results.testHelp}</p>
        <p className={styles.note}>{fill(t.results.inRacing, { name: sourceName })}</p>
      </PanelSection>
    </>
  )
}

function SavedPanel({ t }: { t: Text }) {
  const edit = useStore(perf, (s) => s.edit)
  const setup = useStore(perf, (s) => s[s.edit])
  const message = useStore(perf, (s) => s.message)
  const [slots, setSlots] = useState<SetupSlot[]>(readSetupSlots)
  const [name, setName] = useState('Setup')
  const a = useLocalized(artifactText)
  const file = useRef<HTMLInputElement>(null)

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const picked = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!picked) return
    try {
      const data = JSON.parse(await readFileText(picked, 200_000)) as { version?: number; setup?: unknown }
      if (data.version === 1 && typeof data.setup === 'object' && data.setup !== null)
        replaceCurrent(sanitizeSetup(data.setup), t.saved.loaded)
      else setMessage(t.saved.badFile)
    } catch {
      setMessage(t.saved.badFile)
    }
  }

  return (
    <PanelSection title={t.saved.title}>
      <label className={styles.nameField}>
        <span>{t.saved.name}</span>
        <input value={name} maxLength={40} onChange={(event) => setName(event.currentTarget.value)} />
      </label>
      <div className={styles.actions}>
        <ToolButton
          label={`${t.saved.save} (${edit.toUpperCase()})`}
          icon={
            <Glyph>
              <path d="M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6" />
            </Glyph>
          }
          onClick={() => {
            const result = saveSetupSlot(name, setup)
            if (result.ok) {
              setSlots(result.slots)
              setMessage(t.saved.savedOk)
            } else
              setMessage(result.reason === 'full' ? fill(t.saved.full, { max: MAX_SETUP_SLOTS }) : t.saved.saveFailed)
          }}
        />
        <ToolButton
          label={t.saved.download}
          icon={
            <Glyph>
              <path d="M12 4v11M7 11l5 5 5-5M5 20h14" />
            </Glyph>
          }
          onClick={() => {
            downloadJson({ version: 1, name, setup }, safeFilename(name, 'json'))
            setMessage(t.saved.downloaded)
          }}
        />
        <ToolButton
          label={a.save}
          icon={
            <Glyph>
              <path d="M4 7h16v12H4zM4 7l3-3h10l3 3M9 12h6" />
            </Glyph>
          }
          onClick={async () => {
            const label = `${name} (${edit.toUpperCase()})`
            const result = await saveArtifact({
              id: artifactId('setup', name),
              type: 'setup',
              name: label,
              payload: { version: 1, name, setup } as Record<string, unknown>,
              thumbnail: setupThumbnail(setup),
            })
            setMessage(result.ok ? (result.persistent ? a.saved : a.savedSession) : a.failed[result.reason])
          }}
        />
        <ToolButton
          label={t.saved.open}
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
          aria-label={t.saved.open}
        />
      </div>
      {slots.length === 0 ? (
        <p className={styles.note}>{t.saved.none}</p>
      ) : (
        <ul className={styles.slots} aria-label={t.saved.title}>
          {slots.map((slot) => (
            <li key={slot.id}>
              <button
                type="button"
                className={styles.slotName}
                aria-label={fill(t.saved.load, { name: slot.name })}
                onClick={() => replaceCurrent(slot.setup, t.saved.loaded)}
              >
                {slot.name}
              </button>
              <ToolButton
                iconOnly
                tone="danger"
                label={fill(t.saved.remove, { name: slot.name })}
                icon={
                  <Glyph>
                    <path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13" />
                  </Glyph>
                }
                onClick={() => setSlots(deleteSetupSlot(slot.id))}
              />
            </li>
          ))}
        </ul>
      )}
      <p className={styles.note}>{t.saved.note}</p>
      <Toast
        message={message}
        tone={
          Object.values(a.failed).includes(message) || message === t.saved.saveFailed || message === t.saved.badFile
            ? 'error'
            : 'info'
        }
      />
    </PanelSection>
  )
}

// ── The page ──────────────────────────────────────────────────────────────────────────

function PerformanceApp() {
  const t = useLocalized(perfText)
  const { experiments } = useLabText()
  const navigate = useNavigate()
  const { lang } = useI18n()
  const a = useStore(perf, (s) => s.a)
  const b = useStore(perf, (s) => s.b)
  const edit = useStore(perf, (s) => s.edit)
  const wide = useMedia('(min-width: 68.75rem)')
  const [tab, setTab] = useState<TabId | null>('setup')

  const active = useStore(activeTrack, (s) => s)
  const report = useMemo(() => validateTrack(active.track), [active.track])
  const track = report.drivable ? active.track : defaultTrack()
  const samples = useMemo(
    () => (report.drivable && report.samples ? report.samples : sampleTrack(defaultTrack())!),
    [report],
  )
  const trackKey = useMemo(() => trackSignature(track), [track])

  // The slow part (a lap estimate and five bench tests, twice) runs a beat behind the sliders.
  const lateA = useDeferredValue(a)
  const lateB = useDeferredValue(b)
  const resA = useMemo(() => evaluate(lateA, samples), [lateA, samples])
  const resB = useMemo(() => evaluate(lateB, samples), [lateB, samples])
  const reference = useMemo(() => simulateLap(samples, deriveCarParams(DEFAULT_SETUP)), [samples])

  // Comparing two different setups is the thing that earns "Engineer Mind".
  useEffect(() => {
    if (!sameSetup(a, b)) award('perf:compare', 20, 'engineer-mind')
  }, [a, b])

  const current = edit === 'a' ? a : b
  const test = () => {
    setActiveSetup(current, edit)
    navigate(localizedPath(lang, experimentPath('racing')))
  }

  const tabs = [
    {
      id: 'setup' as const,
      label: t.tabs.setup,
      icon: (
        <Glyph>
          <path d="M5 6h14M5 12h14M5 18h14M9 4v4M15 10v4M8 16v4" />
        </Glyph>
      ),
    },
    {
      id: 'aero' as const,
      label: t.tabs.aero,
      icon: (
        <Glyph>
          <path d="M3 8c6 0 6-4 12-4M3 13c8 0 8-4 18-4M3 18c6 0 8-3 12-3" />
        </Glyph>
      ),
    },
    {
      id: 'results' as const,
      label: t.tabs.results,
      icon: (
        <Glyph>
          <path d="M5 20V10M12 20V4M19 20v-7" />
        </Glyph>
      ),
    },
    {
      id: 'saved' as const,
      label: t.tabs.saved,
      icon: (
        <Glyph>
          <path d="M5 4h11l3 3v13H5zM8 4v5h7V4" />
        </Glyph>
      ),
    },
  ]
  const panel = (id: TabId) =>
    id === 'setup' ? (
      <SetupPanel t={t} />
    ) : id === 'aero' ? (
      <AeroPanel t={t} />
    ) : id === 'results' ? (
      <ResultsPanel
        t={t}
        resA={resA}
        resB={resB}
        trackName={track.name}
        length={samples.length}
        reference={reference}
        trackKey={trackKey}
        onTest={test}
      />
    ) : (
      <SavedPanel t={t} />
    )

  const viewer = (
    <div className={styles.viewport}>
      <ExperienceStage
        label={experiments['performance-lab'].stageLabel}
        camera={CAMERA}
        antialias
        onDemand
        maxDpr={1.75}
        touchAction="none"
      >
        <PerfScene setup={current} />
      </ExperienceStage>
      <p className={styles.caption}>
        <strong>{edit.toUpperCase()}</strong> · {t.viewer.note}
      </p>
    </div>
  )

  return (
    <div className={styles.lab} data-wide={wide}>
      {wide && (
        <aside className={styles.side} aria-label={t.tabs.setup}>
          {panel('setup')}
        </aside>
      )}
      {viewer}
      {wide ? (
        <aside className={styles.side} aria-label={t.tabs.results}>
          {panel('aero')}
          {panel('results')}
          {panel('saved')}
        </aside>
      ) : (
        <div className={styles.dock} data-open={tab !== null}>
          <TabBar
            label={t.tabs.label}
            tabs={tabs}
            value={tab ?? 'setup'}
            onChange={(id) => setTab((now) => (now === id ? null : id))}
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

/** Performance Lab: tune the car, compare two setups, and take one to the track. */
export default function PerformanceLab() {
  return (
    <ExperienceFrame id="performance-lab">
      <PerformanceApp />
    </ExperienceFrame>
  )
}
