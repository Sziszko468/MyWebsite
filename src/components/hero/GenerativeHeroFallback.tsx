import { seededRandom } from './heroMath'
import styles from './GenerativeHeroFallback.module.scss'

/**
 * The same visual world drawn once as a lightweight SVG: light streaks rushing out of a vanishing
 * point, a few curved trails and a perspective floor. It stands in for the live scene while that
 * loads, when WebGL is missing or has failed, on weak devices and when the visitor prefers reduced
 * motion. It is generated (seeded, so it is identical every time) and follows the theme through
 * the same `--scene-*` tokens. With motion allowed it moves only a little: a few dashes drift and
 * the layers lean with the cursor through the driver's CSS variables.
 */

const WIDTH = 1600
const HEIGHT = 900
const VP = { x: 880, y: 430 }

type Kind = 'red' | 'ink' | 'blue'

interface Line {
  x1: number
  y1: number
  x2: number
  y2: number
  width: number
  opacity: number
  kind: Kind
  flow: boolean
}

interface Curve {
  d: string
  width: number
  kind: Kind
}

function kindFor(roll: number): Kind {
  return roll < 0.56 ? 'red' : roll < 0.86 ? 'ink' : 'blue'
}

const random = seededRandom(21)

const STREAKS: Line[] = Array.from({ length: 110 }, (_, index) => {
  const angle = random() * Math.PI * 2
  const near = 40 + random() * 140
  const far = near + 140 + random() * 640
  const x = Math.cos(angle) * 1.6
  const y = Math.sin(angle)
  return {
    x1: VP.x + x * near,
    y1: VP.y + y * near,
    x2: VP.x + x * far,
    y2: VP.y + y * far,
    width: 0.8 + (far / 800) * 2.4 * random(),
    opacity: 0.22 + random() * 0.6,
    kind: kindFor(random()),
    flow: index % 7 === 0,
  }
})

const TRAILS: Curve[] = Array.from({ length: 9 }, () => {
  const angle = random() * Math.PI * 2
  const sweep = (random() < 0.5 ? -1 : 1) * (0.35 + random() * 0.6)
  const near = 70 + random() * 90
  const far = 520 + random() * 380
  const point = (a: number, r: number) => `${(VP.x + Math.cos(a) * 1.6 * r).toFixed(1)} ${(VP.y + Math.sin(a) * r).toFixed(1)}`
  return {
    d: `M ${point(angle, near)} Q ${point(angle + sweep * 0.5, (near + far) * 0.55)} ${point(angle + sweep, far)}`,
    width: 2 + random() * 2.4,
    kind: kindFor(random() * 0.9),
  }
})

// A floor in perspective: a fan of lines to the vanishing point and rows that bunch up towards it.
const FLOOR_FAN = Array.from({ length: 17 }, (_, i) => VP.x + (i - 8) * 230)
const FLOOR_ROWS = Array.from({ length: 9 }, (_, i) => {
  const t = Math.pow((i + 1) / 9, 2)
  const y = VP.y + (HEIGHT + 40 - VP.y) * t
  const reach = (y - VP.y) * 2.6
  return { y, x1: VP.x - reach, x2: VP.x + reach, opacity: 0.1 + 0.4 * t }
})

export function GenerativeHeroFallback() {
  return (
    <svg className={styles.fallback} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      {/* The world is drawn around a vanishing point and shifted right on wide screens. */}
      <g className={styles.world}>
        <g className={styles.deep}>
          <g className={styles.floor}>
            {FLOOR_FAN.map((x, i) => (
              <line key={i} x1={VP.x} y1={VP.y} x2={x} y2={HEIGHT + 40} />
            ))}
            {FLOOR_ROWS.map((row, i) => (
              <line key={i} x1={row.x1} y1={row.y} x2={row.x2} y2={row.y} opacity={row.opacity} />
            ))}
          </g>
        </g>

        <g className={styles.mid}>
          {TRAILS.map((trail, i) => (
            <g key={i} className={styles[trail.kind]}>
              <path d={trail.d} className={styles.halo} strokeWidth={trail.width * 5} />
              <path d={trail.d} strokeWidth={trail.width} />
            </g>
          ))}
        </g>

        <g className={styles.near}>
          {STREAKS.map((line, i) => (
            <line
              key={i}
              className={`${styles[line.kind]} ${line.flow ? styles.flow : ''}`}
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
              strokeWidth={line.width}
              opacity={line.opacity}
            />
          ))}
        </g>
      </g>
    </svg>
  )
}
