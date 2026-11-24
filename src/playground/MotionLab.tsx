import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type Dispatch, type ReactNode } from 'react'
import { Button } from '../components/Button/Button'
import { CheckboxField } from '../components/form/fields'
import { LabChoice, LabSlider, LabToggle } from '../components/lab/ui/LabControls'
import { ServiceCard } from '../components/ServiceCard/ServiceCard'
import { fill } from '../utils/format'
import { copyText } from './clipboard'
import { previewTokens, type Palette, type PreviewTheme } from './color'
import { EASINGS, MOTION_BOUNDS, isReduced, motionCss, motionVars, type EasingId, type MotionState } from './motion'
import { PreviewStage } from './PreviewStage'
import { Controls, LabSection, Preview, type LabProps, type PlaygroundText } from './parts'
import type { Action, ReplayId } from './state'
import styles from './MotionLab.module.scss'

interface Props extends LabProps {
  motion: MotionState
  replay: Record<ReplayId, number>
  palette: Palette
  theme: PreviewTheme
  /** The system asks for reduced motion (`prefers-reduced-motion: reduce`). */
  systemReduced: boolean
  dispatch: Dispatch<Action>
  onReset: () => void
}

interface ExampleProps {
  t: PlaygroundText
  /** A new number restarts the example. */
  replayKey: number
  reduced: boolean
}

/** A timer list that is emptied when the example goes away or restarts: nothing keeps running after the visitor has left. */
function useTimers() {
  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([])
  const clear = useCallback(() => {
    timers.current.forEach((timer) => clearTimeout(timer))
    timers.current = []
  }, [])
  const later = useCallback((run: () => void, delay: number) => {
    timers.current.push(setTimeout(run, delay))
  }, [])
  useEffect(() => clear, [clear])
  return { clear, later }
}

function Example({ id, title, text, replayLabel, onReplay, children }: { id: ReplayId; title: string; text: string; replayLabel: string; onReplay: (id: ReplayId, title: string) => void; children: ReactNode }) {
  const headingId = `pg-example-${id}`
  return (
    <article className={styles.example} aria-labelledby={headingId}>
      <header className={styles.exampleHead}>
        <div>
          <h3 id={headingId} className={styles.exampleTitle}>
            {title}
          </h3>
          <p className={styles.exampleText}>{text}</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => onReplay(id, title)} aria-label={`${replayLabel}: ${title}`}>
          {replayLabel}
        </Button>
      </header>
      <div className={styles.exampleBody}>{children}</div>
    </article>
  )
}

/** Hover and focus: the real button and a card follow the stage's duration and curve. "Replay" holds the hover state for a moment. */
function HoverExample({ t, replayKey }: ExampleProps) {
  // The example is mounted afresh by each replay (its key), so a replay simply starts with the hover state held, and a timer lets it go.
  const [hot, setHot] = useState(replayKey > 0)
  const { later } = useTimers()
  useEffect(() => {
    if (replayKey > 0) later(() => setHot(false), 1100)
  }, [replayKey, later])
  return (
    <div className={styles.hoverCard} data-hot={hot}>
      <p className={styles.hoverTitle}>{t.motion.examples.hover.card}</p>
      <Button variant="secondary" size="sm" arrow>
        {t.motion.examples.hover.button}
      </Button>
    </div>
  )
}

/** Button feedback: the real Button waits (loading), then shows its success or its error. Timers only, cleared when the example restarts or leaves. */
function ButtonExample({ t }: ExampleProps) {
  const [phase, setPhase] = useState<'idle' | 'sending' | 'done' | 'failed'>('idle')
  const { clear, later } = useTimers()
  const run = (outcome: 'done' | 'failed') => {
    clear()
    setPhase('sending')
    later(() => setPhase(outcome), 900)
    later(() => setPhase('idle'), 2800)
  }
  const copy = t.motion.examples.button
  return (
    <div className={styles.row}>
      <Button variant="primary" loading={phase === 'sending'} loadingLabel={copy.sending} status={phase === 'done' ? 'success' : undefined} onClick={() => run('done')}>
        {phase === 'done' ? copy.done : copy.success}
      </Button>
      <Button variant="secondary" loading={phase === 'sending'} loadingLabel={copy.sending} status={phase === 'failed' ? 'error' : undefined} onClick={() => run('failed')}>
        {phase === 'failed' ? copy.failed : copy.error}
      </Button>
    </div>
  )
}

/** Card entrance: three real cards arrive one after another, by the stage's duration, distance and stagger. */
function EntranceExample({ t }: ExampleProps) {
  return (
    <ul className={styles.cards}>
      {[0, 1, 2].map((index) => (
        <li key={index} className={styles.enter} style={{ '--i': index } as CSSProperties}>
          <ServiceCard name={fill(t.motion.examples.entrance.card, { number: index + 1 })} description={t.components.sample.serviceText} price={{ kind: 'quote' }} headingLevel={4} />
        </li>
      ))}
    </ul>
  )
}

/** Scroll-inspired reveal: items arrive as they scroll into a box of their own (one IntersectionObserver, disconnected on the way out). Nothing is hidden without it, or when motion is reduced. */
function RevealExample({ t, reduced }: ExampleProps) {
  const box = useRef<HTMLDivElement | null>(null)
  const [seen, setSeen] = useState<ReadonlySet<number>>(new Set())
  const observable = typeof IntersectionObserver !== 'undefined'

  useEffect(() => {
    const root = box.current
    if (!root || !observable) return
    const observer = new IntersectionObserver(
      (entries) => {
        const arrived = entries.filter((entry) => entry.isIntersecting).map((entry) => Number((entry.target as HTMLElement).dataset.index))
        if (arrived.length) setSeen((current) => new Set([...current, ...arrived]))
      },
      { root, threshold: 0.25 },
    )
    root.querySelectorAll('[data-index]').forEach((item) => observer.observe(item))
    return () => observer.disconnect()
  }, [observable])

  return (
    <div ref={box} className={styles.scroller} role="region" aria-label={t.motion.examples.reveal.region} tabIndex={0}>
      <ul className={styles.items}>
        {Array.from({ length: 7 }, (_, index) => (
          <li key={index} className={styles.item} data-index={index} data-state={!observable || reduced || seen.has(index) ? 'shown' : 'hidden'}>
            <span className={styles.itemNumber} aria-hidden="true">
              {String(index + 1).padStart(2, '0')}
            </span>
            {fill(t.motion.examples.reveal.item, { number: index + 1 })}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Micro-interactions: the real checkbox and the Lab's switch, feedback by the stage's own timings. */
function MicroExample({ t }: ExampleProps) {
  const [on, setOn] = useState(false)
  const [checked, setChecked] = useState(false)
  return (
    <div className={styles.micro}>
      <LabToggle label={t.motion.examples.micro.toggle} checked={on} onChange={setOn} />
      <CheckboxField label={t.motion.examples.micro.check} checked={checked} onChange={setChecked} />
    </div>
  )
}

/** A page transition concept: two sample screens replace each other the way the chosen transition says. */
function PageExample({ t, replayKey }: ExampleProps) {
  const [screen, setScreen] = useState(0)
  const [kind, setKind] = useState<'fade' | 'rise' | 'wipe'>('rise')
  const copy = t.motion.examples.page
  return (
    <div className={styles.page}>
      <LabChoice
        label={copy.kind}
        value={kind}
        options={(['fade', 'rise', 'wipe'] as const).map((value) => ({ value, label: copy.kinds[value] }))}
        columns={3}
        onChange={setKind}
      />
      <div className={styles.row}>
        <Button variant="secondary" size="sm" onClick={() => setScreen((value) => 1 - value)}>
          {copy.go}
        </Button>
      </div>
      <div className={styles.screens}>
        <div key={`${screen}-${replayKey}-${kind}`} className={styles.screen} data-kind={kind} data-screen={screen}>
          <strong>{screen === 0 ? copy.screenA : copy.screenB}</strong>
          <span className={styles.bars} aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </div>
      </div>
    </div>
  )
}

/**
 * The motion laboratory (PROMPT 36): examples of the website's own motion language (hover and focus, button feedback, a card's entrance, a scroll-inspired reveal,
 * micro-interactions and a page-transition concept) driven by four bounded parameters (duration, curve, distance, stagger) and by a reduced-motion switch. Every example
 * can be played again. Everything is played ONCE by what the visitor does: there is no loop. Under reduced motion (the system's or the switch's) every duration, distance and
 * delay is taken out, as the site's own tokens do.
 */
export const MotionLab = memo(function MotionLab({ motion, replay, palette, theme, systemReduced, dispatch, onReset, t, announce }: Props) {
  const reduced = isReduced(motion, systemReduced)
  const vars = useMemo(() => ({ ...previewTokens(palette, theme), ...motionVars(motion, systemReduced) }), [palette, theme, motion, systemReduced])
  const set = useCallback((patch: Partial<MotionState>) => dispatch({ type: 'motion/set', patch }), [dispatch])
  const onReplay = useCallback(
    (id: ReplayId, name: string) => {
      dispatch({ type: 'replay', id })
      announce(fill(t.common.announce.replayed, { name }))
    },
    [dispatch, announce, t],
  )
  const copy = useCallback(async () => {
    announce((await copyText(motionCss(motion))) ? fill(t.common.announce.copied, { value: 'CSS' }) : t.common.announce.copyFailed)
  }, [motion, announce, t])

  const examples = t.motion.examples
  const shared = { t, reduced }

  return (
    <LabSection id="motion" number="05" title={t.motion.title} lead={t.motion.lead} resetLabel={t.common.reset} onReset={onReset}>
      <Controls label={t.common.controls}>
        <LabSlider label={t.motion.duration} value={motion.duration} {...MOTION_BOUNDS.duration} format={(value) => `${value} ms`} onChange={(duration) => set({ duration })} />
        <LabChoice<EasingId> label={t.motion.easing} value={motion.easing} options={EASINGS.map((easing) => ({ value: easing.id, label: t.motion.easings[easing.id] }))} columns={3} onChange={(easing) => set({ easing })} />
        <LabSlider label={t.motion.distance} value={motion.distance} {...MOTION_BOUNDS.distance} format={(value) => `${value} px`} onChange={(distance) => set({ distance })} />
        <LabSlider label={t.motion.stagger} value={motion.stagger} {...MOTION_BOUNDS.stagger} format={(value) => `${value} ms`} onChange={(stagger) => set({ stagger })} />
        <LabToggle label={t.motion.simulate} checked={motion.simulateReduced} onChange={(simulateReduced) => set({ simulateReduced })} />
        <p className={styles.note}>{systemReduced ? t.motion.systemOn : t.motion.systemOff}</p>
        <Button variant="secondary" size="sm" onClick={copy}>
          {t.common.copyCss}
        </Button>
      </Controls>

      <Preview label={t.common.preview}>
        {reduced && <p className={styles.reduced}>{t.motion.reducedNote}</p>}
        <PreviewStage theme={theme} vars={vars} label={t.motion.title} className={styles.stage}>
          <div className={styles.examples}>
            <Example id="hover" title={examples.hover.title} text={examples.hover.text} replayLabel={t.common.replay} onReplay={onReplay}>
              <HoverExample key={replay.hover} {...shared} replayKey={replay.hover} />
            </Example>
            <Example id="button" title={examples.button.title} text={examples.button.text} replayLabel={t.common.replay} onReplay={onReplay}>
              <ButtonExample key={replay.button} {...shared} replayKey={replay.button} />
            </Example>
            <Example id="entrance" title={examples.entrance.title} text={examples.entrance.text} replayLabel={t.common.replay} onReplay={onReplay}>
              <EntranceExample key={replay.entrance} {...shared} replayKey={replay.entrance} />
            </Example>
            <Example id="reveal" title={examples.reveal.title} text={examples.reveal.text} replayLabel={t.common.replay} onReplay={onReplay}>
              <RevealExample key={replay.reveal} {...shared} replayKey={replay.reveal} />
            </Example>
            <Example id="micro" title={examples.micro.title} text={examples.micro.text} replayLabel={t.common.replay} onReplay={onReplay}>
              <MicroExample key={replay.micro} {...shared} replayKey={replay.micro} />
            </Example>
            <Example id="page" title={examples.page.title} text={examples.page.text} replayLabel={t.common.replay} onReplay={onReplay}>
              <PageExample {...shared} replayKey={replay.page} />
            </Example>
          </div>
        </PreviewStage>
      </Preview>
    </LabSection>
  )
})
