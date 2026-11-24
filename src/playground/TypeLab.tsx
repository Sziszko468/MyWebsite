import { memo, useCallback, useMemo, type Dispatch } from 'react'
import { Button } from '../components/Button/Button'
import { TextField } from '../components/form/fields'
import { LabChoice, LabSlider } from '../components/lab/ui/LabControls'
import { fill } from '../utils/format'
import { copyText } from './clipboard'
import { PreviewStage } from './PreviewStage'
import { Controls, LabSection, Preview, Readout, type LabProps } from './parts'
import type { Action } from './state'
import { FAMILY_STACKS, FONT_FAMILIES, SCALE_RATIOS, TEXT_MAX, TYPE_BOUNDS, hasWidth, typeCss, typeScale, weightsFor, type FontFamilyId, type TypeState } from './typography'
import styles from './TypeLab.module.scss'

interface Props extends LabProps {
  type: TypeState
  dispatch: Dispatch<Action>
  onReset: () => void
}

const RATIO_KEYS = ['r1125', 'r12', 'r125', 'r1333', 'r15'] as const

/** The style the three previews share, as custom properties of their stages. */
function typeVars(state: TypeState): Record<string, string> {
  const scale = typeScale(state)
  return {
    '--pg-font': FAMILY_STACKS[state.family],
    '--pg-h-size': `${scale.heading}px`,
    '--pg-b-size': `${scale.body}px`,
    '--pg-c-size': `${scale.caption}px`,
    '--pg-h-weight': String(state.headingWeight),
    '--pg-b-weight': String(state.bodyWeight),
    '--pg-lh': String(state.lineHeight),
    '--pg-ls': `${state.tracking}em`,
    '--pg-wd': `${state.width}%`,
  }
}

/**
 * The typography laboratory (PROMPT 36): the three typefaces the project has (the brand face, the system stack and the monospace stack), size, weight where the family has
 * it, line height, letter spacing and width, a scale ratio, and the visitor's own heading, paragraph and caption. The same three styles are drawn in a dark and in a light
 * stage side by side, so the theme can be compared without changing the site's.
 */
export const TypeLab = memo(function TypeLab({ type, dispatch, onReset, t, announce }: Props) {
  const scale = typeScale(type)
  const vars = useMemo(() => typeVars(type), [type])
  const variable = type.family === 'archivo'
  const set = useCallback((patch: Partial<TypeState>) => dispatch({ type: 'type/set', patch }), [dispatch])
  const weightOptions = weightsFor(type.family).map((value) => ({ value: String(value), label: value === 400 ? t.type.regular : t.type.bold }))

  const copy = useCallback(async () => {
    announce((await copyText(typeCss(type))) ? fill(t.common.announce.copied, { value: 'CSS' }) : t.common.announce.copyFailed)
  }, [type, announce, t])

  const heading = type.heading || t.type.sampleHeading
  const body = type.body || t.type.sampleBody
  const caption = type.caption || t.type.sampleCaption

  const stage = (theme: 'dark' | 'light', label: string) => (
    <PreviewStage theme={theme} vars={vars} label={label} className={styles.stage}>
      <p className={styles.stageLabel}>{label}</p>
      <div className={styles.sample}>
        <p className={styles.caption}>{caption}</p>
        <h3 className={styles.heading}>{heading}</h3>
        <p className={styles.body}>{body}</p>
      </div>
    </PreviewStage>
  )

  return (
    <LabSection id="type" number="02" title={t.type.title} lead={t.type.lead} resetLabel={t.common.reset} onReset={onReset}>
      <Controls label={t.common.controls}>
        <LabChoice<FontFamilyId>
          label={t.type.family}
          value={type.family}
          options={FONT_FAMILIES.map((id) => ({ value: id, label: t.type.families[id] }))}
          columns={3}
          onChange={(family) => set({ family })}
        />
        <LabSlider label={t.type.size} value={type.size} min={TYPE_BOUNDS.size.min} max={TYPE_BOUNDS.size.max} step={TYPE_BOUNDS.size.step} format={(value) => `${value} px`} onChange={(size) => set({ size })} />
        {variable ? (
          <>
            <LabSlider label={t.type.headingWeight} value={type.headingWeight} min={TYPE_BOUNDS.weight.min} max={TYPE_BOUNDS.weight.max} step={TYPE_BOUNDS.weight.step} onChange={(headingWeight) => set({ headingWeight })} />
            <LabSlider label={t.type.bodyWeight} value={type.bodyWeight} min={TYPE_BOUNDS.weight.min} max={TYPE_BOUNDS.weight.max} step={TYPE_BOUNDS.weight.step} onChange={(bodyWeight) => set({ bodyWeight })} />
          </>
        ) : (
          <>
            <LabChoice label={t.type.headingWeight} value={String(type.headingWeight)} options={weightOptions} onChange={(value) => set({ headingWeight: Number(value) })} />
            <LabChoice label={t.type.bodyWeight} value={String(type.bodyWeight)} options={weightOptions} onChange={(value) => set({ bodyWeight: Number(value) })} />
            <p className={styles.note}>{t.type.weightFixed}</p>
          </>
        )}
        <LabSlider label={t.type.lineHeight} value={type.lineHeight} min={TYPE_BOUNDS.lineHeight.min} max={TYPE_BOUNDS.lineHeight.max} step={TYPE_BOUNDS.lineHeight.step} format={(value) => value.toFixed(2)} onChange={(lineHeight) => set({ lineHeight })} />
        <LabSlider label={t.type.tracking} value={type.tracking} min={TYPE_BOUNDS.tracking.min} max={TYPE_BOUNDS.tracking.max} step={TYPE_BOUNDS.tracking.step} format={(value) => `${value.toFixed(2)} em`} onChange={(tracking) => set({ tracking })} />
        {hasWidth(type.family) && (
          <LabSlider label={t.type.width} value={type.width} min={TYPE_BOUNDS.width.min} max={TYPE_BOUNDS.width.max} step={TYPE_BOUNDS.width.step} format={(value) => `${value}%`} onChange={(width) => set({ width })} />
        )}
        <LabChoice<string>
          label={t.type.ratio}
          value={String(type.ratio)}
          options={SCALE_RATIOS.map((ratio, index) => ({ value: String(ratio), label: t.type.ratios[RATIO_KEYS[index]] }))}
          columns={3}
          onChange={(value) => set({ ratio: Number(value) })}
        />
        <div className={styles.texts}>
          <p className={styles.groupTitle}>{t.type.texts}</p>
          <TextField label={t.type.headingText} hint={fill(t.type.textHelp, { max: TEXT_MAX.heading })} value={type.heading} placeholder={t.type.sampleHeading} maxLength={TEXT_MAX.heading} autoComplete="off" onChange={(event) => set({ heading: event.currentTarget.value })} />
          <TextField multiline rows={3} label={t.type.bodyText} hint={fill(t.type.textHelp, { max: TEXT_MAX.body })} value={type.body} placeholder={t.type.sampleBody} maxLength={TEXT_MAX.body} onChange={(event) => set({ body: event.currentTarget.value })} />
          <TextField label={t.type.captionText} hint={fill(t.type.textHelp, { max: TEXT_MAX.caption })} value={type.caption} placeholder={t.type.sampleCaption} maxLength={TEXT_MAX.caption} autoComplete="off" onChange={(event) => set({ caption: event.currentTarget.value })} />
        </div>
        <Button variant="secondary" size="sm" onClick={copy}>
          {t.common.copyCss}
        </Button>
      </Controls>

      <Preview label={t.common.preview}>
        {stage('dark', t.type.dark)}
        {stage('light', t.type.light)}
        <Readout>{fill(t.type.sizes, { heading: scale.heading, body: scale.body, caption: scale.caption })}</Readout>
      </Preview>
    </LabSection>
  )
})
