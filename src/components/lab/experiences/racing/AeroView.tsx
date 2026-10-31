import { useMemo, type CSSProperties } from 'react'
import { SETUP_RANGES } from './carSetup'
import styles from './PerformanceLab.module.scss'

interface AeroViewProps {
  downforce: number
  drag: number
  rideHeight: number
  label: string
  downforceLabel: string
  dragLabel: string
  gapLabel: string
}

/**
 * An illustration of what the settings do to the air round a side view of the car: the lines bend
 * over the body, kick up behind a bigger rear wing and squeeze through a smaller gap under the floor, the
 * wake behind the car is more ragged with more drag, and the arrows grow with downforce and drag. It
 * is a picture drawn from the three numbers, to show their direction and rough size. It is not a
 * flow simulation and not a CFD result, and the page says so next to it.
 */
export function AeroView({ downforce, drag, rideHeight, label, downforceLabel, dragLabel, gapLabel }: AeroViewProps) {
  const dfRange = SETUP_RANGES.downforce
  const dragRange = SETUP_RANGES.drag
  const dfNorm = (downforce - dfRange.min) / (dfRange.max - dfRange.min)
  const dragNorm = (drag - dragRange.min) / (dragRange.max - dragRange.min)
  const gap = 180 - (150 + ((rideHeight - 30) / 60) * 16)
  const gapNorm = Math.max(0.2, gap / 30)

  const lines = useMemo(() => {
    const heights = [34, 56, 78, 98, 116]
    const paths = heights.map((h) => {
      const near = Math.max(0, Math.min(1, (150 - h) / 110))
      const points: string[] = []
      for (let x = 0; x <= 600; x += 10) {
        const body = 36 * Math.exp(-(((x - 300) / 95) ** 2)) * near
        const wing = (10 + 26 * dfNorm) * Math.exp(-(((x - 410) / 36) ** 2)) * near
        const front = 8 * Math.exp(-(((x - 190) / 30) ** 2)) * near
        const wake =
          x > 430 ? Math.sin(x / 11 + h) * (2 + 12 * dragNorm) * Math.min(1, (x - 430) / 90) * (1 - near * 0.4) : 0
        points.push(`${x} ${(h - body - wing - front + wake).toFixed(1)}`)
      }
      return `M${points.join('L')}`
    })
    // Under the floor: the flow is squeezed between the car and the ground.
    const floor = 150 + ((rideHeight - 30) / 60) * 16
    const under = (floor + 180) / 2
    const underPoints: string[] = []
    for (let x = 0; x <= 600; x += 10) {
      const squeeze = Math.exp(-(((x - 300) / 120) ** 2)) * 0
      underPoints.push(
        `${x} ${(under + squeeze + (x > 430 ? Math.sin(x / 9) * (1 + 7 * dragNorm) * Math.min(1, (x - 430) / 90) : 0)).toFixed(1)}`,
      )
    }
    paths.push(`M${underPoints.join('L')}`)
    return paths
  }, [dfNorm, dragNorm, rideHeight])

  const floorY = 150 + ((rideHeight - 30) / 60) * 16
  const downLength = 12 + 40 * dfNorm
  const dragLength = 14 + 46 * dragNorm
  const speed = `${(1.6 / gapNorm).toFixed(2)}s`

  return (
    <svg
      className={styles.aero}
      viewBox="0 0 600 230"
      role="img"
      aria-label={label}
      style={{ '--under': speed } as CSSProperties}
    >
      <rect className={styles.road} x="0" y="180" width="600" height="50" />
      {lines.map((d, i) => (
        <path key={i} d={d} className={i === lines.length - 1 ? styles.under : styles.stream} fill="none" />
      ))}
      <g className={styles.carShape}>
        <path
          d={`M185 ${floorY - 6} L200 ${floorY - 20} L255 ${floorY - 38} L305 ${floorY - 48} L335 ${floorY - 48} L405 ${floorY - 24} L425 ${floorY - 12} L425 ${floorY} L185 ${floorY} Z`}
        />
        <rect x={398} y={floorY - 56 - 10 * dfNorm} width={30} height={5} rx={1} />
        <rect x={392} y={floorY - 56 - 10 * dfNorm} width={4} height={36 + 10 * dfNorm} />
        <circle cx={232} cy={floorY + 8} r={19} />
        <circle cx={375} cy={floorY + 8} r={22} />
      </g>
      <g className={styles.arrow}>
        <line x1={300} y1={floorY - 54} x2={300} y2={floorY - 54 + downLength} />
        <path
          d={`M294 ${floorY - 54 + downLength - 8} L300 ${floorY - 54 + downLength + 2} L306 ${floorY - 54 + downLength - 8}`}
        />
        <text x={312} y={floorY - 54 + downLength / 2 + 4}>
          {downforceLabel}
        </text>
      </g>
      <g className={styles.arrow} data-kind="drag">
        <line x1={435} y1={floorY - 16} x2={435 + dragLength} y2={floorY - 16} />
        <path
          d={`M${435 + dragLength - 8} ${floorY - 22} L${435 + dragLength + 2} ${floorY - 16} L${435 + dragLength - 8} ${floorY - 10}`}
        />
        <text x={438} y={floorY - 24}>
          {dragLabel}
        </text>
      </g>
      <text className={styles.gapText} x={236} y={222}>
        {gapLabel}
      </text>
    </svg>
  )
}
