import { useParams } from 'react-router'
import { Container } from '../components/Container/Container'
import { LocalizedLink } from '../components/LocalizedLink/LocalizedLink'
import { demoText } from '../content/demos/shell'
import { useI18n } from '../i18n/useI18n'
import { NotFoundPage } from '../pages/NotFoundPage'
import { useProjectDetail } from '../projects/store'
import { isAvailable } from '../projects/types'
import { DemoShell } from './DemoShell'
import styles from './DemoShell.module.scss'
import { useDemoText } from './useDemoText'

/** A project that has no demo (switched off, or none that suits it): said plainly, with the way back. */
function NoDemo({ slug, name }: { slug: string; name: string }) {
  const text = useDemoText(demoText)
  return (
    <Container size="wide">
      <div className={styles.frame}>
        <div className={styles.state} role="status">
          <h1 className={styles.heading}>{text.states.missingTitle}</h1>
          <p>{text.states.missingText}</p>
          <LocalizedLink to={`/work/${slug}`} className={styles.back}>
            <span aria-hidden="true">←</span> {text.frame.back}
            <span className="visually-hidden">: {name}</span>
          </LocalizedLink>
        </div>
      </div>
    </Container>
  )
}

/**
 * The route `/work/<slug>/demo`. The project decides everything: the data asks for its record (the backend's, or the website's own when no backend answers),
 * and the demo that opens is the one that record names, if it is a registered type that suits the project. An address for a project with no page, no such
 * project, a preview, or a language the project has no words in is "not found"; a project that exists but has no demo says so.
 */
export function DemoRoute() {
  const { slug = '' } = useParams()
  const { lang } = useI18n()
  const state = useProjectDetail(slug)

  if (state.status === 'loading') return <div style={{ minHeight: '100svh' }} aria-hidden="true" />
  if (state.status !== 'ready') return <NotFoundPage />
  const { record } = state
  if (record.preview || record.card.detailPath === null || !isAvailable(record.card, lang)) return <NotFoundPage />
  const name = record.card.name[lang]
  const demo = record.detail.demo ?? null
  if (!demo) return <NoDemo slug={slug} name={name} />

  return (
    <Container size="wide">
      <DemoShell type={demo.type} slug={slug} projectName={name} instructions={demo.instructions} />
    </Container>
  )
}
