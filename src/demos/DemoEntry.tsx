import { useId } from 'react'
import { Button } from '../components/Button/Button'
import { Container } from '../components/Container/Container'
import { Section } from '../components/Section/Section'
import { demoEntry } from '../content/demos/entry'
import { demoPath, type ProjectDemo } from './ids'
import styles from './DemoEntry.module.scss'
import { useDemoText } from './useDemoText'

/**
 * The entry to a project's demo, on the project's page: what it is, an honest line about what it runs on, and one way in. It is drawn only for a project
 * whose demo is switched on (a registered type that suits the project), between the hero and the numbered bands, so the bands keep their numbers.
 */
export function DemoEntry({ slug, demo }: { slug: string; demo: ProjectDemo }) {
  const id = useId()
  const text = useDemoText(demoEntry)
  const kind = text.kinds[demo.type]

  return (
    <Section tone="base" labelledBy={id} id="demo" className={styles.section}>
      <Container size="wide">
        <div className={styles.entry} data-demo-entry={demo.type}>
          <p className={styles.kicker}>
            <span aria-hidden="true" className={styles.dot} />
            {text.entry.kicker}
          </p>
          <h2 id={id} className={styles.title}>
            {text.entry.title}: {kind.name}
          </h2>
          <p className={styles.summary}>{kind.summary}</p>
          <p className={styles.note}>{text.entry.note}</p>
          <div className={styles.actions}>
            <Button to={demoPath(slug)} variant="primary" arrow>
              {text.entry.open}
              <span className="visually-hidden">: {kind.name}</span>
            </Button>
          </div>
        </div>
      </Container>
    </Section>
  )
}
