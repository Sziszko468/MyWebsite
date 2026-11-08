import { useId } from 'react'
import { cx } from '../../utils/cx'
import { useText } from '../i18n'
import styles from '../styles/ai.module.scss'

/**
 * A bar chart drawn as SVG from the numbers the server recorded: no chart library, no animation, no value invented (a bucket with
 * nothing in it is an empty slot, so the axis is honest). Each chart carries a text summary for a screen reader and the same
 * numbers as a table that opens beneath it, so the figures are never only a picture. Series are stacked.
 */
export interface Series {
  label: string
  /** 0 or 1: which of the two chart colours. */
  tone: 0 | 1
}

export interface BarPoint {
  label: string
  values: number[]
}

const W = 640
const H = 170
const PAD = { left: 8, right: 8, top: 10, bottom: 22 }

export function BarChart({ title, series, points, format, empty }: { title: string; series: readonly Series[]; points: readonly BarPoint[]; format: (value: number) => string; empty: string }) {
  const id = useId()
  const t = useText()
  const totals = points.map((point) => point.values.reduce((sum, value) => sum + value, 0))
  const max = Math.max(...totals, 0)
  const grand = totals.reduce((sum, value) => sum + value, 0)
  if (points.length === 0 || grand === 0) {
    return (
      <figure className={styles.chart} aria-labelledby={`${id}-title`}>
        <figcaption id={`${id}-title`} className={styles.chartTitle}>
          {title}
        </figcaption>
        <p className={styles.chartEmpty}>{empty}</p>
      </figure>
    )
  }
  const slot = (W - PAD.left - PAD.right) / points.length
  const bar = Math.max(1, slot * 0.72)
  const scale = (H - PAD.top - PAD.bottom) / max
  const first = points[0].label
  const last = points[points.length - 1].label
  const summary = `${title}: ${format(grand)} · ${first} – ${last} · ${t.ai.charts.peak} ${format(max)}`

  return (
    <figure className={styles.chart} aria-labelledby={`${id}-title`}>
      <figcaption id={`${id}-title`} className={styles.chartTitle}>
        {title}
        <span className={styles.chartTotal}>{format(grand)}</span>
      </figcaption>
      <svg className={styles.chartSvg} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary} preserveAspectRatio="none" focusable="false">
        <line x1={PAD.left} x2={W - PAD.right} y1={H - PAD.bottom} y2={H - PAD.bottom} className={styles.chartAxis} />
        {points.map((point, index) => {
          let y = H - PAD.bottom
          return (
            <g key={point.label}>
              {point.values.map((value, seriesIndex) => {
                const height = value * scale
                y -= height
                return height > 0 ? <rect key={seriesIndex} x={PAD.left + index * slot + (slot - bar) / 2} y={y} width={bar} height={height} className={cx(styles.chartBar, series[seriesIndex]?.tone === 1 && styles.chartBarAlt)} /> : null
              })}
            </g>
          )
        })}
      </svg>
      <p className={styles.chartAxisLabels} aria-hidden="true">
        <span>{first}</span>
        <span>{last}</span>
      </p>
      <p className={styles.legend}>
        {series.map((item) => (
          <span key={item.label} className={styles.legendItem}>
            <span className={cx(styles.swatch, item.tone === 1 && styles.swatchAlt)} aria-hidden="true" />
            {item.label}
          </span>
        ))}
      </p>
      <details className={styles.chartTable}>
        <summary>{t.ai.charts.showTable}</summary>
        <div className={styles.tableScroll} tabIndex={0} role="group" aria-label={`${title}: ${t.ai.charts.table}`}>
          <table>
            <thead>
              <tr>
                <th scope="col">{t.ai.charts.period}</th>
                {series.map((item) => (
                  <th key={item.label} scope="col">
                    {item.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.label}>
                  <th scope="row">{point.label}</th>
                  {point.values.map((value, index) => (
                    <td key={index}>{format(value)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  )
}

/** A bar for a share of a budget, with the numbers in words beside it (an element a screen reader announces as "x of y"). */
export function Meter({ label, value, max, text, tone }: { label: string; value: number; max: number; text: string; tone: 'normal' | 'warning' | 'danger' }) {
  const id = useId()
  return (
    <div className={styles.meter}>
      <div className={styles.meterHead}>
        <label htmlFor={id}>{label}</label>
        <span>{text}</span>
      </div>
      <meter id={id} className={cx(styles.meterBar, tone === 'warning' && styles.meterWarning, tone === 'danger' && styles.meterDanger)} min={0} max={Math.max(max, 0.000001)} value={Math.min(value, Math.max(max, 0.000001))} aria-valuetext={text} />
    </div>
  )
}
