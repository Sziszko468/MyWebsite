import { useMemo } from 'react'
import styles from './SpeedLines.module.scss'

/**
 * Speed lines in three depths, a quiet echo of the home page's Velocity Field: slanted strokes
 * that run up to the right, most of them faint, a few in Racing Red and Cobalt. They are made from
 * a formula (no randomness, so a render never differs from the last); `seed` shifts the pattern so
 * two pages do not draw the same one. The lines lean a little towards a mouse (they read --px and
 * --py from the nearest element that uses usePointerField) and sit still for a finger or when the
 * visitor asked for less motion. Decoration only: hidden from assistive technology, and the parent
 * places and fades it (`className`) so it never reaches the words.
 */
function buildLines(seed: number) {
  return Array.from({ length: 30 }, (_, n) => {
    const i = n + seed * 7
    const length = 90 + ((i * 53) % 230)
    return {
      x: 380 + ((i * 131) % 760),
      y: 70 + ((i * 97) % 540),
      length,
      depth: n % 3,
      tone: n % 9 === 0 ? 'red' : n % 13 === 0 ? 'blue' : 'ink',
      width: n % 5 === 0 ? 3 : n % 2 === 0 ? 2 : 1,
    } as const
  })
}

export function SpeedLines({ className, seed = 0 }: { className?: string; seed?: number }) {
  const lines = useMemo(() => buildLines(seed), [seed])

  return (
    <svg className={className} viewBox="0 0 1200 700" preserveAspectRatio="xMaxYMid slice" aria-hidden="true" focusable="false">
      {[0, 1, 2].map((depth) => (
        <g key={depth} className={styles[`depth${depth}`]}>
          {lines
            .filter((line) => line.depth === depth)
            .map((line, i) => (
              <line
                key={i}
                className={styles[line.tone]}
                x1={line.x}
                y1={line.y}
                x2={line.x + line.length}
                y2={line.y - line.length * 0.38}
                strokeWidth={line.width}
                strokeLinecap="round"
              />
            ))}
        </g>
      ))}
    </svg>
  )
}
