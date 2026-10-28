import type { ReactElement } from 'react'
import type { OfferingId } from '../../content/offerings'
import sketch from './Sketch.module.scss'
import styles from './BuildArt.module.scss'

/*
 * One small drawing for each area of work, in the same wordless line-and-block style as the
 * project sketches and in the same three depths. Each has one detail that is its own: the
 * websites part into three screen sizes, the application's flow runs, the phone is tapped, the
 * integrations pass data along their lines. Those details move only while a mouse is over the
 * block (the block sets data-pointer), never on their own, and a touch screen sees them at rest.
 */

const FRAME = { viewBox: '0 0 360 220', preserveAspectRatio: 'xMidYMid slice', focusable: false } as const

function Websites() {
  return (
    <svg {...FRAME}>
      <g className={sketch.far}>
        <rect className={sketch.panel} x="20" y="22" width="236" height="160" rx="10" />
        {[0, 1, 2].map((i) => (
          <circle key={i} className={sketch.dot} cx={36 + i * 12} cy="37" r="3.5" />
        ))}
        <rect className={sketch.barStrong} x="36" y="62" width="112" height="14" rx="4" />
        <rect className={sketch.barStrong} x="36" y="82" width="80" height="14" rx="4" />
        <rect className={sketch.bar} x="36" y="108" width="120" height="6" rx="3" />
        <rect className={sketch.bar} x="36" y="120" width="98" height="6" rx="3" />
        <rect className={sketch.red} x="36" y="140" width="52" height="16" rx="4" />
        <rect className={sketch.bar} x="170" y="58" width="72" height="100" rx="6" />
      </g>
      <g className={sketch.mid}>
        <rect className={sketch.shadow} x="205" y="84" width="104" height="120" rx="10" />
        <rect className={sketch.card} x="200" y="78" width="104" height="120" rx="10" />
        <rect className={sketch.barStrong} x="212" y="92" width="52" height="9" rx="4.5" />
        <rect className={sketch.bar} x="212" y="108" width="80" height="6" rx="3" />
        <rect className={sketch.bar} x="212" y="120" width="64" height="6" rx="3" />
        <rect className={sketch.blue} x="212" y="140" width="80" height="40" rx="6" />
      </g>
      <g className={sketch.near}>
        <rect className={sketch.shadow} x="304" y="104" width="46" height="94" rx="9" />
        <rect className={sketch.card} x="300" y="98" width="46" height="94" rx="9" />
        <rect className={sketch.barStrong} x="308" y="110" width="30" height="7" rx="3.5" />
        <rect className={sketch.bar} x="308" y="124" width="30" height="5" rx="2.5" />
        <rect className={sketch.bar} x="308" y="134" width="22" height="5" rx="2.5" />
        <rect className={sketch.red} x="308" y="168" width="30" height="12" rx="4" />
      </g>
    </svg>
  )
}

function WebApps() {
  return (
    <svg {...FRAME}>
      <g className={sketch.far}>
        {Array.from({ length: 7 }, (_, row) =>
          Array.from({ length: 11 }, (_, column) => (
            <circle key={`${row}-${column}`} className={sketch.dot} cx={26 + column * 31} cy={22 + row * 29} r="1.4" />
          )),
        )}
      </g>
      <g className={sketch.mid}>
        <path className={sketch.grid} d="M88 108 C112 108 108 56 130 56" fill="none" />
        <path className={sketch.grid} d="M88 108 C112 108 108 166 130 166" fill="none" />
        <path className={sketch.grid} d="M194 166 C216 166 214 108 236 108" fill="none" />
        <path className={styles.flow} d="M88 108 C112 108 108 56 130 56 L194 56 C216 56 214 108 236 108" fill="none" />
        <path className={sketch.grid} d="M300 108 L320 108" fill="none" />
        {[
          [24, 90],
          [130, 38],
          [130, 148],
          [236, 90],
        ].map(([x, y], i) => (
          <g key={i}>
            <rect className={sketch.card} x={x} y={y} width="64" height="36" rx="8" />
            <rect className={sketch.barStrong} x={x + 10} y={y + 10} width="30" height="6" rx="3" />
            <rect className={sketch.bar} x={x + 10} y={y + 21} width="22" height="5" rx="2.5" />
          </g>
        ))}
        <circle className={sketch.red} cx="332" cy="108" r="10" />
      </g>
      <g className={sketch.near}>
        <path className={sketch.shadow} d="M170 168 l0 30 l8 -8 l6 14 l7 -3 l-6 -14 l11 0 z" transform="translate(3 3)" />
        <path className={sketch.barStrong} d="M170 168 l0 30 l8 -8 l6 14 l7 -3 l-6 -14 l11 0 z" />
      </g>
    </svg>
  )
}

function Mobile() {
  return (
    <svg {...FRAME}>
      <g className={sketch.far}>
        <g transform="rotate(9 118 112)">
          <rect className={sketch.panel} x="84" y="26" width="84" height="170" rx="14" />
          <rect className={sketch.bar} x="96" y="46" width="44" height="7" rx="3.5" />
          <rect className={sketch.bar} x="96" y="62" width="60" height="30" rx="6" />
        </g>
      </g>
      <g className={sketch.mid}>
        <rect className={sketch.shadow} x="136" y="20" width="96" height="190" rx="16" />
        <rect className={sketch.card} x="130" y="14" width="96" height="190" rx="16" />
        <rect className={sketch.bar} x="162" y="22" width="32" height="6" rx="3" />
        <rect className={sketch.barStrong} x="144" y="44" width="52" height="9" rx="4.5" />
        {[0, 1, 2].map((i) => (
          <g key={i}>
            <circle className={i === 1 ? sketch.red : sketch.dot} cx="152" cy={76 + i * 26} r="7" />
            <rect className={sketch.barStrong} x="166" y={71 + i * 26} width="40" height="6" rx="3" />
            <rect className={sketch.bar} x="166" y={81 + i * 26} width="28" height="4" rx="2" />
          </g>
        ))}
        <rect className={sketch.red} x="144" y="168" width="68" height="20" rx="10" />
      </g>
      <g className={sketch.near}>
        <circle className={styles.ripple} cx="178" cy="178" r="12" />
        <circle className={styles.rippleLate} cx="178" cy="178" r="12" />
        <circle className={sketch.blue} cx="262" cy="130" r="6" />
        <circle className={sketch.dot} cx="284" cy="92" r="4" />
      </g>
    </svg>
  )
}

function Integrations() {
  const hub = { x: 180, y: 110 }
  const satellites = Array.from({ length: 6 }, (_, i) => {
    const angle = (-90 + i * 60) * (Math.PI / 180)
    return { x: hub.x + Math.cos(angle) * 84 * 1.25, y: hub.y + Math.sin(angle) * 84 * 0.95 }
  })
  return (
    <svg {...FRAME}>
      <g className={sketch.far}>
        <ellipse className={sketch.grid} cx={hub.x} cy={hub.y} rx="132" ry="96" fill="none" />
        <ellipse className={sketch.grid} cx={hub.x} cy={hub.y} rx="70" ry="50" fill="none" />
      </g>
      <g className={sketch.mid}>
        {satellites.map((s, i) => (
          <line key={i} className={i % 2 ? sketch.grid : styles.flow} x1={hub.x} y1={hub.y} x2={s.x} y2={s.y} />
        ))}
        {satellites.map((s, i) => (
          <g key={i}>
            <rect className={sketch.card} x={s.x - 20} y={s.y - 13} width="40" height="26" rx="7" />
            <circle className={i === 2 ? sketch.red : i === 5 ? sketch.blue : sketch.dot} cx={s.x - 9} cy={s.y} r="4" />
            <rect className={sketch.bar} x={s.x - 1} y={s.y - 4} width="14" height="8" rx="2" />
          </g>
        ))}
      </g>
      <g className={sketch.near}>
        <circle className={sketch.shadow} cx={hub.x + 3} cy={hub.y + 4} r="24" />
        <circle className={sketch.red} cx={hub.x} cy={hub.y} r="24" />
        <circle className={sketch.card} cx={hub.x} cy={hub.y} r="10" />
      </g>
    </svg>
  )
}

const ART: Record<OfferingId, () => ReactElement> = {
  websites: Websites,
  webapps: WebApps,
  mobile: Mobile,
  integrations: Integrations,
}

export function BuildArt({ kind }: { kind: OfferingId }) {
  const Art = ART[kind]
  return <Art />
}
