import type { ReactElement } from 'react'
import type { MockupKind } from '../../content/projects'
import styles from './Sketch.module.scss'

/*
 * Concept sketches: line-and-block drawings of the kind of screen a project has, with no words,
 * numbers or logos in them, so they cannot be taken for a screenshot of the real product. They
 * are drawn in three depths (far, mid, near) that slide a little against each other when the
 * pointer moves over the card, which is where the card's depth effect comes from.
 */

const FRAME = { viewBox: '0 0 320 200', preserveAspectRatio: 'xMidYMid slice', focusable: false } as const

function Finance() {
  const heights = [26, 40, 32, 54, 38, 62, 46, 70]
  return (
    <svg {...FRAME}>
      <rect className={styles.bg} width="320" height="200" />
      <g className={styles.far}>
        <rect className={styles.panel} x="24" y="18" width="272" height="170" rx="10" />
        <path className={styles.rail} d="M34 18h24v170H34a10 10 0 0 1-10-10V28a10 10 0 0 1 10-10z" />
        {[0, 1, 2, 3, 4].map((i) => (
          <circle key={i} className={i === 0 ? styles.red : styles.dot} cx="41" cy={44 + i * 24} r="5" />
        ))}
      </g>
      <g className={styles.mid}>
        <rect className={styles.barStrong} x="76" y="34" width="86" height="8" rx="4" />
        <rect className={styles.bar} x="76" y="48" width="52" height="6" rx="3" />
        <rect className={styles.barStrong} x="76" y="68" width="108" height="22" rx="5" />
        <rect className={styles.red} x="192" y="73" width="34" height="13" rx="6.5" />
        {heights.map((h, i) => (
          <rect
            key={i}
            className={i === heights.length - 1 ? styles.red : i % 3 === 1 ? styles.blue : styles.barStrong}
            x={76 + i * 20}
            y={170 - h}
            width="12"
            height={h}
            rx="3"
          />
        ))}
        <line className={styles.line} x1="72" y1="171" x2="282" y2="171" />
      </g>
      <g className={styles.near}>
        <rect className={styles.shadow} x="219" y="104" width="78" height="66" rx="9" />
        <rect className={styles.card} x="214" y="98" width="78" height="66" rx="9" />
        <circle className={styles.track} cx="240" cy="131" r="16" />
        <circle className={styles.ring} cx="240" cy="131" r="16" pathLength="100" strokeDasharray="64 100" />
        <rect className={styles.barStrong} x="264" y="120" width="20" height="5" rx="2.5" />
        <rect className={styles.bar} x="264" y="131" width="14" height="5" rx="2.5" />
        <rect className={styles.bar} x="264" y="142" width="18" height="5" rx="2.5" />
      </g>
    </svg>
  )
}

function Booking() {
  const columns = 7
  const rows = 4
  const picked = 10
  const busy = new Set([3, 9, 15, 16, 22])
  return (
    <svg {...FRAME}>
      <rect className={styles.bg} width="320" height="200" />
      <g className={styles.far}>
        <rect className={styles.panel} x="24" y="18" width="272" height="170" rx="10" />
        <rect className={styles.barStrong} x="44" y="34" width="70" height="9" rx="4.5" />
        <rect className={styles.bar} x="44" y="50" width="44" height="6" rx="3" />
        <circle className={styles.dot} cx="262" cy="39" r="7" />
        <circle className={styles.dot} cx="280" cy="39" r="7" />
      </g>
      <g className={styles.mid}>
        {Array.from({ length: columns * rows }, (_, i) => {
          const column = i % columns
          const row = Math.floor(i / columns)
          const state = i === picked ? styles.red : busy.has(i) ? styles.barStrong : styles.bar
          return <rect key={i} className={state} x={44 + column * 24} y={72 + row * 24} width="18" height="18" rx="5" />
        })}
      </g>
      <g className={styles.near}>
        <rect className={styles.shadow} x="219" y="68" width="73" height="100" rx="9" />
        <rect className={styles.card} x="214" y="62" width="73" height="100" rx="9" />
        {[0, 1, 2].map((i) => (
          <rect
            key={i}
            className={i === 1 ? styles.blue : styles.bar}
            x="224"
            y={74 + i * 22}
            width="53"
            height="15"
            rx="7.5"
          />
        ))}
        <rect className={styles.red} x="224" y="140" width="53" height="14" rx="4" />
      </g>
    </svg>
  )
}

function Guide() {
  return (
    <svg {...FRAME}>
      <rect className={styles.bg} width="320" height="200" />
      <g className={styles.far}>
        <rect className={styles.panel} x="24" y="18" width="272" height="170" rx="10" />
        <rect className={styles.barStrong} x="40" y="32" width="40" height="8" rx="4" />
        {[0, 1, 2].map((i) => (
          <rect key={i} className={styles.bar} x={200 + i * 30} y="33" width="22" height="6" rx="3" />
        ))}
      </g>
      <g className={styles.mid}>
        <rect className={styles.barStrong} x="40" y="62" width="120" height="14" rx="4" />
        <rect className={styles.barStrong} x="40" y="82" width="84" height="14" rx="4" />
        <rect className={styles.bar} x="40" y="108" width="132" height="6" rx="3" />
        <rect className={styles.bar} x="40" y="120" width="110" height="6" rx="3" />
        <rect className={styles.red} x="40" y="140" width="52" height="16" rx="4" />
        <path className={styles.route} d="M196 126C216 76 252 76 270 118" />
        <circle className={styles.blue} cx="196" cy="126" r="7" />
        <circle className={styles.red} cx="270" cy="118" r="7" />
      </g>
      <g className={styles.near}>
        <rect className={styles.shadow} x="40" y="158" width="168" height="26" rx="7" />
        {[0, 1, 2].map((i) => (
          <g key={i}>
            <rect className={styles.card} x={36 + i * 58} y="152" width="52" height="26" rx="7" />
            <circle className={i === 1 ? styles.red : styles.dot} cx={48 + i * 58} cy="165" r="4" />
            <rect className={styles.bar} x={58 + i * 58} y="161" width="22" height="5" rx="2.5" />
            <rect className={styles.bar} x={58 + i * 58} y="169" width="14" height="4" rx="2" />
          </g>
        ))}
      </g>
    </svg>
  )
}

function Logistics() {
  const stops: Array<[number, number]> = [
    [58, 150],
    [118, 108],
    [176, 128],
    [238, 70],
  ]
  return (
    <svg {...FRAME}>
      <rect className={styles.bg} width="320" height="200" />
      <g className={styles.far}>
        <rect className={styles.panel} x="24" y="18" width="272" height="170" rx="10" />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <line key={`v${i}`} className={styles.grid} x1={52 + i * 40} y1="30" x2={52 + i * 40} y2="176" />
        ))}
        {[0, 1, 2, 3].map((i) => (
          <line key={`h${i}`} className={styles.grid} x1="36" y1={52 + i * 36} x2="284" y2={52 + i * 36} />
        ))}
      </g>
      <g className={styles.mid}>
        <polyline className={styles.route} points={stops.map((s) => s.join(',')).join(' ')} />
        {stops.map(([x, y], i) => (
          <circle key={i} className={i === stops.length - 1 ? styles.red : i === 0 ? styles.blue : styles.dot} cx={x} cy={y} r="7" />
        ))}
      </g>
      <g className={styles.near}>
        <rect className={styles.shadow} x="223" y="108" width="76" height="68" rx="9" />
        <rect className={styles.card} x="218" y="102" width="76" height="68" rx="9" />
        <rect className={styles.barStrong} x="228" y="114" width="40" height="7" rx="3.5" />
        <rect className={styles.bar} x="228" y="127" width="56" height="5" rx="2.5" />
        <rect className={styles.bar} x="228" y="146" width="56" height="8" rx="4" />
        <rect className={styles.red} x="228" y="146" width="34" height="8" rx="4" />
      </g>
    </svg>
  )
}

const SKETCHES: Record<MockupKind, () => ReactElement> = {
  finance: Finance,
  booking: Booking,
  guide: Guide,
  logistics: Logistics,
}

export function ProjectMockup({ kind }: { kind: MockupKind }) {
  const Sketch = SKETCHES[kind]
  return (
    <span className={styles.root}>
      <Sketch />
    </span>
  )
}
