import { memo, useCallback, useMemo, type Dispatch } from 'react'
import { Badge } from '../components/Badge/Badge'
import { Button } from '../components/Button/Button'
import { TextField } from '../components/form/fields'
import { LabChoice } from '../components/lab/ui/LabControls'
import { ServiceCard } from '../components/ServiceCard/ServiceCard'
import { fill } from '../utils/format'
import { copyText } from './clipboard'
import {
  BRAND_IDS,
  BRAND_TOKENS,
  HEX_INPUT_MAX,
  contrastReport,
  contrastRatio,
  isOriginalPalette,
  paletteCss,
  previewTokens,
  showRatio,
  wcag,
  type BrandId,
  type PreviewTheme,
} from './color'
import { PreviewStage } from './PreviewStage'
import { Controls, LabSection, Preview, Readout, type LabProps } from './parts'
import type { Action, ColorState } from './state'
import styles from './ColorLab.module.scss'

/** The brand colours' names are proper nouns: the same in every language. */
const NAMES: Record<BrandId, string> = { red: 'Racing Red', black: 'Carbon Black', blue: 'Cobalt Blue', paper: 'Warm Paper', graphite: 'Graphite' }

interface Props extends LabProps {
  color: ColorState
  theme: PreviewTheme
  dispatch: Dispatch<Action>
  onReset: () => void
}

interface RowProps extends LabProps {
  id: BrandId
  draft: string
  palette: string
  error: ColorState['errors'][BrandId]
  dispatch: Dispatch<Action>
}

/** One brand colour: its swatch and picker, its HEX field with the reason when it is wrong, copy, and whether it is the original or changed here. */
const PaletteRow = memo(function PaletteRow({ id, draft, palette, error, dispatch, t, announce }: RowProps) {
  const name = NAMES[id]
  const original = BRAND_TOKENS[id].hex
  const changed = palette !== original

  const copy = useCallback(async () => {
    announce((await copyText(palette)) ? fill(t.common.announce.copied, { value: palette }) : t.common.announce.copyFailed)
  }, [palette, announce, t])

  return (
    <fieldset className={styles.row} data-changed={changed} data-invalid={error ? 'true' : undefined}>
      <legend className={styles.legend}>
        {name} <code className={styles.token}>{BRAND_TOKENS[id].token}</code>
      </legend>
      <div className={styles.entry}>
        <input
          className={styles.picker}
          type="color"
          value={palette}
          aria-label={fill(t.color.pick, { name })}
          onChange={(event) => dispatch({ type: 'color/pick', id, hex: event.currentTarget.value })}
        />
        <TextField
          className={styles.hex}
          label={t.color.hex}
          hint={t.color.hexHint}
          value={draft}
          maxLength={HEX_INPUT_MAX}
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          error={error ? `${t.color.errors[error]} ${t.color.errorKeeps}` : undefined}
          onChange={(event) => dispatch({ type: 'color/draft', id, value: event.currentTarget.value })}
        />
        {/* The visible word is "Copy"; the name a screen reader hears says whose value (it starts with the visible word). */}
        <Button variant="secondary" size="sm" onClick={copy} aria-label={fill(t.color.copyValue, { name })}>
          {t.common.copy}
        </Button>
      </div>
      <p className={styles.status}>
        <span className={styles.dot} aria-hidden="true" />
        <span>{changed ? t.color.changed : t.color.original}</span>
        {changed && (
          <>
            <span className={styles.was}>{fill(t.color.originalValue, { hex: original })}</span>
            <Button variant="text" size="sm" onClick={() => dispatch({ type: 'color/pick', id, hex: original })} aria-label={fill(t.color.restoreOne, { name })}>
              {t.color.restore}
            </Button>
          </>
        )}
      </p>
    </fieldset>
  )
})

/**
 * The colour laboratory (PROMPT 36). The five brand colours start as the tokens of tokens.css; each can be typed (HEX, validated, the last valid colour stays in
 * use while the field is wrong), picked, copied and restored. A pair of them shows its WCAG 2 contrast, and a stage in the preview theme draws real buttons, a real
 * card and text with the visitor's colours. A changed colour is marked as a temporary change; nothing here reaches the site's own theme.
 */
export const ColorLab = memo(function ColorLab({ color, theme, dispatch, onReset, t, lang, announce }: Props) {
  const { palette, draft, errors, fg, bg } = color
  const changed = !isOriginalPalette(palette)
  const tokens = useMemo(() => previewTokens(palette, theme), [palette, theme])
  const report = useMemo(() => contrastReport(palette, theme), [palette, theme])
  const failing = report.filter((row) => !row.ok).length
  const ratio = contrastRatio(palette[fg], palette[bg])
  const levels = wcag(ratio)
  const colourOptions = BRAND_IDS.map((id) => ({ value: id, label: NAMES[id] }))

  const copyCss = useCallback(async () => {
    announce((await copyText(paletteCss(palette))) ? fill(t.common.announce.copied, { value: 'CSS' }) : t.common.announce.copyFailed)
  }, [palette, announce, t])

  const rows: Array<[keyof typeof levels, string]> = [
    ['aa', t.color.levels.aa],
    ['aaLarge', t.color.levels.aaLarge],
    ['aaa', t.color.levels.aaa],
    ['aaaLarge', t.color.levels.aaaLarge],
    ['ui', t.color.levels.ui],
  ]

  return (
    <LabSection id="color" number="01" title={t.color.title} lead={t.color.lead} resetLabel={t.common.reset} onReset={onReset}>
      <Controls label={t.color.palette}>
        <div className={styles.palette}>
          {BRAND_IDS.map((id) => (
            <PaletteRow key={id} id={id} draft={draft[id]} palette={palette[id]} error={errors[id]} dispatch={dispatch} t={t} lang={lang} announce={announce} />
          ))}
        </div>
        <div className={styles.row2}>
          <Button variant="secondary" size="sm" onClick={copyCss}>
            {t.common.copyCss}
          </Button>
        </div>
      </Controls>

      <Preview label={t.common.preview}>
        <section className={styles.pair} aria-labelledby="pair-title">
          <h3 id="pair-title" className={styles.h3}>
            {t.color.pairTitle}
          </h3>
          <div className={styles.pairControls}>
            <LabChoice label={t.color.foreground} value={fg} options={colourOptions} columns={3} onChange={(value) => dispatch({ type: 'color/pair', fg: value })} />
            <LabChoice label={t.color.background} value={bg} options={colourOptions} columns={3} onChange={(value) => dispatch({ type: 'color/pair', bg: value })} />
          </div>
          <div className={styles.sample} style={{ color: palette[fg], backgroundColor: palette[bg] }}>
            <span className={styles.big} aria-hidden="true">
              {t.color.pairBig}
            </span>
            <span className={styles.sampleText}>{t.color.pairSample}</span>
            <span className={styles.sampleLarge}>{t.color.pairSampleLarge}</span>
          </div>
          <p className={styles.ratio}>{fill(t.color.ratio, { ratio: showRatio(ratio) })}</p>
          <ul className={styles.levels} aria-label={t.color.levelsLabel}>
            {rows.map(([key, label]) => (
              <li key={key} data-pass={levels[key]}>
                <span aria-hidden="true">{levels[key] ? '✓' : '✕'}</span>
                <span>{label}</span>
                <strong>{levels[key] ? t.common.pass : t.common.fail}</strong>
              </li>
            ))}
          </ul>
        </section>

        <PreviewStage theme={theme} vars={tokens} label={t.color.sampleTitle}>
          <div className={styles.stageInner}>
            <h3 className={styles.stageHeading}>{t.color.sampleHeading}</h3>
            <p className={styles.stageBody}>{t.color.sampleBody}</p>
            <div className={styles.buttons}>
              <Button variant="primary" arrow>
                {t.color.sampleButton}
              </Button>
              <Button variant="secondary">{t.color.sampleSecondary}</Button>
              <Badge status="demo" />
            </div>
            <ServiceCard name={t.components.sample.serviceName} description={t.components.sample.serviceText} price={{ kind: 'quote' }} index="01" headingLevel={4} />
          </div>
        </PreviewStage>
        <Readout>{changed ? t.color.previewChanged : t.color.previewOriginal}</Readout>

        <details className={styles.report}>
          <summary>{t.color.reportOpen}</summary>
          <p className={styles.verdict} data-ok={failing === 0}>
            {failing === 0 ? t.color.allOk : fill(t.color.someFail, { count: failing })}
          </p>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <caption>{t.color.reportTitle}</caption>
              <thead>
                <tr>
                  <th scope="col">{t.color.reportColumns.role}</th>
                  <th scope="col">{t.color.reportColumns.ratio}</th>
                  <th scope="col">{t.color.reportColumns.needs}</th>
                  <th scope="col">{t.color.reportColumns.result}</th>
                </tr>
              </thead>
              <tbody>
                {report.map((row) => (
                  <tr key={row.id} data-ok={row.ok}>
                    <th scope="row">
                      <span className={styles.chips} aria-hidden="true">
                        <i style={{ backgroundColor: row.fg }} />
                        <i style={{ backgroundColor: row.bg }} />
                      </span>
                      {t.color.roles[row.id]}
                    </th>
                    <td>{showRatio(row.ratio)}:1</td>
                    <td>{row.needs}:1</td>
                    <td>
                      <span aria-hidden="true">{row.ok ? '✓ ' : '✕ '}</span>
                      {row.ok ? t.common.pass : t.common.fail}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={styles.note}>{t.color.reportNote}</p>
        </details>
      </Preview>
    </LabSection>
  )
})
