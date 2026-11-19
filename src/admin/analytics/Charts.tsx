import { useId, type ReactNode } from 'react'
import { cx } from '../../utils/cx'
import styles from '../styles/analytics.module.scss'
import { useAnalyticsText } from './text'

/**
 * The chart library of the analytics (PROMPT 32): line, bar (grouped or stacked), ring, horizontal bars, funnel and a small trend line, drawn as SVG or plain HTML from the numbers the
 * server sent: no chart dependency, no animation, no value made up (a period with nothing in it is an empty slot, so the axis is honest, and an empty chart says so in words).
 *
 * Every chart carries what is needed to read it without seeing it: a title and a description, the unit in its numbers, a legend (colours are never the only difference: the second series
 * is dashed, and every figure is written next to its swatch), a one-sentence summary for a screen reader, and the same numbers as a table that opens beneath it.
 */

export type Tone = 0 | 1 | 2 | 3 | 4 | 5

export interface ChartSeries {
  label: string
  values: number[]
  tone: Tone
}

interface TableData {
  /** The first column's heading, then one per series. */
  head: string[]
  rows: string[][]
}

function Frame({ title, description, note, total, legend, table, children }: { title: string; description?: string; note?: ReactNode; total?: string; legend?: ReactNode; table?: TableData; children: ReactNode }) {
  const id = useId()
  const t = useAnalyticsText()
  return (
    <figure className={styles.chart} aria-labelledby={`${id}-title`} aria-describedby={description ? `${id}-desc` : undefined}>
      <figcaption className={styles.chartCaption}>
        <span id={`${id}-title`} className={styles.chartTitle}>
          {title}
        </span>
        {total && <span className={styles.chartTotal}>{total}</span>}
      </figcaption>
      {description && (
        <p id={`${id}-desc`} className={styles.chartDescription}>
          {description}
        </p>
      )}
      {note}
      {children}
      {legend}
      {table && (
        <details className={styles.chartTable}>
          <summary>{t.actions.showTable}</summary>
          <div className={styles.tableScroll} tabIndex={0} role="group" aria-label={`${title}: ${t.actions.table}`}>
            <table>
              <thead>
                <tr>
                  {table.head.map((cell, index) => (
                    <th key={index} scope="col">
                      {cell}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {row.map((cell, index) => (index === 0 ? <th key={index} scope="row">{cell}</th> : <td key={index}>{cell}</td>))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </figure>
  )
}

function Empty({ title, description, note }: { title: string; description?: string; note?: ReactNode }) {
  const t = useAnalyticsText()
  return (
    <Frame title={title} description={description} note={note}>
      <p className={styles.chartEmpty}>{t.charts.noData}</p>
    </Frame>
  )
}

function Legend({ items }: { items: ReadonlyArray<{ label: string; tone: Tone; value?: string }> }) {
  const t = useAnalyticsText()
  return (
    <ul className={styles.legend} aria-label={t.charts.legend}>
      {items.map((item) => (
        <li key={item.label} className={styles.legendItem}>
          <span className={styles.swatch} data-tone={item.tone} aria-hidden="true" />
          <span>{item.label}</span>
          {item.value !== undefined && <span className={styles.legendValue}>{item.value}</span>}
        </li>
      ))}
    </ul>
  )
}

const W = 640
const H = 180
const PAD = { left: 8, right: 8, top: 12, bottom: 8 }
const INNER_W = W - PAD.left - PAD.right
const INNER_H = H - PAD.top - PAD.bottom

function axisLabels(labels: readonly string[]) {
  const first = labels[0]
  const last = labels[labels.length - 1]
  return (
    <p className={styles.axisLabels} aria-hidden="true">
      <span>{first}</span>
      {labels.length > 1 && <span>{last}</span>}
    </p>
  )
}

interface SeriesChartProps {
  title: string
  description?: string
  /** What the project status filter did to this chart (only when one is selected). */
  note?: ReactNode
  /** One label per period, in order. */
  labels: string[]
  series: ChartSeries[]
  /** Writes one value with its unit (the unit is also in the description). */
  format: (value: number) => string
}

function tableOf(props: SeriesChartProps, t: ReturnType<typeof useAnalyticsText>): TableData {
  return { head: [t.charts.period, ...props.series.map((item) => item.label)], rows: props.labels.map((label, index) => [label, ...props.series.map((item) => props.format(item.values[index] ?? 0))]) }
}

function peakOf(values: number[][], stacked: boolean): number {
  if (values.length === 0) return 0
  const count = values[0].length
  let peak = 0
  for (let index = 0; index < count; index += 1) {
    const at = stacked ? values.reduce((sum, item) => sum + (item[index] ?? 0), 0) : Math.max(...values.map((item) => item[index] ?? 0))
    peak = Math.max(peak, at)
  }
  return peak
}

/** A line per series over the periods (values of one unit: the chart never mixes units, and money in two currencies is two charts). */
export function LineChart(props: SeriesChartProps) {
  const t = useAnalyticsText()
  const { title, description, note, labels, series, format } = props
  const peak = peakOf(series.map((item) => item.values), false)
  if (labels.length === 0 || peak === 0) return <Empty title={title} description={description} note={note} />
  const x = (index: number) => PAD.left + (labels.length === 1 ? INNER_W / 2 : (index / (labels.length - 1)) * INNER_W)
  const y = (value: number) => PAD.top + INNER_H - (value / peak) * INNER_H
  const total = series.length === 1 ? series[0].values.reduce((sum, value) => sum + value, 0) : null
  const summary = `${title}: ${labels[0]} – ${labels[labels.length - 1]} · ${t.charts.peak} ${format(peak)}`
  return (
    <Frame title={title} description={description} note={note} total={total === null ? undefined : `${t.charts.total}: ${format(total)}`} legend={series.length > 1 ? <Legend items={series} /> : undefined} table={tableOf(props, t)}>
      <svg className={styles.chartSvg} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary} focusable="false">
        {[0, 0.5, 1].map((share) => (
          <line key={share} x1={PAD.left} x2={W - PAD.right} y1={PAD.top + INNER_H * (1 - share)} y2={PAD.top + INNER_H * (1 - share)} className={share === 0 ? styles.axis : styles.grid} />
        ))}
        {series.map((item) => (
          <g key={item.label} data-tone={item.tone} className={styles.lineGroup}>
            <polyline className={styles.line} fill="none" points={item.values.map((value, index) => `${x(index)},${y(value)}`).join(' ')} />
            {labels.length <= 45 &&
              item.values.map((value, index) => (
                <circle key={index} className={styles.dot} cx={x(index)} cy={y(value)} r={2.5}>
                  <title>{`${item.label} · ${labels[index]}: ${format(value)}`}</title>
                </circle>
              ))}
          </g>
        ))}
      </svg>
      {axisLabels(labels)}
      <p className={styles.peak}>
        {t.charts.peak}: {format(peak)}
      </p>
    </Frame>
  )
}

/** Bars per period: one group of bars per period (`grouped`), or the series stacked into one bar (`stacked`: for parts of a whole). */
export function BarChart(props: SeriesChartProps & { mode: 'grouped' | 'stacked' }) {
  const t = useAnalyticsText()
  const { title, description, note, labels, series, format, mode } = props
  const peak = peakOf(series.map((item) => item.values), mode === 'stacked')
  if (labels.length === 0 || peak === 0) return <Empty title={title} description={description} note={note} />
  const slot = INNER_W / labels.length
  const bar = Math.max(1, (slot * 0.74) / (mode === 'grouped' ? series.length : 1))
  const scale = INNER_H / peak
  const total = series.length === 1 ? series[0].values.reduce((sum, value) => sum + value, 0) : null
  const summary = `${title}: ${labels[0]} – ${labels[labels.length - 1]} · ${t.charts.peak} ${format(peak)}`
  return (
    <Frame title={title} description={description} note={note} total={total === null ? undefined : `${t.charts.total}: ${format(total)}`} legend={<Legend items={series} />} table={tableOf(props, t)}>
      <svg className={styles.chartSvg} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary} focusable="false">
        {[0, 0.5, 1].map((share) => (
          <line key={share} x1={PAD.left} x2={W - PAD.right} y1={PAD.top + INNER_H * (1 - share)} y2={PAD.top + INNER_H * (1 - share)} className={share === 0 ? styles.axis : styles.grid} />
        ))}
        {labels.map((label, index) => {
          let stacked = PAD.top + INNER_H
          return (
            <g key={`${label}-${index}`}>
              {series.map((item, seriesIndex) => {
                const value = item.values[index] ?? 0
                const height = value * scale
                if (height <= 0) return null
                if (mode === 'stacked') stacked -= height
                const left = PAD.left + index * slot + (slot - bar) / 2 + (mode === 'grouped' ? (seriesIndex - (series.length - 1) / 2) * bar : 0)
                return (
                  <rect key={item.label} className={styles.bar} data-tone={item.tone} x={left} y={mode === 'stacked' ? stacked : PAD.top + INNER_H - height} width={bar} height={height}>
                    <title>{`${item.label} · ${label}: ${format(value)}`}</title>
                  </rect>
                )
              })}
            </g>
          )
        })}
      </svg>
      {axisLabels(labels)}
      <p className={styles.peak}>
        {t.charts.peak}: {format(peak)}
      </p>
    </Frame>
  )
}

export interface Slice {
  label: string
  value: number
}

/** A ring for the parts of one whole. Each part is written in the legend with its count and its share, so the colour is never the only way to tell them apart. */
export function DonutChart({ title, description, note, items, format, share }: { title: string; description?: string; note?: ReactNode; items: Slice[]; format: (value: number) => string; share: (fraction: number) => string }) {
  const t = useAnalyticsText()
  const total = items.reduce((sum, item) => sum + item.value, 0)
  if (items.length === 0 || total === 0) return <Empty title={title} description={description} note={note} />
  const radius = 40
  const circumference = 2 * Math.PI * radius
  const tone = (index: number): Tone => (index % 6) as Tone
  // Where each arc starts: the length of everything before it.
  const arcs = items.map((item, index) => ({ item, index, length: (item.value / total) * circumference, start: (items.slice(0, index).reduce((sum, earlier) => sum + earlier.value, 0) / total) * circumference }))
  const summary = `${title}: ${items.map((item) => `${item.label} ${format(item.value)}`).join(', ')}`
  return (
    <Frame
      title={title}
      description={description}
      note={note}
      total={`${t.charts.total}: ${format(total)}`}
      legend={<Legend items={items.map((item, index) => ({ label: item.label, tone: tone(index), value: `${format(item.value)} · ${share(item.value / total)}` }))} />}
      table={{ head: [title, t.charts.value, t.charts.share], rows: items.map((item) => [item.label, format(item.value), share(item.value / total)]) }}
    >
      <svg className={styles.donutSvg} viewBox="0 0 100 100" role="img" aria-label={summary} focusable="false">
        <g transform="rotate(-90 50 50)">
          {arcs.map(({ item, index, length, start }) => (
            <circle key={item.label} className={styles.ring} data-tone={tone(index)} cx={50} cy={50} r={radius} fill="none" strokeWidth={16} strokeDasharray={`${length} ${circumference - length}`} strokeDashoffset={-start}>
              <title>{`${item.label}: ${format(item.value)}`}</title>
            </circle>
          ))}
        </g>
        <text className={styles.donutTotal} x={50} y={54} textAnchor="middle">
          {format(total)}
        </text>
      </svg>
    </Frame>
  )
}

export interface BarItem {
  label: string
  value: number
  /** A second line under the label (for example how many of the requests were followed by an accepted quotation). */
  detail?: string
}

/** Horizontal bars for independent counts (a request can ask for several services, a customer can be in several segments): each bar is its own count against the largest. */
export function BarList({ title, description, note, items, format }: { title: string; description?: string; note?: ReactNode; items: BarItem[]; format: (value: number) => string }) {
  const t = useAnalyticsText()
  const peak = Math.max(0, ...items.map((item) => item.value))
  if (items.length === 0 || peak === 0) return <Empty title={title} description={description} note={note} />
  return (
    <Frame title={title} description={description} note={note} table={{ head: [title, t.charts.value], rows: items.map((item) => [item.label, format(item.value)]) }}>
      <ul className={styles.barList}>
        {items.map((item) => (
          <li key={item.label} className={styles.barRow}>
            <span className={styles.barLabel}>{item.label}</span>
            <span className={styles.barValue}>{format(item.value)}</span>
            <span className={styles.barTrack} aria-hidden="true">
              <span className={styles.barFill} style={{ width: `${(item.value / peak) * 100}%` }} />
            </span>
            {item.detail && <span className={styles.barDetail}>{item.detail}</span>}
          </li>
        ))}
      </ul>
    </Frame>
  )
}

export interface FunnelStep {
  label: string
  count: number
  /** Lines under the stage name: its conversion and the time since the stage before. */
  notes: string[]
}

/** The funnel: one bar per stage, each as wide as its count against the first stage, with its own conversion written out. */
export function FunnelChart({ title, description, note, steps, format }: { title: string; description?: string; note?: ReactNode; steps: FunnelStep[]; format: (value: number) => string }) {
  const t = useAnalyticsText()
  const first = steps[0]?.count ?? 0
  if (steps.length === 0 || first === 0) return <Empty title={title} description={description} note={note} />
  return (
    <Frame title={title} description={description} note={note} table={{ head: [title, t.charts.value], rows: steps.map((step) => [step.label, format(step.count)]) }}>
      <ol className={styles.funnel}>
        {steps.map((step) => (
          <li key={step.label} className={styles.funnelRow}>
            <span className={styles.funnelLabel}>{step.label}</span>
            <span className={styles.funnelCount}>{format(step.count)}</span>
            <span className={styles.funnelTrack} aria-hidden="true">
              <span className={styles.funnelFill} style={{ width: `${Math.max(1, (step.count / first) * 100)}%` }} />
            </span>
            {step.notes.length > 0 && <span className={styles.funnelNotes}>{step.notes.join(' · ')}</span>}
          </li>
        ))}
      </ol>
    </Frame>
  )
}

/** The trend on a KPI card: the line of the series with no axes and no words (the card says the figure; the full chart and its table are below). */
export function Sparkline({ values, tone = 0 }: { values: number[]; tone?: Tone }) {
  const peak = Math.max(0, ...values)
  if (values.length < 2 || peak === 0) return null
  const w = 120
  const h = 28
  const points = values.map((value, index) => `${(index / (values.length - 1)) * w},${h - 2 - (value / peak) * (h - 4)}`).join(' ')
  return (
    <svg className={cx(styles.spark)} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" focusable="false" data-tone={tone} preserveAspectRatio="none">
      <polyline className={styles.sparkLine} fill="none" points={points} />
    </svg>
  )
}
