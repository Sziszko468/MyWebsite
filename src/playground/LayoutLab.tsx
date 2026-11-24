import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type Dispatch } from 'react'
import { Button } from '../components/Button/Button'
import { LabChoice, LabSlider } from '../components/lab/ui/LabControls'
import { ServiceCard } from '../components/ServiceCard/ServiceCard'
import { fill } from '../utils/format'
import { copyText } from './clipboard'
import { previewTokens, type Palette, type PreviewTheme } from './color'
import { ALIGNMENTS, LAYOUT_BOUNDS, PREVIEW_PRESETS, columnsFor, containerIn, layoutCss, type Alignment, type LayoutState, type PreviewPreset } from './layout'
import { PreviewStage } from './PreviewStage'
import { Controls, LabSection, Preview, Readout, type LabProps } from './parts'
import type { Action } from './state'
import styles from './LayoutLab.module.scss'

interface Props extends LabProps {
  layout: LayoutState
  palette: Palette
  theme: PreviewTheme
  dispatch: Dispatch<Action>
  onReset: () => void
}

const CARDS = 6

/** The width of an element, kept up to date by one ResizeObserver that is disconnected when the preview goes. Whole pixels only, so a sub-pixel change does not render. */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const element = ref.current
    if (!element || typeof ResizeObserver === 'undefined') return
    setWidth(Math.round(element.getBoundingClientRect().width))
    const observer = new ResizeObserver((entries) => {
      const next = Math.round(entries[0]?.contentRect.width ?? 0)
      setWidth((current) => (current === next ? current : next))
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}

const presetOf = (width: number): PreviewPreset | '' => (Object.entries(PREVIEW_PRESETS).find(([, value]) => value === width)?.[0] as PreviewPreset | undefined) ?? ''

/**
 * The layout and spacing laboratory (PROMPT 36): the container's width, the number of columns, the gap, the padding, the corner radius and the alignment, every one inside a
 * safe range, drawn with the real service card in a frame whose width is chosen (a phone, a tablet, a desktop, or anything between). The columns that actually fit are worked out
 * from the frame's measured width, so the same layout is seen answering each size.
 */
export const LayoutLab = memo(function LayoutLab({ layout, palette, theme, dispatch, onReset, t, announce }: Props) {
  const tokens = useMemo(() => previewTokens(palette, theme), [palette, theme])
  const [frameRef, measured] = useWidth<HTMLDivElement>()
  const frame = measured || layout.previewWidth
  const used = columnsFor(frame, layout.columns, layout.gap, layout.padding, layout.container)
  const container = containerIn(frame, layout.container)
  const set = useCallback((patch: Partial<LayoutState>) => dispatch({ type: 'layout/set', patch }), [dispatch])

  const copy = useCallback(async () => {
    announce((await copyText(layoutCss(layout))) ? fill(t.common.announce.copied, { value: 'CSS' }) : t.common.announce.copyFailed)
  }, [layout, announce, t])

  const vars = {
    ...tokens,
    '--pg-gap': `${layout.gap}px`,
    '--pg-pad': `${layout.padding}px`,
    '--pg-radius': `${layout.radius}px`,
    '--pg-cols': String(used),
    '--pg-container': `${layout.container}px`,
    '--pg-align': layout.align,
  } as Record<string, string>

  return (
    <LabSection id="layout" number="04" title={t.layout.title} lead={t.layout.lead} resetLabel={t.common.reset} onReset={onReset}>
      <Controls label={t.common.controls}>
        <LabChoice<PreviewPreset | ''>
          label={t.layout.device}
          value={presetOf(layout.previewWidth)}
          options={(['mobile', 'tablet', 'desktop'] as const).map((id) => ({ value: id, label: t.layout.presets[id], help: `${PREVIEW_PRESETS[id]} px` }))}
          columns={3}
          onChange={(id) => id && set({ previewWidth: PREVIEW_PRESETS[id] })}
        />
        <LabSlider label={t.layout.width} value={layout.previewWidth} {...LAYOUT_BOUNDS.previewWidth} format={(value) => `${value} px`} onChange={(previewWidth) => set({ previewWidth })} />
        <LabSlider label={t.layout.container} value={layout.container} {...LAYOUT_BOUNDS.container} format={(value) => `${value} px`} onChange={(container) => set({ container })} />
        <LabSlider label={t.layout.columns} value={layout.columns} {...LAYOUT_BOUNDS.columns} onChange={(columns) => set({ columns })} />
        <LabSlider label={t.layout.gap} value={layout.gap} {...LAYOUT_BOUNDS.gap} format={(value) => `${value} px`} onChange={(gap) => set({ gap })} />
        <LabSlider label={t.layout.padding} value={layout.padding} {...LAYOUT_BOUNDS.padding} format={(value) => `${value} px`} onChange={(padding) => set({ padding })} />
        <LabSlider label={t.layout.radius} value={layout.radius} {...LAYOUT_BOUNDS.radius} format={(value) => `${value} px`} onChange={(radius) => set({ radius })} />
        <LabChoice<Alignment> label={t.layout.align} value={layout.align} options={ALIGNMENTS.map((id) => ({ value: id, label: t.layout.aligns[id] }))} columns={2} onChange={(align) => set({ align })} />
        <Button variant="secondary" size="sm" onClick={copy}>
          {t.common.copyCss}
        </Button>
      </Controls>

      <Preview label={t.common.preview}>
        <PreviewStage theme={theme} vars={vars} label={fill(t.layout.frame, { width: layout.previewWidth })} className={styles.stage}>
          <div ref={frameRef} className={styles.frame} style={{ '--pg-frame': `${layout.previewWidth}px` } as CSSProperties}>
            <div className={styles.container}>
              <ul className={styles.grid}>
                {Array.from({ length: CARDS }, (_, index) => (
                  <li key={index} className={styles.cell}>
                    <ServiceCard
                      className={styles.card}
                      name={fill(t.layout.cardTitle, { number: index + 1 })}
                      description={index === 1 ? t.layout.cardTall : t.layout.cardText}
                      price={{ kind: 'quote' }}
                      index={String(index + 1).padStart(2, '0')}
                      headingLevel={3}
                    />
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </PreviewStage>
        <Readout>{fill(t.layout.readout, { frame, used, wanted: layout.columns, container })}</Readout>
        <p className={styles.note}>{used < layout.columns ? t.layout.cut : t.layout.tall}</p>
      </Preview>
    </LabSection>
  )
})
