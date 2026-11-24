import { useCallback, useEffect, useId, useMemo, useReducer, useState } from 'react'
import { Button } from '../components/Button/Button'
import { Container } from '../components/Container/Container'
import { useReducedMotion } from '../components/hero/capabilities'
import { useLocalized } from '../components/lab/core/useLabText'
import { LabChoice } from '../components/lab/ui/LabControls'
import { LocalizedLink } from '../components/LocalizedLink/LocalizedLink'
import { PageHero, HeroLine } from '../components/PageHero/PageHero'
import { playgroundText } from '../content/playground/text'
import { useI18n } from '../i18n/useI18n'
import { ColorLab } from '../playground/ColorLab'
import { ComponentLab } from '../playground/ComponentLab'
import { LayoutLab } from '../playground/LayoutLab'
import { MotionLab } from '../playground/MotionLab'
import { TypeLab } from '../playground/TypeLab'
import type { PreviewTheme } from '../playground/color'
import styles from '../playground/Playground.module.scss'
import { initialState, isChanged, reducer, type ResetScope } from '../playground/state'
import { useTheme } from '../theme/useTheme'
import { fill } from '../utils/format'

const SECTIONS = ['color', 'type', 'components', 'layout', 'motion'] as const
type SectionId = (typeof SECTIONS)[number]

/**
 * Which section is under the top of the window, for the bar's marker. One IntersectionObserver, disconnected when the page goes. Without it nothing is marked.
 */
function useActiveSection(): SectionId | null {
  const [active, setActive] = useState<SectionId | null>(null)
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const visible = new Map<string, number>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.set(entry.target.id, entry.boundingClientRect.top)
          else visible.delete(entry.target.id)
        }
        const first = SECTIONS.find((id) => visible.has(id))
        if (first) setActive(first)
      },
      { rootMargin: '-25% 0px -60% 0px' },
    )
    for (const id of SECTIONS) {
      const element = document.getElementById(id)
      if (element) observer.observe(element)
    }
    return () => observer.disconnect()
  }, [])
  return active
}

/**
 * The Design System Playground (PROMPT 36), at /lab/design-system: a tool in the Lab, not a seventh experience. One reducer holds every change a visitor makes; it lives in
 * this component and nowhere else (no storage, no request, no write to the site's theme or tokens), and it is gone when the page is. The five laboratories read their own
 * slice, so a change in one does not draw the others.
 */
export function DesignPlaygroundPage() {
  const t = useLocalized(playgroundText)
  const { lang } = useI18n()
  // Read only: the site's theme is the previews' starting point, and the page never writes it.
  const { theme: siteTheme } = useTheme()
  const [state, dispatch] = useReducer(reducer, siteTheme, initialState)
  const systemReduced = useReducedMotion()
  const [message, setMessage] = useState('')
  const active = useActiveSection()
  const navId = useId()
  const limitsId = useId()

  // The same words twice in a row would not be read again: a zero-width space makes each message new.
  const announce = useCallback((next: string) => setMessage((current) => (current === next ? `${next}​` : next)), [])

  const reset = useCallback(
    (scope: ResetScope) => {
      dispatch({ type: 'reset', scope, siteTheme })
      announce(scope === 'all' ? t.common.announce.resetAll : fill(t.common.announce.resetSection, { section: t.bar.sections[scope] }))
    },
    [siteTheme, announce, t],
  )
  const resetAll = useCallback(() => reset('all'), [reset])
  const resetColor = useCallback(() => reset('color'), [reset])
  const resetType = useCallback(() => reset('type'), [reset])
  const resetComponents = useCallback(() => reset('components'), [reset])
  const resetLayout = useCallback(() => reset('layout'), [reset])
  const resetMotion = useCallback(() => reset('motion'), [reset])

  const changed = useMemo(() => isChanged(state, siteTheme), [state, siteTheme])
  const shared = { t, lang, announce }

  return (
    <div className={styles.page} data-playground="">
      <PageHero
        compact
        eyebrow={t.hero.eyebrow}
        title={
          <>
            <HeroLine>{t.hero.titleA}</HeroLine>
            <HeroLine accent>{t.hero.titleB}</HeroLine>
          </>
        }
        lead={t.hero.lead}
        actions={
          <LocalizedLink to="/lab" className={styles.back}>
            <span aria-hidden="true">←</span>
            {t.hero.back}
          </LocalizedLink>
        }
        seed={36}
      >
        <ul className={styles.facts} aria-label={t.hero.facts.label}>
          <li>{t.hero.facts.temporary}</li>
          <li>{t.hero.facts.isolated}</li>
          <li>{t.hero.facts.real}</li>
        </ul>
      </PageHero>

      <div className={styles.bar}>
        <Container size="wide" className={styles.barInner}>
          <nav aria-label={t.bar.navLabel} id={navId}>
            <ul className={styles.tabs}>
              {SECTIONS.map((id) => (
                <li key={id}>
                  <a className={styles.tab} href={`#${id}`} aria-current={active === id ? 'location' : undefined}>
                    {t.bar.sections[id]}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <LabChoice<PreviewTheme>
            className={styles.themeSwitch}
            label={t.bar.theme.label}
            value={state.theme}
            options={[
              { value: 'dark', label: t.bar.theme.dark },
              { value: 'light', label: t.bar.theme.light },
            ]}
            columns={2}
            onChange={(theme) => {
              dispatch({ type: 'theme', theme })
              announce(fill(t.common.announce.theme, { theme: theme === 'dark' ? t.bar.theme.dark : t.bar.theme.light }))
            }}
          />
          <div className={styles.barActions}>
            <p className={styles.state} data-changed={changed}>
              {changed ? t.bar.changed : t.bar.untouched}
            </p>
            <Button variant="secondary" size="sm" onClick={resetAll}>
              {t.bar.resetAll}
            </Button>
          </div>
        </Container>
      </div>

      <ColorLab {...shared} color={state.color} theme={state.theme} dispatch={dispatch} onReset={resetColor} />
      <TypeLab {...shared} type={state.type} dispatch={dispatch} onReset={resetType} />
      <ComponentLab {...shared} components={state.components} resetKey={state.replay.components} palette={state.color.palette} theme={state.theme} dispatch={dispatch} onReset={resetComponents} />
      <LayoutLab {...shared} layout={state.layout} palette={state.color.palette} theme={state.theme} dispatch={dispatch} onReset={resetLayout} />
      <MotionLab {...shared} motion={state.motion} replay={state.replay} palette={state.color.palette} theme={state.theme} systemReduced={systemReduced} dispatch={dispatch} onReset={resetMotion} />

      <section className={styles.limits} aria-labelledby={limitsId}>
        <Container size="wide">
          <h2 id={limitsId} className={styles.title}>
            {t.limits.title}
          </h2>
          <ul>
            {t.limits.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p>
            <LocalizedLink to="/lab" className={styles.back}>
              <span aria-hidden="true">←</span>
              {t.hero.back}
            </LocalizedLink>
          </p>
        </Container>
      </section>

      <p className="visually-hidden" role="status" aria-live="polite">
        {message}
      </p>
    </div>
  )
}

export default DesignPlaygroundPage
