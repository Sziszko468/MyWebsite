import { useId } from 'react'
import { playgroundEntry } from '../../../content/playground/entry'
import { Button } from '../../Button/Button'
import { Container } from '../../Container/Container'
import { Reveal } from '../../motion/Reveal'
import { Section } from '../../Section/Section'
import { useLocalized } from '../core/useLabText'
import styles from './DesignToolBand.module.scss'

/**
 * A band of its own after the six experiences (PROMPT 36): the Design System Playground is a TOOL of the Lab, not a seventh experience, so it is not in the gallery, not
 * numbered with them and not counted with them. It is one sentence and one way in.
 */
export function DesignToolBand() {
  const t = useLocalized(playgroundEntry)
  const titleId = useId()
  return (
    <Section id="design-system" tone="base" labelledBy={titleId} className={styles.section}>
      <Container size="wide">
        <Reveal>
          <div className={styles.band} data-design-tool="">
            <p className={styles.kicker}>{t.kicker}</p>
            <h2 id={titleId} className={styles.title}>
              {t.title}
            </h2>
            <p className={styles.text}>{t.text}</p>
            <div className={styles.actions}>
              <Button to="/lab/design-system" variant="secondary" arrow>
                {t.open}
              </Button>
            </div>
          </div>
        </Reveal>
      </Container>
    </Section>
  )
}
