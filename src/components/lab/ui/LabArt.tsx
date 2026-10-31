import { useMemo, type ReactElement } from 'react'
import type { LabId } from '../../../content/lab'
import { seededRandom } from '../../hero/heroMath'
import styles from './LabArt.module.scss'

/**
 * A still picture of each experiment, drawn in SVG from the design tokens (so it follows the
 * theme). It is what a stage shows while its scene loads and instead of it when WebGL is missing,
 * the visitor chose the still view or the scene failed; the gallery also uses it as each entry's
 * artwork. It is decoration: it is hidden from assistive technology and carries no information
 * the page's text does not.
 */

const W = 800
const H = 600
const CX = W / 2
const CY = H / 2

function ParticleArt() {
  const dots = useMemo(() => {
    const random = seededRandom(11)
    const list: Array<{ x: number; y: number; r: number; tone: 0 | 1 | 2; o: number }> = []
    for (let i = 0; i < 560; i++) {
      const ring = i < 380
      const angle = random() * Math.PI * 2
      const spread = ring ? 190 + (random() + random() - 1) * 60 : random() * 380
      const squash = ring ? 0.62 : 0.8
      const x = CX + Math.cos(angle) * spread * (ring ? 1.25 : 1.9)
      const y = CY + Math.sin(angle) * spread * squash * (ring ? 1.25 : 1.4)
      const depth = random()
      list.push({
        x,
        y,
        r: 0.8 + depth * depth * 3.2,
        tone: depth > 0.82 ? 0 : depth > 0.4 ? 1 : 2,
        o: 0.25 + depth * 0.75,
      })
    }
    return list
  }, [])

  return (
    <svg className={styles.svg} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" focusable="false">
      <defs>
        <radialGradient id="art-particle-glow" cx="50%" cy="50%" r="55%">
          <stop offset="0" stopColor="var(--brand-red)" stopOpacity="0.28" />
          <stop offset="0.6" stopColor="var(--brand-blue)" stopOpacity="0.08" />
          <stop offset="1" stopColor="var(--brand-blue)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width={W} height={H} className={styles.bg} />
      <ellipse cx={CX} cy={CY} rx="360" ry="250" fill="url(#art-particle-glow)" />
      {dots.map((dot, index) => (
        <circle
          key={index}
          cx={dot.x.toFixed(1)}
          cy={dot.y.toFixed(1)}
          r={dot.r.toFixed(2)}
          opacity={dot.o.toFixed(2)}
          className={[styles.red, styles.ink, styles.blue][dot.tone]}
        />
      ))}
    </svg>
  )
}

function LiquidArt() {
  return (
    <svg className={styles.svg} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" focusable="false">
      <defs>
        <radialGradient id="art-liquid-body" cx="36%" cy="30%" r="78%">
          <stop offset="0" stopColor="var(--scene-ink)" />
          <stop offset="0.18" stopColor="var(--scene-ink)" stopOpacity="0.6" />
          <stop offset="0.5" stopColor="var(--brand-graphite)" />
          <stop offset="1" stopColor="var(--brand-black)" />
        </radialGradient>
        <radialGradient id="art-liquid-red" cx="78%" cy="80%" r="48%">
          <stop offset="0" stopColor="var(--brand-red)" stopOpacity="0.95" />
          <stop offset="1" stopColor="var(--brand-red)" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="art-liquid-blue" cx="16%" cy="62%" r="46%">
          <stop offset="0" stopColor="var(--brand-blue)" stopOpacity="0.9" />
          <stop offset="1" stopColor="var(--brand-blue)" stopOpacity="0" />
        </radialGradient>
        <clipPath id="art-liquid-clip">
          <path d="M404 92c92-6 186 52 220 138 38 94 6 196-70 250-70 50-176 50-250 6-82-48-130-146-104-240 26-96 108-146 204-154Z" />
        </clipPath>
      </defs>
      <rect width={W} height={H} className={styles.bg} />
      <g clipPath="url(#art-liquid-clip)">
        <rect width={W} height={H} fill="url(#art-liquid-body)" />
        <rect width={W} height={H} fill="url(#art-liquid-red)" />
        <rect width={W} height={H} fill="url(#art-liquid-blue)" />
        <path
          d="M250 190c40-60 110-86 170-74"
          fill="none"
          className={styles.highlight}
          strokeWidth="14"
          strokeLinecap="round"
        />
        <path
          d="M300 410c60 40 150 40 220-6"
          fill="none"
          className={styles.highlight}
          strokeWidth="5"
          strokeLinecap="round"
          opacity="0.5"
        />
      </g>
      <ellipse cx={CX + 30} cy="548" rx="190" ry="14" className={styles.shadow} />
      <circle cx="636" cy="126" r="30" fill="url(#art-liquid-body)" />
      <circle cx="636" cy="126" r="30" fill="url(#art-liquid-red)" />
    </svg>
  )
}

function TypeArt() {
  const copies = Array.from({ length: 12 }, (_, index) => index)
  return (
    <svg className={styles.svg} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" focusable="false">
      <rect width={W} height={H} className={styles.bg} />
      <g className={styles.type} textAnchor="middle" fontSize="330" fontWeight="900">
        {copies.map((index) => (
          <text
            key={index}
            x={CX + 4 + (copies.length - index) * 3.2}
            y={CY + 120 + (copies.length - index) * 2.4}
            className={index % 2 === 0 ? styles.extrudeA : styles.extrudeB}
            opacity={0.18 + (index / copies.length) * 0.5}
          >
            Aa
          </text>
        ))}
        <text x={CX + 4} y={CY + 120} className={styles.front}>
          Aa
        </text>
      </g>
      <text x={CX} y="548" textAnchor="middle" className={styles.caption}>
        CREATE WITHOUT LIMITS.
      </text>
    </svg>
  )
}

function SpaceArt() {
  const { lines, frames } = useMemo(() => {
    const random = seededRandom(23)
    const rays = Array.from({ length: 96 }, () => {
      const angle = random() * Math.PI * 2
      const near = 24 + random() * 130
      const far = near + 60 + random() * 360
      return {
        x1: CX + Math.cos(angle) * near * 1.35,
        y1: CY + Math.sin(angle) * near * 0.9,
        x2: CX + Math.cos(angle) * far * 1.35,
        y2: CY + Math.sin(angle) * far * 0.9,
        tone: random() > 0.82 ? 0 : random() > 0.5 ? 1 : 2,
        w: 0.8 + random() * 1.8,
        o: 0.3 + random() * 0.7,
      }
    })
    const boxes = Array.from({ length: 7 }, (_, index) => {
      const scale = Math.pow(1.62, index) * 18
      return { w: scale * 1.6, h: scale * 1.0, o: 0.85 - index * 0.1 }
    })
    return { lines: rays, frames: boxes }
  }, [])

  return (
    <svg className={styles.svg} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" focusable="false">
      <defs>
        <radialGradient id="art-space-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="var(--scene-ink)" stopOpacity="0.55" />
          <stop offset="0.35" stopColor="var(--brand-blue)" stopOpacity="0.18" />
          <stop offset="1" stopColor="var(--brand-blue)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width={W} height={H} className={styles.bg} />
      <circle cx={CX} cy={CY} r="220" fill="url(#art-space-glow)" />
      {frames.map((frame, index) => (
        <rect
          key={index}
          x={(CX - frame.w / 2).toFixed(1)}
          y={(CY - frame.h / 2).toFixed(1)}
          width={frame.w.toFixed(1)}
          height={frame.h.toFixed(1)}
          fill="none"
          className={index % 3 === 1 ? styles.redLine : styles.blueLine}
          strokeWidth={0.8 + index * 0.35}
          opacity={Math.max(frame.o, 0.12).toFixed(2)}
        />
      ))}
      {lines.map((line, index) => (
        <line
          key={index}
          x1={line.x1.toFixed(1)}
          y1={line.y1.toFixed(1)}
          x2={line.x2.toFixed(1)}
          y2={line.y2.toFixed(1)}
          className={[styles.redLine, styles.inkLine, styles.blueLine][line.tone]}
          strokeWidth={line.w.toFixed(2)}
          strokeLinecap="round"
          opacity={line.o.toFixed(2)}
        />
      ))}
    </svg>
  )
}

function ChromaticArt() {
  const shapes = (
    <>
      <circle cx={CX - 70} cy={CY - 10} r="150" fill="none" strokeWidth="26" />
      <path
        d={`M${CX + 40} ${CY - 170} L${CX + 250} ${CY + 150} L${CX - 170} ${CY + 150} Z`}
        fill="none"
        strokeWidth="14"
        strokeLinejoin="round"
      />
      <rect x={CX + 120} y={CY - 210} width="22" height="420" stroke="none" />
    </>
  )
  return (
    <svg className={styles.svg} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" focusable="false">
      <rect width={W} height={H} className={styles.bg} />
      <g className={styles.channels}>
        <g className={styles.channelRed} transform="translate(-14 -4)">
          {shapes}
        </g>
        <g className={styles.channelGreen}>{shapes}</g>
        <g className={styles.channelBlue} transform="translate(14 5)">
          {shapes}
        </g>
      </g>
    </svg>
  )
}

function GenerativeArt() {
  const facets = useMemo(() => {
    const outer = (k: number) => [
      CX + Math.cos(((k * 45 + 22.5) * Math.PI) / 180) * 215,
      CY + Math.sin(((k * 45 + 22.5) * Math.PI) / 180) * 215 * 0.92,
    ]
    const inner = (k: number) => [
      CX + Math.cos((k * 45 * Math.PI) / 180) * 112,
      CY + Math.sin((k * 45 * Math.PI) / 180) * 112 * 0.92,
    ]
    const light = (angleDeg: number) => 0.18 + 0.72 * Math.max(0, Math.cos(((angleDeg - 235) * Math.PI) / 180))
    const list: Array<{ points: string; shade: number; hue: 'ink' | 'red' | 'blue' }> = []
    for (let k = 0; k < 8; k++) {
      const a = inner(k)
      const b = inner((k + 1) % 8)
      const c = outer(k)
      const d = outer((k + 1) % 8)
      const mid = k * 45 + 22.5
      list.push({
        points: [a, b, c].map((p) => p.map((n) => n.toFixed(1)).join(',')).join(' '),
        shade: light(mid),
        hue: k === 5 ? 'red' : k === 2 ? 'blue' : 'ink',
      })
      list.push({
        points: [c, d, b].map((p) => p.map((n) => n.toFixed(1)).join(',')).join(' '),
        shade: light(mid + 22.5),
        hue: 'ink',
      })
    }
    list.push({
      points: Array.from({ length: 8 }, (_, k) =>
        inner(k)
          .map((n) => n.toFixed(1))
          .join(','),
      ).join(' '),
      shade: 0.9,
      hue: 'ink',
    })
    return list
  }, [])

  return (
    <svg className={styles.svg} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" focusable="false">
      <rect width={W} height={H} className={styles.bg} />
      <ellipse cx={CX} cy="540" rx="210" ry="16" className={styles.shadow} />
      {facets.map((facet, index) => (
        <polygon
          key={index}
          points={facet.points}
          className={facet.hue === 'red' ? styles.facetRed : facet.hue === 'blue' ? styles.facetBlue : styles.facetInk}
          style={{ fillOpacity: facet.shade }}
          strokeWidth="1.5"
        />
      ))}
    </svg>
  )
}

function StudioArt() {
  const lines = Array.from({ length: 11 }, (_, i) => i)
  return (
    <svg className={styles.svg} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" focusable="false">
      <rect width={W} height={H} className={styles.bg} />
      {/* A floor grid in perspective. */}
      <g className={styles.gridLine} strokeWidth="1">
        {lines.map((i) => (
          <line key={`a${i}`} x1={CX + (i - 5) * 26} y1="330" x2={CX + (i - 5) * 120} y2={H} />
        ))}
        {lines.map((i) => (
          <line
            key={`b${i}`}
            x1={CX - 150 - i * 12}
            y1={330 + i * i * 2.3}
            x2={CX + 150 + i * 12}
            y2={330 + i * i * 2.3}
          />
        ))}
      </g>
      {/* A cube, three faces. */}
      <polygon points="400,170 520,225 400,282 280,225" className={styles.faceTop} />
      <polygon points="280,225 400,282 400,420 280,362" className={styles.faceLeft} />
      <polygon points="520,225 400,282 400,420 520,362" className={styles.faceRight} />
      {/* The move handles. */}
      <g strokeWidth="5" strokeLinecap="round" fill="none">
        <line x1="400" y1="282" x2="620" y2="342" className={styles.redLine} />
        <line x1="400" y1="282" x2="400" y2="110" className={styles.inkLine} />
        <line x1="400" y1="282" x2="228" y2="380" className={styles.blueLine} />
      </g>
      <polygon points="634,346 604,332 610,358" className={styles.red} />
      <polygon points="400,92 386,124 414,124" className={styles.ink} />
      <polygon points="212,390 232,362 244,388" className={styles.blue} />
    </svg>
  )
}

function RacingArt() {
  // A circuit seen from above, and a car on it.
  const track =
    'M150 420 C80 330 140 190 300 170 C470 150 470 280 600 250 C730 220 760 360 640 430 C520 500 300 520 150 420 Z'
  return (
    <svg className={styles.svg} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" focusable="false">
      <rect width={W} height={H} className={styles.bg} />
      <path d={track} fill="none" className={styles.verge} strokeWidth="92" strokeLinejoin="round" />
      <path d={track} fill="none" className={styles.asphalt} strokeWidth="68" strokeLinejoin="round" />
      <path
        d={track}
        fill="none"
        className={styles.kerb}
        strokeWidth="72"
        strokeLinejoin="round"
        strokeDasharray="16 16"
        opacity="0.55"
      />
      <path d={track} fill="none" className={styles.inkLine} strokeWidth="3" strokeDasharray="22 26" opacity="0.7" />
      <rect x="296" y="124" width="14" height="92" className={styles.ink} opacity="0.9" />
      <g transform="translate(470 215) rotate(18)">
        <rect x="-34" y="-9" width="68" height="18" rx="8" className={styles.red} />
        <rect x="-44" y="-17" width="6" height="34" className={styles.ink} />
        <rect x="30" y="-14" width="6" height="28" className={styles.ink} />
        <rect x="-22" y="-14" width="12" height="6" className={styles.ink} />
        <rect x="-22" y="8" width="12" height="6" className={styles.ink} />
        <rect x="14" y="-14" width="12" height="6" className={styles.ink} />
        <rect x="14" y="8" width="12" height="6" className={styles.ink} />
      </g>
      <g strokeWidth="3" strokeLinecap="round" className={styles.redLine} opacity="0.8">
        <line x1="380" y1="198" x2="430" y2="206" />
        <line x1="368" y1="212" x2="424" y2="222" />
      </g>
    </svg>
  )
}

function ArchitectArt() {
  const points: Array<[number, number]> = [
    [160, 400],
    [140, 250],
    [270, 160],
    [450, 200],
    [560, 150],
    [680, 260],
    [620, 400],
    [430, 440],
    [300, 380],
  ]
  const path =
    'M160 400 C110 330 120 220 270 160 C370 125 410 220 450 200 C500 175 520 120 560 150 C650 200 720 230 680 260 C660 330 700 380 620 400 C560 420 500 470 430 440 C380 420 340 400 300 380 C250 380 200 430 160 400 Z'
  const dots = Array.from({ length: 12 * 8 }, (_, i) => [60 + (i % 12) * 62, 60 + Math.floor(i / 12) * 70])
  return (
    <svg className={styles.svg} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" focusable="false">
      <rect width={W} height={H} className={styles.bg} />
      {dots.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="1.6" className={styles.ink} opacity="0.25" />
      ))}
      <path d={path} fill="none" className={styles.blueLine} strokeWidth="40" opacity="0.22" strokeLinejoin="round" />
      <path d={path} fill="none" className={styles.blueLine} strokeWidth="4" strokeLinejoin="round" />
      {points.map(([x, y], i) => (
        <g key={i}>
          {i === 3 && <circle cx={x} cy={y} r="22" className={styles.redRing} />}
          <circle
            cx={x}
            cy={y}
            r={i === 3 ? 11 : 8}
            className={i === 3 ? styles.red : styles.pointFill}
            strokeWidth="3"
          />
        </g>
      ))}
      <rect x="150" y="372" width="12" height="58" className={styles.ink} transform="rotate(-10 156 400)" />
    </svg>
  )
}

function PerformanceArt() {
  const flows = Array.from({ length: 9 }, (_, i) => i)
  return (
    <svg className={styles.svg} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" focusable="false">
      <rect width={W} height={H} className={styles.bg} />
      {/* Streamlines over a car in side view. */}
      <g fill="none" strokeLinecap="round">
        {flows.map((i) => {
          const y = 150 + i * 34
          const lift = Math.max(0, 62 - Math.abs(i - 3) * 22)
          return (
            <path
              key={i}
              d={`M30 ${y} C200 ${y} 260 ${y - lift} 400 ${y - lift * 1.3} S620 ${y - lift * 0.6} 770 ${y}`}
              className={i % 3 === 0 ? styles.redLine : i % 3 === 1 ? styles.blueLine : styles.inkLine}
              strokeWidth={i % 3 === 0 ? 3 : 2}
              strokeDasharray="26 14"
              opacity={0.45 + (i % 3) * 0.18}
            />
          )
        })}
      </g>
      <g className={styles.carBody}>
        <path
          d="M230 372 L250 334 C300 322 360 318 430 322 L520 312 C560 306 590 330 600 360 L640 366 L640 392 L230 392 Z"
          className={styles.red}
        />
        <rect x="598" y="316" width="8" height="52" className={styles.ink} />
        <rect x="560" y="304" width="62" height="8" className={styles.ink} />
        <rect x="210" y="368" width="48" height="8" className={styles.ink} />
        <circle cx="290" cy="392" r="30" className={styles.tyre} />
        <circle cx="560" cy="392" r="30" className={styles.tyre} />
        <circle cx="290" cy="392" r="12" className={styles.ink} />
        <circle cx="560" cy="392" r="12" className={styles.ink} />
      </g>
      <g strokeWidth="6" strokeLinecap="round" fill="none">
        <line x1="575" y1="250" x2="575" y2="296" className={styles.redLine} />
        <line x1="260" y1="318" x2="260" y2="352" className={styles.redLine} />
        <line x1="150" y1="360" x2="214" y2="360" className={styles.blueLine} />
      </g>
      <g className={styles.ink} opacity="0.85">
        <rect x="660" y="140" width="20" height="90" className={styles.red} />
        <rect x="690" y="170" width="20" height="60" className={styles.blue} />
      </g>
    </svg>
  )
}

const ART: Record<LabId, () => ReactElement> = {
  'particle-universe': ParticleArt,
  'liquid-matter': LiquidArt,
  'type-in-motion': TypeArt,
  'infinite-space': SpaceArt,
  'chromatic-distortion': ChromaticArt,
  'generative-objects': GenerativeArt,
  'model-studio': StudioArt,
  racing: RacingArt,
  'track-architect': ArchitectArt,
  'performance-lab': PerformanceArt,
}

export function LabArt({ id }: { id: LabId }) {
  const Art = ART[id]
  return <Art />
}
