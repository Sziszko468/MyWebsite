import { lazy, useCallback, useEffect, useId, useMemo, useRef, useState, type RefObject } from 'react'
import { experimentPath } from '../../../../content/lab'
import { LocalizedLink } from '../../../LocalizedLink/LocalizedLink'
import { fill, useLabText, useLocalized } from '../../core/useLabText'
import { ExperienceFrame } from '../../experience/ExperienceFrame'
import { ExperienceStage } from '../../experience/ExperienceStage'
import { HoldButton, useKeyState } from '../../experience/input'
import { useStore } from '../../experience/store'
import { Glyph, PanelSection, Toast, ToolButton } from '../../experience/ui'
import { useMedia } from '../../experience/useMedia'
import { award } from '../../progress/progress'
import { LabAction, LabChoice } from '../../ui/LabControls'
import { LookPanel } from './LookPanel'
import { activeSetup } from './carSetup'
import { slalomFits } from './challenges'
import { formatLapTime } from './lapSim'
import type { RaceMode } from './lapTimer'
import { CAMERA_MODES, type CameraMode } from './racingCamera'
import { racingText } from './racingText'
import type { RacingApi } from './RacingScene'
import {
  DEFAULT_CONDITIONS,
  RAIN_GRIP,
  SKIES,
  TIMES,
  parseConditions,
  type Conditions,
  type Sky,
  type TimeChoice,
} from './weather'
import { createControls, createTelemetry, type RaceEvent, type Telemetry } from './telemetry'
import { describeIssue, issueText } from './trackIssues'
import { defaultTrack, sampleTrack, validateTrack, type TrackSamples } from './trackModel'
import { activeTrack, resetActiveTrack } from './trackStore'
import styles from './Racing.module.scss'

const RacingScene = lazy(() => import('./RacingScene'))

const CAMERA = { fov: 60, position: [0, 6, -10] as [number, number, number], near: 0.3, far: 4200 }
/** The keys the race takes, so the page does not scroll while the stage has the keyboard. */
const CLAIM = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'] as const

type Text = ReturnType<typeof useLocalized<typeof racingText>>

const setText = (element: HTMLElement | null, value: string) => {
  if (element && element.textContent !== value) element.textContent = value
}

// ── The instruments ─────────────────────────────────────────────────────────────────────

function Hud({
  telemetry,
  t,
  mode,
  conditionsText,
}: {
  telemetry: Telemetry
  t: Text
  mode: RaceMode
  conditionsText: string
}) {
  const speed = useRef<HTMLSpanElement>(null)
  const gear = useRef<HTMLSpanElement>(null)
  const rpm = useRef<HTMLDivElement>(null)
  const time = useRef<HTMLSpanElement>(null)
  const lap = useRef<HTMLSpanElement>(null)
  const last = useRef<HTMLSpanElement>(null)
  const best = useRef<HTMLSpanElement>(null)
  const ghostRef = useRef<HTMLSpanElement>(null)
  const driftScore = useRef<HTMLSpanElement>(null)
  const ckptMain = useRef<HTMLSpanElement>(null)
  const ckptLeft = useRef<HTMLElement>(null)
  const ckptNext = useRef<HTMLElement>(null)
  const ckptMissed = useRef<HTMLElement>(null)
  const precMain = useRef<HTMLSpanElement>(null)
  const precGate = useRef<HTMLElement>(null)
  const precHits = useRef<HTMLElement>(null)
  const precMissed = useRef<HTMLElement>(null)
  const driftChain = useRef<HTMLElement>(null)
  const driftLeft = useRef<HTMLElement>(null)
  const driftBest = useRef<HTMLElement>(null)
  const splits = useRef<HTMLParagraphElement>(null)
  const status = useRef<HTMLSpanElement>(null)
  const invalid = useRef<HTMLSpanElement>(null)
  const force = useRef<HTMLSpanElement>(null)
  const big = useRef<HTMLDivElement>(null)
  const latest = useRef({ t, mode })
  useEffect(() => {
    latest.current = { t, mode }
  })

  useEffect(() => {
    const tick = () => {
      const d = telemetry
      const { t: words, mode: current } = latest.current
      setText(speed.current, String(Math.round(d.speed)))
      setText(gear.current, d.speed < 2 && d.throttle === 0 ? 'N' : String(d.gear))
      if (rpm.current) {
        rpm.current.style.setProperty('--rpm', String(Math.max(0, Math.min(1, (d.rpm - 4500) / 7500))))
        rpm.current.dataset.redline = d.rpm > 11200 ? 'true' : 'false'
      }
      setText(time.current, formatLapTime(d.timing ? d.time : null))
      setText(
        lap.current,
        !d.timing
          ? words.hud.notTiming
          : current === 'trial'
            ? fill(words.hud.lapOf, { lap: d.lap, laps: d.laps })
            : fill(words.hud.lapNumber, { lap: d.lap }),
      )
      setText(last.current, formatLapTime(d.last))
      setText(best.current, formatLapTime(d.best))
      if (current === 'checkpoint') {
        setText(ckptMain.current, `${d.ckptPassed} / ${d.ckptTotal}`)
        setText(ckptLeft.current, `${Math.max(0, d.ckptRemaining).toFixed(1)} s`)
        setText(ckptNext.current, d.phase === 'running' ? `${Math.round(d.ckptDistance)} m` : '–')
        setText(ckptMissed.current, String(d.ckptMissed))
      }
      if (current === 'precision') {
        setText(precMain.current, `${d.precTime.toFixed(1)} s`)
        setText(precGate.current, `${d.precGate} / ${d.precTotal}`)
        setText(precHits.current, String(d.precHits))
        setText(precMissed.current, String(d.precMissed))
      }
      if (current === 'drift') {
        setText(driftScore.current, String(d.driftScore))
        setText(driftChain.current, d.driftChain > 0 ? `${Math.round(d.driftChain)} ×${d.driftCombo}` : '–')
        if (driftChain.current) driftChain.current.dataset.active = d.driftOn ? 'true' : 'false'
        setText(driftLeft.current, `${Math.ceil(d.driftRemaining)} s`)
        setText(driftBest.current, String(Math.max(d.driftBest, d.driftScore)))
      }
      if (ghostRef.current) {
        const gap = d.ghostDelta
        setText(
          ghostRef.current,
          d.ghostTime === null
            ? words.hud.ghostNone
            : gap === null
              ? formatLapTime(d.ghostTime)
              : `${gap > 0 ? '+' : '−'}${Math.abs(gap).toFixed(2)} s`,
        )
        ghostRef.current.dataset.trend = gap === null ? 'none' : gap > 0 ? 'behind' : 'ahead'
      }
      setText(splits.current, d.splits.map((split, i) => `S${i + 1} ${formatLapTime(split)}`).join('  ·  '))
      setText(status.current, words.hud.status[d.surface])
      if (status.current) status.current.dataset.state = d.surface
      if (invalid.current) invalid.current.hidden = d.clean || !d.timing
      setText(force.current, `${Math.abs(d.lateralG).toFixed(1)} g`)
      if (big.current) {
        let message = ''
        if (d.phase === 'countdown') message = String(Math.max(1, Math.ceil((d.countdown - 0.2) / 0.9)))
        else if (d.timing && d.sinceGo < 1.2) message = words.hud.go
        setText(big.current, message)
        big.current.hidden = message === ''
      }
    }
    tick()
    const id = window.setInterval(tick, 70)
    return () => window.clearInterval(id)
  }, [telemetry])

  return (
    <>
      <div className={styles.speedo} role="group" aria-label={t.hud.stats}>
        <div className={styles.speedRow}>
          <span ref={speed} className={styles.speed} aria-hidden="true">
            0
          </span>
          <span className={styles.unit} aria-hidden="true">
            {t.hud.kmh}
          </span>
          <span className={styles.gearBox} aria-hidden="true">
            <span className={styles.gearLabel}>{t.hud.gear}</span>
            <span ref={gear} className={styles.gear}>
              N
            </span>
          </span>
        </div>
        <div ref={rpm} className={styles.rpm} aria-hidden="true">
          <span />
        </div>
      </div>

      {mode === 'checkpoint' ? (
        <div className={styles.timing} role="group" aria-label={t.challenges.checkpoint.title}>
          <span className={styles.lap}>{t.challenges.checkpoint.title}</span>
          <span ref={ckptMain} className={styles.time} />
          <dl className={styles.times}>
            <div>
              <dt>{t.challenges.checkpoint.left}</dt>
              <dd ref={ckptLeft} />
            </div>
            <div>
              <dt>{t.challenges.checkpoint.next}</dt>
              <dd ref={ckptNext} />
            </div>
            <div>
              <dt>{t.challenges.checkpoint.missedLabel}</dt>
              <dd ref={ckptMissed} />
            </div>
          </dl>
          {conditionsText && <span className={styles.conditions}>{conditionsText}</span>}
        </div>
      ) : mode === 'precision' ? (
        <div className={styles.timing} role="group" aria-label={t.challenges.precision.title}>
          <span className={styles.lap}>{t.challenges.precision.time}</span>
          <span ref={precMain} className={styles.time} />
          <dl className={styles.times}>
            <div>
              <dt>{t.challenges.precision.gate}</dt>
              <dd ref={precGate} />
            </div>
            <div>
              <dt>{t.challenges.precision.hits}</dt>
              <dd ref={precHits} />
            </div>
            <div>
              <dt>{t.challenges.precision.missed}</dt>
              <dd ref={precMissed} />
            </div>
          </dl>
          {conditionsText && <span className={styles.conditions}>{conditionsText}</span>}
        </div>
      ) : mode === 'drift' ? (
        <div className={styles.timing} role="group" aria-label={t.drift.title}>
          <span className={styles.lap}>{t.drift.title}</span>
          <span ref={driftScore} className={styles.time} />
          <dl className={styles.times}>
            <div>
              <dt>{t.drift.chain}</dt>
              <dd ref={driftChain} className={styles.chain} />
            </div>
            <div>
              <dt>{t.drift.left}</dt>
              <dd ref={driftLeft} />
            </div>
            <div>
              <dt>{t.hud.best}</dt>
              <dd ref={driftBest} />
            </div>
          </dl>
          {conditionsText && <span className={styles.conditions}>{conditionsText}</span>}
        </div>
      ) : (
        <div className={styles.timing} role="group" aria-label={t.hud.time}>
          <span ref={lap} className={styles.lap} />
          <span ref={time} className={styles.time} />
          <dl className={styles.times}>
            <div>
              <dt>{t.hud.last}</dt>
              <dd ref={last} />
            </div>
            <div>
              <dt>{t.hud.best}</dt>
              <dd ref={best} />
            </div>
            <div>
              <dt>{t.hud.ghost}</dt>
              <dd>
                <span ref={ghostRef} data-trend="none" />
              </dd>
            </div>
          </dl>
          <p ref={splits} className={styles.splits} />
          {conditionsText && <span className={styles.conditions}>{conditionsText}</span>}
          <span ref={invalid} className={styles.invalid} hidden>
            {t.hud.invalid}
          </span>
        </div>
      )}

      <div className={styles.readouts}>
        <span ref={status} className={styles.status} data-state="asphalt" />
        <span ref={force} className={styles.force} aria-hidden="true" />
      </div>

      <div ref={big} className={styles.countdown} aria-hidden="true" hidden />
    </>
  )
}

function ReplayBar({
  t,
  telemetry,
  api,
  title,
  onExit,
}: {
  t: Text
  telemetry: Telemetry
  api: RefObject<RacingApi | null>
  title: string
  onExit: () => void
}) {
  const range = useRef<HTMLInputElement>(null)
  const clock = useRef<HTMLSpanElement>(null)
  const dragging = useRef(false)
  const seen = useRef(false)
  const [rate, setRate] = useState(1)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    const born = performance.now()
    const id = window.setInterval(() => {
      // The scene says when it is playing; if it stops (a restart, a new run) the bar goes with it.
      if (telemetry.replay) seen.current = true
      else if (seen.current || performance.now() - born > 4000) return onExit()
      if (range.current && !dragging.current) {
        range.current.max = String(Math.round(telemetry.replayDuration * 100))
        range.current.value = String(Math.round(telemetry.replayTime * 100))
      }
      setText(clock.current, `${formatLapTime(telemetry.replayTime)} / ${formatLapTime(telemetry.replayDuration)}`)
    }, 80)
    return () => window.clearInterval(id)
  }, [telemetry, onExit])

  const rates = [0.25, 0.5, 1, 2]
  return (
    <section className={styles.replay} aria-label={t.replay.group}>
      <p className={styles.replayTitle}>{title}</p>
      <div className={styles.replayRow}>
        <ToolButton
          iconOnly
          label={paused ? t.replay.play : t.replay.pause}
          pressed={paused}
          icon={
            <Glyph>
              <path d={paused ? 'M8 5l11 7-11 7z' : 'M8 5v14M16 5v14'} />
            </Glyph>
          }
          onClick={() => {
            api.current?.setReplay({ paused: !paused })
            setPaused(!paused)
          }}
        />
        <input
          ref={range}
          className={styles.scrub}
          type="range"
          min={0}
          defaultValue={0}
          step={1}
          aria-label={t.replay.scrub}
          onPointerDown={() => (dragging.current = true)}
          onPointerUp={() => (dragging.current = false)}
          onBlur={() => (dragging.current = false)}
          onChange={(event) => api.current?.setReplay({ time: Number(event.currentTarget.value) / 100 })}
        />
        <span ref={clock} className={styles.replayClock} />
      </div>
      <div className={styles.replayRow}>
        <div className={styles.rates} role="group" aria-label={t.replay.speed}>
          {rates.map((value) => (
            <button
              key={value}
              type="button"
              className={styles.segment}
              aria-pressed={rate === value}
              onClick={() => {
                api.current?.setReplay({ rate: value })
                setRate(value)
              }}
            >
              {value}×
            </button>
          ))}
        </div>
        <LabAction variant="primary" onClick={onExit}>
          {t.replay.exit}
        </LabAction>
      </div>
      <p className={styles.note}>{t.replay.hint}</p>
    </section>
  )
}

function MiniMap({ samples, telemetry, label }: { samples: TrackSamples; telemetry: Telemetry; label: string }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const layout = useMemo(() => {
    let minX = Infinity
    let maxX = -Infinity
    let minZ = Infinity
    let maxZ = -Infinity
    for (let i = 0; i < samples.count; i++) {
      minX = Math.min(minX, samples.x[i])
      maxX = Math.max(maxX, samples.x[i])
      minZ = Math.min(minZ, samples.z[i])
      maxZ = Math.max(maxZ, samples.z[i])
    }
    return { minX, minZ, width: Math.max(maxX - minX, 1), height: Math.max(maxZ - minZ, 1) }
  }, [samples])

  useEffect(() => {
    const element = canvas.current
    const g = element?.getContext('2d')
    if (!element || !g) return
    const size = 168
    const ratio = Math.min(2, window.devicePixelRatio || 1)
    element.width = size * ratio
    element.height = size * ratio
    const pad = 12
    const scale = Math.min((size - pad * 2) / layout.width, (size - pad * 2) / layout.height)
    const ox = (size - layout.width * scale) / 2
    const oz = (size - layout.height * scale) / 2
    const toX = (x: number) => ox + (x - layout.minX) * scale
    const toZ = (z: number) => oz + (z - layout.minZ) * scale
    const path = new Path2D()
    const step = Math.max(1, Math.floor(samples.count / 160))
    for (let i = 0; i < samples.count; i += step) {
      if (i === 0) path.moveTo(toX(samples.x[i]), toZ(samples.z[i]))
      else path.lineTo(toX(samples.x[i]), toZ(samples.z[i]))
    }
    if (samples.closed) path.closePath()

    const draw = () => {
      const ink = getComputedStyle(element).color
      g.setTransform(ratio, 0, 0, ratio, 0, 0)
      g.clearRect(0, 0, size, size)
      g.lineJoin = 'round'
      g.lineCap = 'round'
      g.strokeStyle = ink
      g.globalAlpha = 0.25
      g.lineWidth = 9
      g.stroke(path)
      g.globalAlpha = 0.9
      g.lineWidth = 3
      g.stroke(path)
      g.globalAlpha = 1
      // The line.
      g.fillStyle = '#f4f0e8'
      g.fillRect(toX(samples.x[0]) - 4, toZ(samples.z[0]) - 1.5, 8, 3)
      // The car.
      const x = toX(telemetry.x)
      const z = toZ(telemetry.z)
      g.save()
      g.translate(x, z)
      g.rotate(telemetry.psi)
      g.fillStyle = '#ff161f'
      g.beginPath()
      g.moveTo(7, 0)
      g.lineTo(-5, -4.5)
      g.lineTo(-5, 4.5)
      g.closePath()
      g.fill()
      g.restore()
    }
    draw()
    const id = window.setInterval(draw, 90)
    return () => window.clearInterval(id)
  }, [samples, layout, telemetry])

  return <canvas ref={canvas} className={styles.map} role="img" aria-label={label} />
}

// ── Touch pads ───────────────────────────────────────────────────────────────────────────

const Arrow = ({ dir }: { dir: 'left' | 'right' }) => (
  <Glyph>
    <path d={dir === 'left' ? 'M14 5l-7 7 7 7' : 'M10 5l7 7-7 7'} />
  </Glyph>
)

function TouchPads({ t, touch }: { t: Text; touch: ReturnType<typeof createControls>['touch'] }) {
  const hold = useMemo(
    () => ({
      left: (held: boolean) => {
        touch.left = held
      },
      right: (held: boolean) => {
        touch.right = held
      },
      gas: (held: boolean) => {
        touch.gas = held
      },
      brake: (held: boolean) => {
        touch.brake = held
      },
      hand: (held: boolean) => {
        touch.hand = held
      },
    }),
    [touch],
  )
  return (
    <div className={styles.pads} role="group" aria-label={t.touch.group}>
      <div className={styles.padsLeft}>
        <HoldButton label={t.touch.left} onHold={hold.left} className={styles.pad} shortcut="ArrowLeft">
          <Arrow dir="left" />
        </HoldButton>
        <HoldButton label={t.touch.right} onHold={hold.right} className={styles.pad} shortcut="ArrowRight">
          <Arrow dir="right" />
        </HoldButton>
      </div>
      <div className={styles.padsRight}>
        <HoldButton
          label={t.touch.hand}
          onHold={hold.hand}
          className={`${styles.pad} ${styles.padSmall}`}
          shortcut="Space"
        >
          <span>{t.touch.handShort}</span>
        </HoldButton>
        <HoldButton
          label={t.touch.brake}
          onHold={hold.brake}
          className={`${styles.pad} ${styles.padBrake}`}
          shortcut="ArrowDown"
        >
          <span>{t.touch.brakeShort}</span>
        </HoldButton>
        <HoldButton
          label={t.touch.gas}
          onHold={hold.gas}
          className={`${styles.pad} ${styles.padGas}`}
          shortcut="ArrowUp"
        >
          <span>{t.touch.gasShort}</span>
        </HoldButton>
      </div>
    </div>
  )
}

// ── The page ────────────────────────────────────────────────────────────────────────────

type TouchPref = 'auto' | 'on' | 'off'

const MODES = ['practice', 'trial', 'drift', 'checkpoint', 'precision'] as const

interface Message {
  id: number
  text: string
  tone: 'info' | 'warning' | 'error'
}

interface Result {
  total: number
  laps: Array<{ time: number; clean: boolean }>
}

function RacingApp() {
  const t = useLocalized(racingText)
  const issues = useLocalized(issueText)
  const { experiments } = useLabText()
  const menuId = useId()
  const api = useRef<RacingApi | null>(null)
  const stage = useRef<HTMLDivElement | null>(null)
  const [telemetry] = useState(createTelemetry)
  const coarse = useMedia('(pointer: coarse)')
  const wide = useMedia('(min-width: 48rem) and (min-height: 34rem)')
  const broad = useMedia('(min-width: 64rem)')

  const active = useStore(activeTrack, (value) => value)
  const setupState = useStore(activeSetup, (value) => value)
  const [mode, setMode] = useState<RaceMode>('practice')
  const [runId, setRunId] = useState(0)
  const [cameraMode, setCameraMode] = useState<CameraMode>('chase')
  const [menuOpen, setMenuOpen] = useState(false)
  const [touchPref, setTouchPref] = useState<TouchPref>('auto')
  const [soundOn, setSoundOn] = useState(false)
  const [conditions, setConditions] = useState<Conditions>(() => {
    try {
      return parseConditions(JSON.parse(window.localStorage.getItem('lab:racing:conditions') ?? 'null'))
    } catch {
      return DEFAULT_CONDITIONS
    }
  })
  const changeConditions = (patch: Partial<Conditions>) =>
    setConditions((current) => {
      const next = { ...current, ...patch }
      try {
        window.localStorage.setItem('lab:racing:conditions', JSON.stringify(next))
      } catch {
        // The choice just is not remembered.
      }
      return next
    })
  const [ghostOn, setGhostOn] = useState(() => {
    try {
      return window.localStorage.getItem('lab:racing:ghost') !== '0'
    } catch {
      return true
    }
  })
  const toggleGhost = () =>
    setGhostOn((on) => {
      try {
        window.localStorage.setItem('lab:racing:ghost', on ? '0' : '1')
      } catch {
        // The choice just is not remembered.
      }
      return !on
    })
  const [message, setMessage] = useState<Message | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [canReplay, setCanReplay] = useState(false)
  const [replaying, setReplaying] = useState(false)
  const [lapInfo, setLapInfo] = useState({ lap: 1, time: 0 })
  const [driftResult, setDriftResult] = useState<{ score: number; record: boolean } | null>(null)
  const [challengeResult, setChallengeResult] = useState<Extract<RaceEvent, { type: 'challengeEnd' }> | null>(null)
  const [engaged, setEngaged] = useState(false)
  const laps = useRef<Result['laps']>([])

  // The track the Track Architect handed over is driven only if it can be: otherwise the Lab Circuit, and a note why.
  const fallback = useMemo(() => defaultTrack(), [])
  const report = useMemo(() => validateTrack(active.track), [active.track])
  const track = report.drivable ? active.track : fallback
  const samples = useMemo(
    () => (report.drivable && report.samples ? report.samples : sampleTrack(fallback)!),
    [report, fallback],
  )
  const firstProblem = report.issues.find((issue) => issue.severity === 'error')

  const [controls] = useState(createControls)
  const cycleCamera = useCallback(
    () => setCameraMode((current) => CAMERA_MODES[(CAMERA_MODES.indexOf(current) + 1) % CAMERA_MODES.length]),
    [],
  )
  const held = useKeyState(engaged, CLAIM, (code) => {
    if (code === 'Escape') {
      api.current?.stopReplay()
      setReplaying(false)
    } else if (code === 'KeyC') cycleCamera()
    else if (code === 'KeyR') api.current?.reset()
  })
  useEffect(() => {
    controls.keys = held.current
  }, [controls, held])

  // The keyboard belongs to the race while the pointer is over the stage or it has focus; elsewhere the page scrolls as usual.
  const attach = useCallback((node: HTMLDivElement | null) => {
    stage.current = node
  }, [])
  useEffect(() => {
    const element = stage.current
    if (!element) return
    const on = () => setEngaged(true)
    const off = () => setEngaged(false)
    element.addEventListener('pointerenter', on)
    element.addEventListener('pointerleave', off)
    element.addEventListener('focusin', on)
    element.addEventListener('focusout', off)
    return () => {
      element.removeEventListener('pointerenter', on)
      element.removeEventListener('pointerleave', off)
      element.removeEventListener('focusin', on)
      element.removeEventListener('focusout', off)
    }
  }, [])

  const say = useCallback(
    (text: string, tone: Message['tone'] = 'info') => setMessage({ id: Date.now() + Math.random(), text, tone }),
    [],
  )
  useEffect(() => {
    if (!message) return
    const id = window.setTimeout(() => setMessage(null), 2800)
    return () => window.clearTimeout(id)
  }, [message])

  const onEvent = useCallback(
    (event: RaceEvent) => {
      switch (event.type) {
        case 'start':
          laps.current = []
          say(t.toast.start)
          break
        case 'gate':
          say(fill(t.toast.sector, { n: event.gate, time: formatLapTime(event.time) }))
          break
        case 'lap':
          setCanReplay(true)
          setLapInfo({ lap: event.lap, time: event.time })
          // A lap that was really driven (through both gates) is the First Lap; nothing is paid for opening the page.
          award('lap:first', 20, 'first-lap')
          laps.current.push({ time: event.time, clean: event.clean })
          say(
            fill(event.best ? t.toast.best : event.clean ? t.toast.lap : t.toast.notClean, {
              lap: event.lap,
              time: formatLapTime(event.time),
            }),
            event.clean ? 'info' : 'warning',
          )
          break
        case 'invalid':
          say(t.toast.invalid, 'warning')
          break
        case 'offtrack':
          say(t.toast.offtrack, 'warning')
          break
        case 'collision':
          say(t.toast.collision, 'warning')
          break
        case 'reset':
          say(t.toast.reset, 'warning')
          break
        case 'drift':
          say(fill(t.toast.drift, { points: event.points }))
          break
        case 'checkpoint':
          say(
            event.passed
              ? fill(t.challenges.checkpoint.passed, {
                  n: event.index + 1,
                  total: event.total,
                  bonus: event.bonus.toFixed(1),
                })
              : fill(t.challenges.checkpoint.missed, { n: event.index + 1, total: event.total }),
            event.passed ? 'info' : 'warning',
          )
          break
        case 'cone':
          say(t.challenges.precision.cone, 'warning')
          break
        case 'slalomGate':
          if (event.result === 'missed') say(t.challenges.precision.gateMissed, 'warning')
          break
        case 'challengeEnd':
          setChallengeResult(event)
          break
        case 'driftEnd':
          setDriftResult({ score: event.score, record: event.record })
          break
        case 'ghost':
          say(fill(t.toast.ghost, { time: formatLapTime(event.time) }))
          break
        case 'restart':
          setCanReplay(false)
          setReplaying(false)
          laps.current = []
          setResult(null)
          setDriftResult(null)
          setChallengeResult(null)
          say(t.toast.restart)
          break
        case 'finish':
          setResult({ total: event.total, laps: [...laps.current] })
          break
        case 'go':
          laps.current = []
          break
      }
    },
    [say, t],
  )

  const restart = useCallback(() => {
    setResult(null)
    setDriftResult(null)
    setChallengeResult(null)
    setRunId((id) => id + 1)
  }, [])
  const changeMode = (next: RaceMode) => {
    if (next === mode) return restart()
    setMode(next)
    setCanReplay(false)
    setReplaying(false)
    setResult(null)
    setDriftResult(null)
    setChallengeResult(null)
    laps.current = []
  }

  // Engine sound: only after the visitor asks for it.
  const sound = useRef<import('./engineSound').EngineSound | null>(null)
  useEffect(() => {
    if (!soundOn) return
    let id = 0
    let cancelled = false
    void import('./engineSound').then(({ EngineSound }) => {
      if (cancelled) return
      const engine = new EngineSound()
      if (!engine.start()) {
        setSoundOn(false)
        return
      }
      sound.current = engine
      id = window.setInterval(() => engine.update(telemetry), 60)
    })
    const hide = () => document.hidden && setSoundOn(false)
    document.addEventListener('visibilitychange', hide)
    return () => {
      cancelled = true
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', hide)
      sound.current?.stop()
      sound.current = null
    }
  }, [soundOn, telemetry])

  const conditionsText = [
    conditions.sky === 'rain' ? `${t.weather.sky.rain} · ${t.weather.grip} ${Math.round(RAIN_GRIP * 100)} %` : '',
    conditions.sky === 'fog' ? `${t.weather.sky.fog} · ${t.weather.short}` : '',
    conditions.time !== 'auto' ? t.weather.time[conditions.time] : '',
  ]
    .filter(Boolean)
    .join(' · ')
  const gridStart = samples.length - Math.round(6 / samples.spacing) * samples.spacing
  const slalomOk = useMemo(() => slalomFits(samples, gridStart), [samples, gridStart])
  const showTouch = touchPref === 'on' || (touchPref === 'auto' && coarse)
  const setupName = { default: t.menu.setupDefault, a: t.menu.setupA, b: t.menu.setupB, custom: t.menu.setupCustom }[
    setupState.source
  ]
  const trackName =
    active.source === 'architect' && report.drivable
      ? fill(t.menu.yourTrack, { name: active.track.name })
      : t.menu.labCircuit

  return (
    <div className={styles.race} data-touch={showTouch} data-wide={wide} data-replay={replaying}>
      <ExperienceStage
        label={experiments.racing.stageLabel}
        camera={CAMERA}
        antialias
        maxDpr={1.75}
        touchAction="pan-y"
        stageRef={attach}
        className={styles.stage}
        overlay={
          <div className={styles.overlay}>
            <div className={styles.top}>
              <div className={styles.group} role="group" aria-label={t.bar.mode}>
                {broad ? (
                  MODES.map((id) => (
                    <button
                      key={id}
                      type="button"
                      className={styles.segment}
                      aria-pressed={mode === id}
                      disabled={id === 'precision' && !slalomOk}
                      title={id === 'precision' && !slalomOk ? t.challenges.precision.unfit : undefined}
                      onClick={() => changeMode(id)}
                    >
                      {t.bar[id]}
                    </button>
                  ))
                ) : (
                  <select
                    className={styles.modeSelect}
                    aria-label={t.bar.modeSelect}
                    value={mode}
                    onChange={(event) => changeMode(event.currentTarget.value as RaceMode)}
                  >
                    {MODES.map((id) => (
                      <option key={id} value={id} disabled={id === 'precision' && !slalomOk}>
                        {t.bar[id]}
                        {id === 'precision' && !slalomOk ? ` (${t.challenges.precision.unfit})` : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className={styles.group} role="group" aria-label={t.bar.camera}>
                <ToolButton
                  iconOnly
                  label={t.bar.restart}
                  icon={
                    <Glyph>
                      <path d="M20 12a8 8 0 1 1-2.5-5.8M20 4v5h-5" />
                    </Glyph>
                  }
                  onClick={restart}
                />
                <ToolButton
                  iconOnly
                  label={t.bar.menu}
                  pressed={menuOpen}
                  icon={
                    <Glyph>
                      <path d="M4 7h16M4 12h16M4 17h16" />
                    </Glyph>
                  }
                  onClick={() => setMenuOpen((open) => !open)}
                />
                <ToolButton
                  iconOnly
                  label={`${t.bar.camera}: ${t.cameras[cameraMode]}`}
                  shortcut="C"
                  icon={
                    <Glyph>
                      <path d="M4 8h3l2-3h6l2 3h3v11H4zM12 10a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z" />
                    </Glyph>
                  }
                  onClick={cycleCamera}
                />
                <span className={styles.cameraName} aria-hidden="true">
                  {t.cameras[cameraMode]}
                </span>
                <ToolButton
                  iconOnly
                  label={t.bar.reset}
                  shortcut="R"
                  icon={
                    <Glyph>
                      <path d="M12 3v6M9 6l3-3 3 3M5 21l3-9h8l3 9zM9 16h6" />
                    </Glyph>
                  }
                  onClick={() => api.current?.reset()}
                />
                <ToolButton
                  iconOnly
                  label={t.bar.replay}
                  disabled={!canReplay || replaying}
                  icon={
                    <Glyph>
                      <path d="M12 5a7 7 0 1 1-6.7 5M5 4v6h6M10.5 9.5l4 2.5-4 2.5z" />
                    </Glyph>
                  }
                  onClick={() => {
                    if (api.current?.startReplay()) setReplaying(true)
                  }}
                />
                <ToolButton
                  iconOnly
                  label={ghostOn ? t.bar.ghostOff : t.bar.ghostOn}
                  pressed={ghostOn}
                  icon={
                    <Glyph>
                      <path d="M6 20V11a6 6 0 0 1 12 0v9l-3-2-3 2-3-2zM10 11h.01M14 11h.01" />
                    </Glyph>
                  }
                  onClick={toggleGhost}
                />
                <ToolButton
                  iconOnly
                  label={soundOn ? t.bar.soundOff : t.bar.soundOn}
                  pressed={soundOn}
                  icon={
                    <Glyph>
                      <path
                        d={
                          soundOn
                            ? 'M4 9v6h4l5 4V5L8 9zM16.5 8.5a5 5 0 0 1 0 7'
                            : 'M4 9v6h4l5 4V5L8 9zM17 9l4 6M21 9l-4 6'
                        }
                      />
                    </Glyph>
                  }
                  onClick={() => setSoundOn((on) => !on)}
                />
              </div>
            </div>

            {menuOpen && (
              <section className={styles.menu} id={menuId} aria-label={t.menu.title}>
                <h2>{t.menu.title}</h2>
                <p className={styles.note}>{t.menu.modeHelp}</p>
                {mode === 'drift' && <p className={styles.note}>{t.drift.hint}</p>}
                {mode === 'checkpoint' && <p className={styles.note}>{t.challenges.checkpoint.hint}</p>}
                {mode === 'precision' && <p className={styles.note}>{t.challenges.precision.hint}</p>}
                <p className={styles.fact}>
                  <span>{t.menu.track}</span> {trackName}
                </p>
                <div className={styles.links}>
                  {active.source === 'architect' && (
                    <LabAction onClick={() => resetActiveTrack()}>{t.menu.useLab}</LabAction>
                  )}
                  <LocalizedLink to={experimentPath('track-architect')} className={styles.link}>
                    {t.menu.editTrack}
                  </LocalizedLink>
                </div>
                <p className={styles.fact}>
                  <span>{t.menu.setup}</span> {setupName}
                </p>
                <div className={styles.links}>
                  <LocalizedLink to={experimentPath('performance-lab')} className={styles.link}>
                    {t.menu.tuneCar}
                  </LocalizedLink>
                </div>
                <LabChoice<TouchPref>
                  label={t.menu.touch}
                  value={touchPref}
                  options={[
                    { value: 'auto', label: t.menu.touchAuto },
                    { value: 'on', label: t.menu.touchOn },
                    { value: 'off', label: t.menu.touchOff },
                  ]}
                  onChange={setTouchPref}
                  columns={3}
                />
                <LabChoice<Sky>
                  label={t.weather.skyLabel}
                  value={conditions.sky}
                  options={SKIES.map((sky) => ({ value: sky, label: t.weather.sky[sky] }))}
                  onChange={(sky) => changeConditions({ sky })}
                  columns={3}
                />
                <LabChoice<TimeChoice>
                  label={t.weather.timeLabel}
                  value={conditions.time}
                  options={TIMES.map((time) => ({ value: time, label: t.weather.time[time] }))}
                  onChange={(time) => changeConditions({ time })}
                  columns={2}
                />
                <PanelSection title={t.look.title} collapsible defaultOpen={false}>
                  <LookPanel />
                </PanelSection>
                <p className={styles.note}>{fill(t.weather.note, { percent: Math.round(RAIN_GRIP * 100) })}</p>
                <p className={styles.note}>{t.menu.ghostNote}</p>
                <p className={styles.note}>{t.menu.soundNote}</p>
                <p className={styles.note}>{t.menu.bestNote}</p>
                <p className={styles.note}>{t.menu.physicsNote}</p>
              </section>
            )}

            {!report.drivable && active.source === 'architect' && firstProblem && (
              <div className={styles.problem} role="status">
                <strong>{t.problem.title}</strong>
                <span>{fill(t.problem.text, { reason: describeIssue(issues, firstProblem) })}</span>
                <LocalizedLink to={experimentPath('track-architect')} className={styles.link}>
                  {t.problem.fix}
                </LocalizedLink>
              </div>
            )}

            <Hud telemetry={telemetry} t={t} mode={mode} conditionsText={conditionsText} />
            <div className={styles.toasts}>
              <Toast message={message?.text ?? ''} tone={message?.tone ?? 'info'} />
            </div>
            <div className={styles.mapBox}>
              <MiniMap samples={samples} telemetry={telemetry} label={t.hud.map} />
            </div>
            {!showTouch && wide && <p className={styles.keys}>{t.keys}</p>}

            {challengeResult && (
              <section className={styles.result} aria-labelledby={`${menuId}-challenge`}>
                <h2 id={`${menuId}-challenge`}>
                  {challengeResult.kind === 'checkpoint'
                    ? challengeResult.won
                      ? t.challenges.checkpoint.won
                      : t.challenges.checkpoint.lost
                    : challengeResult.won
                      ? t.challenges.precision.done
                      : t.challenges.precision.timedOut}
                </h2>
                <p className={styles.resultTotal}>
                  <span>
                    {challengeResult.kind === 'checkpoint'
                      ? t.challenges.checkpoint.score
                      : t.challenges.precision.time}
                  </span>{' '}
                  {challengeResult.kind === 'checkpoint'
                    ? challengeResult.score
                    : `${challengeResult.score.toFixed(1)} s`}
                </p>
                <p className={styles.note}>
                  {challengeResult.kind === 'checkpoint'
                    ? fill(t.challenges.checkpoint.count, {
                        passed: challengeResult.passed,
                        total: challengeResult.total,
                      })
                    : fill(t.challenges.precision.gates, {
                        passed: challengeResult.passed,
                        total: challengeResult.total,
                        hits: challengeResult.hits,
                        missed: challengeResult.missed,
                      })}
                </p>
                {challengeResult.record && (
                  <p className={styles.note}>
                    {challengeResult.kind === 'checkpoint'
                      ? t.challenges.checkpoint.record
                      : t.challenges.precision.record}
                  </p>
                )}
                <div className={styles.links}>
                  <LabAction variant="primary" onClick={restart}>
                    {t.result.again}
                  </LabAction>
                  <LabAction onClick={() => changeMode('practice')}>{t.result.practice}</LabAction>
                </div>
              </section>
            )}

            {driftResult && (
              <section className={styles.result} aria-labelledby={`${menuId}-drift`}>
                <h2 id={`${menuId}-drift`}>{t.drift.resultTitle}</h2>
                <p className={styles.resultTotal}>
                  <span>{t.drift.score}</span> {driftResult.score}
                </p>
                <p className={styles.note}>
                  {driftResult.record ? t.drift.record : fill(t.drift.best, { score: telemetry.driftBest })}
                </p>
                <div className={styles.links}>
                  <LabAction variant="primary" onClick={restart}>
                    {t.result.again}
                  </LabAction>
                  <LabAction onClick={() => changeMode('practice')}>{t.result.practice}</LabAction>
                </div>
              </section>
            )}

            {result && (
              <section className={styles.result} aria-labelledby={`${menuId}-result`}>
                <h2 id={`${menuId}-result`}>{t.result.title}</h2>
                <p className={styles.resultTotal}>
                  <span>{t.result.total}</span> {formatLapTime(result.total)}
                </p>
                <ol>
                  {result.laps.map((entry, index) => (
                    <li key={index} data-clean={entry.clean}>
                      <span>{fill(t.result.lap, { lap: index + 1 })}</span>
                      <span>{formatLapTime(entry.time)}</span>
                      {!entry.clean && <em>{t.result.invalid}</em>}
                    </li>
                  ))}
                </ol>
                <p className={styles.note}>
                  {result.laps.some((entry) => entry.clean)
                    ? `${t.result.best}: ${formatLapTime(Math.min(...result.laps.filter((entry) => entry.clean).map((entry) => entry.time)))}`
                    : t.result.noClean}
                </p>
                <div className={styles.links}>
                  <LabAction variant="primary" onClick={restart}>
                    {t.result.again}
                  </LabAction>
                  <LabAction onClick={() => changeMode('practice')}>{t.result.practice}</LabAction>
                </div>
              </section>
            )}

            {replaying && (
              <ReplayBar
                t={t}
                telemetry={telemetry}
                api={api}
                title={fill(t.replay.title, { lap: lapInfo.lap, time: formatLapTime(lapInfo.time) })}
                onExit={() => {
                  api.current?.stopReplay()
                  setReplaying(false)
                }}
              />
            )}

            {showTouch && <TouchPads t={t} touch={controls.touch} />}
          </div>
        }
      >
        <RacingScene
          track={track}
          setup={setupState.setup}
          mode={mode}
          runId={runId}
          cameraMode={cameraMode}
          ghostOn={ghostOn}
          conditions={conditions}
          controls={controls}
          telemetry={telemetry}
          apiRef={api}
          onEvent={onEvent}
        />
      </ExperienceStage>
    </div>
  )
}

/** Racing Experience: a drivable 3D race car on a custom circuit. */
export default function Racing() {
  return (
    <ExperienceFrame id="racing">
      <RacingApp />
    </ExperienceFrame>
  )
}
