import { memo, useId, type ReactNode } from 'react'
import { Button } from '../components/Button/Button'
import { Container } from '../components/Container/Container'
import { Section } from '../components/Section/Section'
import type { Localized } from '../content/trilingual'
import type { playgroundText } from '../content/playground/text'
import type { Language } from '../i18n/config'
import styles from './Playground.module.scss'

/** The playground's words in the page's language. */
export type PlaygroundText = Localized<typeof playgroundText>

export interface LabProps {
  t: PlaygroundText
  lang: Language
  /** Says something to a screen reader (a polite status). */
  announce: (message: string) => void
}

interface LabSectionProps {
  id: string
  number: string
  title: string
  lead: string
  resetLabel: string
  onReset: () => void
  children: ReactNode
}

/**
 * One laboratory: its number, its title and sentence, a way to restore just this part, and the workbench under it (controls and the live preview). Every section
 * is a landmark named by its own heading, and its anchor stays clear of the sticky bars.
 */
export const LabSection = memo(function LabSection({ id, number, title, lead, resetLabel, onReset, children }: LabSectionProps) {
  const titleId = useId()
  return (
    <Section id={id} labelledBy={titleId} tone="base" className={styles.section}>
      <Container size="wide">
        <header className={styles.head}>
          <span className={styles.number} aria-hidden="true">
            {number}
          </span>
          <div className={styles.headText}>
            <h2 id={titleId} className={styles.title}>
              {title}
            </h2>
            <p className={styles.lead}>{lead}</p>
          </div>
          <Button variant="secondary" size="sm" onClick={onReset}>
            {resetLabel}
          </Button>
        </header>
        <div className={styles.bench}>{children}</div>
      </Container>
    </Section>
  )
})

/** The column of controls and the column of the live preview. */
export function Controls({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.controls} role="group" aria-label={label}>
      {children}
    </div>
  )
}

export function Preview({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.preview} role="group" aria-label={label}>
      {children}
    </div>
  )
}

/** A short line that names a state of the preview (its sizes, its frame, the contrast). */
export function Readout({ children }: { children: ReactNode }) {
  return <p className={styles.readout}>{children}</p>
}
