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

const ART: Record<LabId, () => ReactElement> = {
  'particle-universe': ParticleArt,
  'liquid-matter': LiquidArt,
  'type-in-motion': TypeArt,
  'infinite-space': SpaceArt,
  'chromatic-distortion': ChromaticArt,
}

export function LabArt({ id }: { id: LabId }) {
  const Art = ART[id]
  return <Art />
}
