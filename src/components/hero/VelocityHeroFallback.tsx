import { useId } from 'react'
import styles from './VelocityHeroFallback.module.scss'

/**
 * Static stand-in for the 3D scene: the same world (night track, Racing Red streaks, Cobalt
 * Blue side lights, a car seen from behind) drawn as one lightweight SVG. It shows while the
 * scene loads, when WebGL is missing or has failed, on weak devices and when the visitor
 * prefers reduced motion. It follows the theme through the same `--scene-*` tokens.
 */
export function VelocityHeroFallback() {
  const id = useId()
  const glow = `${id}-glow`
  const fade = `${id}-fade`
  const lamp = `${id}-lamp`

  return (
    <svg
      className={styles.fallback}
      viewBox="0 0 1600 900"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <radialGradient id={glow} cx="50%" cy="50%" r="50%">
          <stop offset="0%" className={styles.stopRed} stopOpacity="0.55" />
          <stop offset="55%" className={styles.stopRed} stopOpacity="0.12" />
          <stop offset="100%" className={styles.stopRed} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={fade} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" className={styles.stopBg} stopOpacity="1" />
          <stop offset="100%" className={styles.stopBg} stopOpacity="0" />
        </linearGradient>
        <radialGradient id={lamp} cx="50%" cy="50%" r="50%">
          <stop offset="0%" className={styles.stopRed} stopOpacity="0.9" />
          <stop offset="100%" className={styles.stopRed} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* The world is drawn around a vanishing point and shifted right on wide screens. */}
      <g className={styles.world}>
        <ellipse cx="800" cy="410" rx="640" ry="190" fill={`url(#${glow})`} />
        <ellipse cx="330" cy="430" rx="300" ry="120" className={styles.blueGlow} />

        {/* Track with a bend to the left, narrowing to the horizon. */}
        <path className={styles.track} d="M 280 900 C 430 700 640 560 770 420 L 860 420 C 960 560 1160 720 1480 900 Z" />
        <rect x="0" y="380" width="1600" height="150" fill={`url(#${fade})`} />

        {/* Lane edges and centre dashes. */}
        <path className={styles.edge} d="M 300 900 C 440 700 650 566 774 422" />
        <path className={styles.edge} d="M 1460 900 C 1160 720 970 566 858 422" />
        <path className={styles.dashes} d="M 880 900 C 850 720 826 560 818 424" />

        {/* Racing Red streaks, dominant, with a soft wider copy as the glow. */}
        <g className={styles.streaks}>
          <path className={styles.redHalo} d="M 380 900 C 500 690 670 560 782 424" />
          <path className={styles.red} d="M 380 900 C 500 690 670 560 782 424" />
          <path className={styles.redHalo} d="M 1380 900 C 1130 700 960 566 852 424" />
          <path className={styles.red} d="M 1380 900 C 1130 700 960 566 852 424" />
          <path className={styles.redHalo} d="M 150 900 C 330 660 600 520 770 410" />
          <path className={styles.red} d="M 150 900 C 330 660 600 520 770 410" />
        </g>

        {/* Cobalt Blue secondary lights on the outside. */}
        <g className={styles.blues}>
          <path className={styles.blueHalo} d="M 40 760 C 300 560 600 470 760 400" />
          <path className={styles.blue} d="M 40 760 C 300 560 600 470 760 400" />
          <path className={styles.blueHalo} d="M 1560 780 C 1250 600 1020 480 866 402" />
          <path className={styles.blue} d="M 1560 780 C 1250 600 1020 480 866 402" />
        </g>

        {/* A generic prototype racer seen from behind: no marque, no livery. */}
        <g className={styles.car} transform="translate(830 840)">
          <ellipse cx="0" cy="6" rx="250" ry="22" className={styles.shadow} />
          <rect x="-218" y="-98" width="64" height="98" rx="14" className={styles.tyre} />
          <rect x="154" y="-98" width="64" height="98" rx="14" className={styles.tyre} />
          <path className={styles.body} d="M -168 -6 C -176 -66 -138 -118 -76 -128 L 76 -128 C 138 -118 176 -66 168 -6 Z" />
          <path className={styles.canopy} d="M -78 -128 C -66 -176 66 -176 78 -128 Z" />
          <path className={styles.trim} d="M -150 -6 L -126 -38 L 126 -38 L 150 -6 Z" />
          <rect x="-104" y="-70" width="208" height="9" rx="3" className={styles.lampBar} />
          <ellipse cx="0" cy="-66" rx="170" ry="34" fill={`url(#${lamp})`} />
          <rect x="-196" y="-196" width="392" height="16" rx="3" className={styles.wing} />
          <rect x="-196" y="-206" width="12" height="82" rx="3" className={styles.wing} />
          <rect x="184" y="-206" width="12" height="82" rx="3" className={styles.wing} />
          <rect x="-190" y="-186" width="4" height="44" className={styles.lampBar} />
          <rect x="186" y="-186" width="4" height="44" className={styles.lampBar} />
          <rect x="-26" y="-182" width="14" height="56" className={styles.trim} />
          <rect x="12" y="-182" width="14" height="56" className={styles.trim} />
        </g>
      </g>
    </svg>
  )
}
