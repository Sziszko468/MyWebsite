import { Container } from '../components/Container/Container'
import { LocalizedLink } from '../components/LocalizedLink/LocalizedLink'
import { useLocalized } from '../components/lab/core/useLabText'
import { archiveText } from '../content/archive/text'
import styles from './SystemBar.module.scss'

const STOPS = [
  { id: 'command', to: '/command-center' },
  { id: 'archive', to: '/archive' },
  { id: 'work', to: '/work' },
  { id: 'lab', to: '/lab' },
] as const

/**
 * The way between the four places of the system (PROMPT 37): the Command Center, the archive, the work and the Lab, with the current one marked. It is a second, local
 * navigation of the two new pages; the site's own header is unchanged.
 */
export function SystemBar({ current }: { current: 'command' | 'archive' }) {
  const t = useLocalized(archiveText)
  return (
    <nav className={styles.bar} aria-label={t.system.label}>
      <Container size="wide">
        <ol className={styles.list}>
          {STOPS.map((stop, index) => (
            <li key={stop.id}>
              <LocalizedLink to={stop.to} className={styles.stop} aria-current={stop.id === current ? 'page' : undefined}>
                <span className={styles.number} aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>
                {t.system[stop.id]}
              </LocalizedLink>
            </li>
          ))}
        </ol>
      </Container>
    </nav>
  )
}
