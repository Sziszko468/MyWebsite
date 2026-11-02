import { projects, type ProjectId } from '../../content/projects'
import { useI18n } from '../../i18n/useI18n'
import { Badge } from '../Badge/Badge'
import { LocalizedLink } from '../LocalizedLink/LocalizedLink'
import styles from './ProjectRef.module.scss'

/**
 * A portfolio project as a compact reference card: its name, its honest status, a sentence from
 * the home page's own words, the technologies, and the way to its page. `note` adds what is
 * relevant to the service being looked at. Nothing here is a screenshot or a figure; the details
 * page is where the evidence is.
 */
export function ProjectRef({ projectId, note, noteLabel, linkLabel }: { projectId: ProjectId; note?: string; noteLabel?: string; linkLabel?: string }) {
  const { t } = useI18n()
  const project = projects.find((candidate) => candidate.id === projectId)
  if (!project) return null
  const copy = t.home.work.items[project.id]

  return (
    <article className={styles.card}>
      <div className={styles.top}>
        <h3 className={styles.name}>
          {project.detailPath ? (
            <LocalizedLink to={project.detailPath} className={styles.link}>
              {project.name}
            </LocalizedLink>
          ) : (
            project.name
          )}
        </h3>
        <Badge status={project.status} />
      </div>
      <p className={styles.category}>{copy.category}</p>
      <p className={styles.description}>{copy.description}</p>
      {note && (
        <p className={styles.note}>
          {noteLabel && <span className={styles.noteLabel}>{noteLabel}</span>}
          {note}
        </p>
      )}
      {project.tags.length > 0 && (
        <ul className={styles.tags}>
          {project.tags.slice(0, 5).map((tag) => (
            <li key={tag}>{tag}</li>
          ))}
        </ul>
      )}
      {project.detailPath && linkLabel && (
        <p className={styles.cue} aria-hidden="true">
          {linkLabel} →
        </p>
      )}
    </article>
  )
}
