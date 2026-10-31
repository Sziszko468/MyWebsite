import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  type Ref,
} from 'react'
import { GRID, nearestSegment, snap as snapValue } from './architectOps'
import type { TrackDef, TrackReport, TrackSamples } from './trackModel'
import styles from './TrackArchitect.module.scss'

export interface PlanApi {
  fit(): void
  centreOn(x: number, z: number): void
  zoom(factor: number): void
}

interface PlanEditorProps {
  track: TrackDef
  report: TrackReport
  selected: number
  tool: 'select' | 'add'
  snap: boolean
  coarse: boolean
  label: string
  /** The words for the screen reader: the selected point. */
  describe: (index: number, x: number, z: number) => string
  onSelect: (index: number) => void
  onDragStart: () => void
  onMove: (index: number, x: number, z: number) => void
  /** A tap on empty plan with the add tool: `after` is the segment to insert into, or -1 to append. */
  onAdd: (x: number, z: number, after: number) => void
  onRemove: (index: number) => void
  apiRef: Ref<PlanApi>
}

interface View {
  x: number
  z: number
  scale: number
}

const MIN_SCALE = 0.05
const MAX_SCALE = 8

const fmt = (value: number) => value.toFixed(1)

/** Everything drawn from the samples, as a few path strings: cheap to keep while the view pans. */
function shapes(samples: TrackSamples) {
  const step = Math.max(1, Math.round(6 / samples.spacing))
  const picks: number[] = []
  for (let i = 0; i < samples.count; i += step) picks.push(i)
  if (!samples.closed && picks[picks.length - 1] !== samples.count - 1) picks.push(samples.count - 1)
  const left = picks.map((i) => [
    samples.x[i] + samples.tz[i] * samples.half[i],
    samples.z[i] - samples.tx[i] * samples.half[i],
  ])
  const right = picks.map((i) => [
    samples.x[i] - samples.tz[i] * samples.half[i],
    samples.z[i] + samples.tx[i] * samples.half[i],
  ])
  const line = (points: number[][], close: boolean) =>
    `M${points.map(([x, z]) => `${fmt(x)} ${fmt(z)}`).join('L')}${close ? 'Z' : ''}`
  const road = samples.closed
    ? `${line(left, true)}${line(right, true)}`
    : `${line([...left, ...[...right].reverse()], true)}`
  const centre = line(
    picks.map((i) => [samples.x[i], samples.z[i]]),
    samples.closed,
  )

  // Runs of kerb and gravel along the edges and the middle.
  const runs = (flags: Uint8Array, side: -1 | 0 | 1, extra: number) => {
    const parts: string[] = []
    let open: number[][] = []
    const flush = () => {
      if (open.length > 1) parts.push(line(open, false))
      open = []
    }
    for (let i = 0; i < samples.count; i++) {
      if (!flags[i]) {
        flush()
        continue
      }
      const offset = side * (samples.half[i] + extra)
      open.push([samples.x[i] - samples.tz[i] * offset, samples.z[i] + samples.tx[i] * offset])
    }
    flush()
    return parts.join('')
  }
  const kerbLeft = runs(samples.kerb, -1, 0.7)
  const kerbRight = runs(samples.kerb, 1, 0.7)
  const gravel = runs(samples.gravel, 0, 0)

  const arrows: Array<{ x: number; z: number; angle: number }> = []
  const every = Math.max(1, Math.round(150 / samples.spacing))
  for (let i = every >> 1; i < samples.count; i += every)
    arrows.push({ x: samples.x[i], z: samples.z[i], angle: (Math.atan2(samples.tz[i], samples.tx[i]) * 180) / Math.PI })
  const mark = (i: number) => ({
    x: samples.x[i],
    z: samples.z[i],
    angle: (Math.atan2(samples.tz[i], samples.tx[i]) * 180) / Math.PI,
    half: samples.half[i],
  })
  const gates = samples.closed
    ? [mark(Math.round(samples.count / 3) % samples.count), mark(Math.round((2 * samples.count) / 3) % samples.count)]
    : []
  return { road, centre, kerbLeft, kerbRight, gravel, arrows, gates, start: mark(0) }
}

/**
 * The top view: a drawing board for the track. Drag a point to move it, drag empty space to pan,
 * scroll or pinch to zoom, tap with the Add tool to put a point on the line or at the end. The
 * keyboard does the same: arrows move the selected point, [ and ] select the next and previous.
 * It draws with SVG, so it costs no WebGL and stays sharp at any zoom.
 */
export function PlanEditor({
  track,
  report,
  selected,
  tool,
  snap,
  coarse,
  label,
  describe,
  onSelect,
  onDragStart,
  onMove,
  onAdd,
  onRemove,
  apiRef,
}: PlanEditorProps) {
  const host = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [view, setView] = useState<View>({ x: 0, z: 0, scale: 0.4 })
  const viewRef = useRef(view)
  useEffect(() => {
    viewRef.current = view
  })
  const sized = useRef(false)

  useEffect(() => {
    const element = host.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) =>
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height }),
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const bounds = useCallback(() => {
    const xs = track.points.map((p) => p.x)
    const zs = track.points.map((p) => p.z)
    if (xs.length === 0) return { x: 0, z: 0, width: 400, height: 300 }
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minZ = Math.min(...zs)
    const maxZ = Math.max(...zs)
    return {
      x: (minX + maxX) / 2,
      z: (minZ + maxZ) / 2,
      width: Math.max(maxX - minX, 60) + 160,
      height: Math.max(maxZ - minZ, 60) + 160,
    }
  }, [track.points])

  const fit = useCallback(() => {
    if (size.width === 0) return
    const b = bounds()
    setView({
      x: b.x,
      z: b.z,
      scale: Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.min(size.width / b.width, size.height / b.height))),
    })
  }, [bounds, size.width, size.height])

  useEffect(() => {
    if (!sized.current && size.width > 0) {
      sized.current = true
      fit()
    }
  }, [size.width, fit])

  useImperativeHandle(
    apiRef,
    () => ({
      fit,
      centreOn: (x, z) => setView((v) => ({ ...v, x, z })),
      zoom: (factor) => setView((v) => ({ ...v, scale: Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor)) })),
    }),
    [fit],
  )

  const drawn = useMemo(() => (report.samples ? shapes(report.samples) : null), [report.samples])

  const toWorld = (clientX: number, clientY: number) => {
    const rect = host.current?.getBoundingClientRect()
    const v = viewRef.current
    return {
      x: v.x + (clientX - (rect?.left ?? 0) - size.width / 2) / v.scale,
      z: v.z + (clientY - (rect?.top ?? 0) - size.height / 2) / v.scale,
    }
  }

  // Pointers: one drags a point or pans, two pinch and pan.
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<{
    kind: 'none' | 'pan' | 'drag' | 'pinch'
    index: number
    startX: number
    startY: number
    time: number
    moved: boolean
    origin: View
    distance: number
    cx: number
    cy: number
  }>({
    kind: 'none',
    index: -1,
    startX: 0,
    startY: 0,
    time: 0,
    moved: false,
    origin: view,
    distance: 1,
    cx: 0,
    cy: 0,
  })

  const down = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 && event.pointerType === 'mouse') return
    event.currentTarget.setPointerCapture(event.pointerId)
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const g = gesture.current
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      g.kind = 'pinch'
      g.distance = Math.hypot(a.x - b.x, a.y - b.y) || 1
      g.cx = (a.x + b.x) / 2
      g.cy = (a.y + b.y) / 2
      g.origin = viewRef.current
      return
    }
    const target = (event.target as Element).closest<SVGElement>('[data-point]')
    g.startX = event.clientX
    g.startY = event.clientY
    g.time = event.timeStamp
    g.moved = false
    g.origin = viewRef.current
    if (target) {
      g.kind = 'drag'
      g.index = Number(target.dataset.point)
      onSelect(g.index)
      onDragStart()
    } else {
      g.kind = 'pan'
      g.index = -1
    }
  }

  const move = (event: ReactPointerEvent<SVGSVGElement>) => {
    const p = pointers.current.get(event.pointerId)
    if (!p) return
    p.x = event.clientX
    p.y = event.clientY
    const g = gesture.current
    if (g.kind === 'pinch' && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()]
      const distance = Math.hypot(a.x - b.x, a.y - b.y) || 1
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, g.origin.scale * (distance / g.distance)))
      const cx = (a.x + b.x) / 2
      const cy = (a.y + b.y) / 2
      setView({ scale, x: g.origin.x - (cx - g.cx) / scale, z: g.origin.z - (cy - g.cy) / scale })
      g.moved = true
      return
    }
    const dx = event.clientX - g.startX
    const dy = event.clientY - g.startY
    if (Math.hypot(dx, dy) > 6) g.moved = true
    if (g.kind === 'drag' && g.moved) {
      const w = toWorld(event.clientX, event.clientY)
      onMove(g.index, snapValue(w.x, snap), snapValue(w.z, snap))
    } else if (g.kind === 'pan' && g.moved) {
      setView({ ...g.origin, x: g.origin.x - dx / g.origin.scale, z: g.origin.z - dy / g.origin.scale })
    }
  }

  const up = (event: ReactPointerEvent<SVGSVGElement>) => {
    pointers.current.delete(event.pointerId)
    const g = gesture.current
    if (pointers.current.size > 0) {
      // One finger of a pinch is still down: carry on as a pan from here.
      const [rest] = [...pointers.current.values()]
      g.kind = 'pan'
      g.startX = rest.x
      g.startY = rest.y
      g.origin = viewRef.current
      g.moved = true
      return
    }
    if (g.kind === 'pan' && !g.moved && event.timeStamp - g.time < 450) {
      const w = toWorld(event.clientX, event.clientY)
      if (tool === 'add') {
        const near = nearestSegment(track, w.x, w.z)
        const reach = (coarse ? 22 : 14) / viewRef.current.scale
        onAdd(snapValue(w.x, snap), snapValue(w.z, snap), near && near.distance < reach ? near.index : -1)
      } else onSelect(-1)
    }
    g.kind = 'none'
  }

  const wheel = (event: React.WheelEvent<SVGSVGElement>) => {
    const w = toWorld(event.clientX, event.clientY)
    const factor = Math.exp(-event.deltaY * 0.0012)
    setView((v) => {
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor))
      // Keep the point under the cursor where it is.
      return { scale, x: w.x - (w.x - v.x) * (v.scale / scale), z: w.z - (w.z - v.z) * (v.scale / scale) }
    })
  }

  const key = (event: ReactKeyboardEvent<SVGSVGElement>) => {
    const point = track.points[selected]
    const step = event.shiftKey ? 1 : GRID
    let handled = true
    if (point && event.key === 'ArrowLeft') onMove(selected, point.x - step, point.z)
    else if (point && event.key === 'ArrowRight') onMove(selected, point.x + step, point.z)
    else if (point && event.key === 'ArrowUp') onMove(selected, point.x, point.z - step)
    else if (point && event.key === 'ArrowDown') onMove(selected, point.x, point.z + step)
    else if (event.key === ']') onSelect(track.points.length ? (selected + 1) % track.points.length : -1)
    else if (event.key === '[')
      onSelect(track.points.length ? (selected - 1 + track.points.length) % track.points.length : -1)
    else if (point && (event.key === 'Delete' || event.key === 'Backspace')) onRemove(selected)
    else if (event.key === '+' || event.key === '=')
      setView((v) => ({ ...v, scale: Math.min(MAX_SCALE, v.scale * 1.25) }))
    else if (event.key === '-') setView((v) => ({ ...v, scale: Math.max(MIN_SCALE, v.scale / 1.25) }))
    else if (event.key === '0') fit()
    else handled = false
    if (handled) {
      event.preventDefault()
      if (point && event.key.startsWith('Arrow')) onDragStart()
    }
  }

  const { scale } = view
  // Dots get no bigger than half the gap to their nearest neighbour, so a dense track stays readable and each point can still be hit.
  const gap = useMemo(() => {
    let low = Infinity
    for (let i = 0; i < track.points.length; i++) {
      const a = track.points[i]
      const b = track.points[(i + 1) % track.points.length]
      if (a !== b) low = Math.min(low, Math.hypot(a.x - b.x, a.z - b.z))
    }
    return low
  }, [track.points])
  const radius = Math.min((coarse ? 16 : 10) / scale, Math.max(gap * 0.5, 2 / scale))
  // The grid: lines every 20, 100 or 500 m, depending on how far in the view is.
  const gridStep = scale > 1.2 ? 20 : scale > 0.3 ? 100 : 500
  const halfW = size.width / 2 / scale
  const halfH = size.height / 2 / scale
  const gridLines: ReactElement[] = []
  if (size.width > 0) {
    for (let x = Math.ceil((view.x - halfW) / gridStep) * gridStep; x <= view.x + halfW; x += gridStep) {
      gridLines.push(<line key={`x${x}`} x1={x} y1={view.z - halfH} x2={x} y2={view.z + halfH} data-axis={x === 0} />)
    }
    for (let z = Math.ceil((view.z - halfH) / gridStep) * gridStep; z <= view.z + halfH; z += gridStep) {
      gridLines.push(<line key={`z${z}`} x1={view.x - halfW} y1={z} x2={view.x + halfW} y2={z} data-axis={z === 0} />)
    }
  }
  const selectedPoint = track.points[selected]

  return (
    <div ref={host} className={styles.plan} data-tool={tool}>
      {size.width > 0 && (
        <svg
          className={styles.planSvg}
          width={size.width}
          height={size.height}
          viewBox={`0 0 ${size.width} ${size.height}`}
          role="application"
          aria-label={label}
          tabIndex={0}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onWheel={wheel}
          onKeyDown={key}
        >
          <g
            transform={`translate(${size.width / 2 - view.x * scale} ${size.height / 2 - view.z * scale}) scale(${scale})`}
          >
            <g className={styles.grid} strokeWidth={1 / scale}>
              {gridLines}
            </g>
            {drawn ? (
              <>
                {drawn.gravel && <path className={styles.gravel} d={drawn.gravel} strokeWidth={26} fill="none" />}
                <path className={styles.road} d={drawn.road} fillRule="evenodd" strokeWidth={1.2 / scale} />
                {drawn.kerbLeft && <path className={styles.kerbRed} d={drawn.kerbLeft} fill="none" strokeWidth={1.4} />}
                {drawn.kerbRight && (
                  <path className={styles.kerbRed} d={drawn.kerbRight} fill="none" strokeWidth={1.4} />
                )}
                {drawn.kerbLeft && (
                  <path className={styles.kerbWhite} d={drawn.kerbLeft} fill="none" strokeWidth={1.4} />
                )}
                {drawn.kerbRight && (
                  <path className={styles.kerbWhite} d={drawn.kerbRight} fill="none" strokeWidth={1.4} />
                )}
                <path
                  className={styles.centre}
                  d={drawn.centre}
                  fill="none"
                  strokeWidth={1.2 / scale}
                  strokeDasharray={`${8 / scale} ${8 / scale}`}
                />
                {drawn.arrows.map((a, i) => (
                  <path
                    key={i}
                    className={styles.arrow}
                    d="M-5 -4 L6 0 L-5 4 Z"
                    transform={`translate(${a.x} ${a.z}) rotate(${a.angle}) scale(${1.4 / Math.sqrt(scale)})`}
                  />
                ))}
                {drawn.gates.map((g, i) => (
                  <line
                    key={i}
                    className={styles.gate}
                    x1={0}
                    y1={-g.half}
                    x2={0}
                    y2={g.half}
                    transform={`translate(${g.x} ${g.z}) rotate(${g.angle})`}
                    strokeWidth={3 / scale}
                  />
                ))}
                <g transform={`translate(${drawn.start.x} ${drawn.start.z}) rotate(${drawn.start.angle})`}>
                  <line
                    className={styles.finishA}
                    x1={0}
                    y1={-drawn.start.half}
                    x2={0}
                    y2={drawn.start.half}
                    strokeWidth={4 / scale}
                  />
                  <line
                    className={styles.finishB}
                    x1={0}
                    y1={-drawn.start.half}
                    x2={0}
                    y2={drawn.start.half}
                    strokeWidth={4 / scale}
                    strokeDasharray={`${3 / scale} ${3 / scale}`}
                  />
                </g>
              </>
            ) : (
              track.points.length > 1 && (
                <polyline
                  className={styles.sketch}
                  fill="none"
                  strokeWidth={2 / scale}
                  strokeDasharray={`${6 / scale} ${5 / scale}`}
                  points={track.points.map((p) => `${p.x},${p.z}`).join(' ')}
                />
              )
            )}
            {report.issues.map((issue, i) =>
              issue.at ? (
                <g
                  key={i}
                  className={styles.issue}
                  data-severity={issue.severity}
                  transform={`translate(${issue.at.x} ${issue.at.z}) scale(${1 / scale})`}
                  aria-hidden="true"
                >
                  <path d="M0 -15 L14 10 L-14 10 Z" />
                  <text y="7" textAnchor="middle">
                    !
                  </text>
                </g>
              ) : null,
            )}
            {track.points.map((p, i) => (
              <g
                key={i}
                data-point={i}
                className={styles.point}
                data-selected={i === selected}
                data-start={i === track.start}
              >
                <circle className={styles.hit} cx={p.x} cy={p.z} r={radius * 1.25} />
                <circle
                  className={styles.dot}
                  cx={p.x}
                  cy={p.z}
                  r={i === selected ? radius * 0.9 : radius * 0.45}
                  strokeWidth={1.5 / scale}
                />
                {i === track.start && (
                  <circle
                    className={styles.startRing}
                    cx={p.x}
                    cy={p.z}
                    r={radius * 1.25}
                    strokeWidth={2 / scale}
                    fill="none"
                  />
                )}
              </g>
            ))}
          </g>
        </svg>
      )}
      <p className="visually-hidden" aria-live="polite">
        {selectedPoint ? describe(selected, selectedPoint.x, selectedPoint.z) : ''}
      </p>
    </div>
  )
}
