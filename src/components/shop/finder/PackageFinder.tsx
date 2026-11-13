import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { track } from '../../../analytics/tracker'
import { useCatalogVersion } from '../../../content/liveCatalog'
import { getPackage, packages, type PackageId } from '../../../content/packages'
import { comparison } from '../../../content/shop/comparison'
import { useI18n } from '../../../i18n/useI18n'
import { SHOP_PATHS } from '../../../shop/paths'
import { FINDER, FINDER_QUESTION_IDS, percent, recommend, type FinderAnswers, type FinderQuestionId, type PackageFit } from '../../../shop/recommend'
import { useShopText } from '../../../shop/useShopText'
import { fill } from '../../../utils/format'
import { Button } from '../../Button/Button'
import { ChoiceCard, ChoiceFieldset } from '../Choice'
import styles from './PackageFinder.module.scss'

interface PackageFinderProps {
  /** The package selected in the comparison. */
  value: PackageId
  /** Selects a package in the comparison (and nothing else: no request is sent, the visitor stays in control). */
  onChoose: (id: PackageId) => void
}

/**
 * "Not sure which package is right for you?" (PROMPT 20): four short questions, then a suggestion with the reasons. The rules are
 * in src/shop/recommend.ts (rule-based, computed from the comparison as configured, no AI). This component only asks and shows. It
 * never submits anything and never chooses for the visitor: "Choose" selects the package in the comparison, which they can change
 * at once, and every package stays one click away.
 */
export function PackageFinder({ value, onChoose }: PackageFinderProps) {
  // The comparison and the packages are updated in place by the live catalogue; the version changes when they do, and the suggestion is worked out again.
  const catalogVersion = useCatalogVersion()
  const { lang } = useI18n()
  const { finder: f } = useShopText()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)
  const [showResult, setShowResult] = useState(false)
  const [answers, setAnswers] = useState<FinderAnswers>({})
  const headingRef = useRef<HTMLHeadingElement>(null)
  const panelId = useId()
  const titleId = useId()

  const total = FINDER_QUESTION_IDS.length
  const question = FINDER[step]
  const words = f.questions[question.id as FinderQuestionId]

  const result = useMemo(
    () =>
      // `catalogVersion` is read here on purpose: the comparison and the packages are module data changed in place, and this tells React when to look again.
      (void catalogVersion,
      recommend(
        comparison,
        {
          order: packages.map((pack) => pack.id),
          improving: packages.filter((pack) => pack.needs.includes('improve')).map((pack) => pack.id),
          unavailable: packages.filter((pack) => pack.available === false).map((pack) => pack.id),
        },
        answers,
      )),
    [answers, catalogVersion],
  )

  // The step title takes focus when the step or the result changes (a keyboard or screen reader user lands on the new content).
  const moved = useRef(false)
  useEffect(() => {
    if (moved.current) headingRef.current?.focus()
    moved.current = true
  }, [step, showResult])

  const resultPackage = result.kind === 'package' ? result.primary.id : null
  useEffect(() => {
    if (showResult && resultPackage) track('recommendation_viewed', { plan: resultPackage })
  }, [showResult, resultPackage])

  const restart = () => {
    setAnswers({})
    setStep(0)
    setShowResult(false)
  }
  const nameOf = (id: PackageId) => getPackage(id).name
  const featureNames = (features: readonly { name: Record<'hu' | 'en' | 'nl', string> }[]) => features.map((feature) => feature.name[lang]).join(', ')

  return (
    <div className={styles.root} data-open={open || undefined}>
      <div className={styles.head}>
        <div>
          <h3 id={titleId} className={styles.title}>
            {f.title}
          </h3>
          <p className={styles.intro}>{f.intro}</p>
        </div>
        {!open && (
          <Button type="button" variant="secondary" arrow onClick={() => setOpen(true)} aria-expanded={false} aria-controls={panelId}>
            {f.open}
          </Button>
        )}
      </div>

      {open && (
        <section id={panelId} aria-labelledby={titleId} className={styles.panel}>
          {!showResult ? (
            <form
              onSubmit={(event) => {
                event.preventDefault()
                if (step < total - 1) setStep(step + 1)
                else setShowResult(true)
              }}
            >
              <p className={styles.progress}>{fill(f.progress, { current: step + 1, total })}</p>
              <h4 ref={headingRef} tabIndex={-1} className={styles.question}>
                {words.title}
              </h4>
              <ChoiceFieldset legend={<span className="visually-hidden">{words.title}</span>} hint={words.help}>
                {question.options.map((option) => (
                  <ChoiceCard
                    key={option.id}
                    type="radio"
                    name={`finder-${question.id}`}
                    value={option.id}
                    checked={answers[question.id] === option.id}
                    onChange={() => setAnswers((current) => ({ ...current, [question.id]: option.id }))}
                    title={(words.options as Record<string, string>)[option.id]}
                    compact
                  />
                ))}
              </ChoiceFieldset>
              <div className={styles.actions}>
                {step > 0 ? (
                  <Button type="button" variant="secondary" onClick={() => setStep(step - 1)}>
                    {f.back}
                  </Button>
                ) : (
                  <Button type="button" variant="text" onClick={() => setOpen(false)}>
                    {f.close}
                  </Button>
                )}
                <Button type="submit" arrow>
                  {step < total - 1 ? (answers[question.id] === undefined ? f.skip : f.next) : f.show}
                </Button>
              </div>
            </form>
          ) : result.kind === 'none' ? (
            <div role="status">
              <h4 ref={headingRef} tabIndex={-1} className={styles.question}>
                {f.result.noneTitle}
              </h4>
              <p>{f.result.noneText}</p>
              <div className={styles.actions}>
                <Button type="button" variant="secondary" onClick={restart}>
                  {f.restart}
                </Button>
                <Button to={`${SHOP_PATHS.configure}?plan=custom`} arrow>
                  {f.result.describe}
                </Button>
              </div>
            </div>
          ) : (
            <div className={styles.result}>
              <h4 ref={headingRef} tabIndex={-1} className={styles.question}>
                {fill(f.result.suggest, { package: nameOf(result.primary.id) })}
              </h4>
              {result.also && <p className={styles.also}>{fill(f.result.also, { package: nameOf(result.also.id) })}</p>}

              <h5 className={styles.why}>{f.result.whyTitle}</h5>
              <ul className={styles.reasons}>
                <li>
                  {f.result.youNeed} {featureNames(result.asked)}.
                </li>
                <FitLine fit={result.primary} words={f.result} name={nameOf(result.primary.id)} lang={lang} />
                {result.limitedToImproving && <li>{f.result.existing}</li>}
              </ul>
              <p className={styles.rule}>{f.result.rule}</p>

              <h5 className={styles.why}>{f.result.fitTitle}</h5>
              <ul className={styles.fits}>
                {result.ranking.map((entry) => (
                  <li key={entry.id} data-primary={entry.id === result.primary.id || undefined}>
                    <span>{fill(f.result.fit, { package: nameOf(entry.id), percent: percent(entry.fit) })}</span>
                    <span className={styles.bar} aria-hidden="true">
                      <span style={{ width: `${percent(entry.fit)}%` }} />
                    </span>
                  </li>
                ))}
              </ul>

              <div className={styles.actions}>
                <Button
                  type="button"
                  arrow
                  onClick={() => {
                    onChoose(result.primary.id)
                  }}
                  aria-pressed={value === result.primary.id}
                >
                  {fill(f.result.choose, { package: nameOf(result.primary.id) })}
                </Button>
                <Button to={`${SHOP_PATHS.configure}?plan=${result.primary.id}`} variant="secondary">
                  {fill(f.result.start, { package: nameOf(result.primary.id) })}
                </Button>
                <Button type="button" variant="text" onClick={() => setShowResult(false)}>
                  {f.edit}
                </Button>
                <Button type="button" variant="text" onClick={restart}>
                  {f.restart}
                </Button>
              </div>
              <p role="status" className="visually-hidden">
                {value === result.primary.id ? fill(f.result.chosen, { package: nameOf(result.primary.id) }) : ''}
              </p>
            </div>
          )}
        </section>
      )}
    </div>
  )
}

/** What the suggested package gives of what was asked for, as the comparison says it (included, add-on, custom, not part). */
function FitLine({ fit, words, name, lang }: { fit: PackageFit; words: ReturnType<typeof useShopText>['finder']['result']; name: string; lang: 'hu' | 'en' | 'nl' }) {
  const list = (features: PackageFit['included']) => features.map((feature) => feature.name[lang]).join(', ')
  return (
    <>
      {fit.included.length > 0 && (
        <li>
          {fill(words.includes, { package: name })} {list(fit.included)}.
        </li>
      )}
      {fit.addon.length > 0 && (
        <li>
          {words.addon} {list(fit.addon)}.
        </li>
      )}
      {fit.custom.length > 0 && (
        <li>
          {words.custom} {list(fit.custom)}.
        </li>
      )}
      {fit.missing.length > 0 && (
        <li>
          {words.missing} {list(fit.missing)}.
        </li>
      )}
      {fit.missing.length === 0 && fit.addon.length === 0 && fit.custom.length === 0 && <li>{words.nothingMissing}</li>}
    </>
  )
}
