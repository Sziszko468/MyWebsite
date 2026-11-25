import { ProjectMockup } from '../components/home/ProjectMockup'
import { LabArt } from '../components/lab/ui/LabArt'
import { useI18n } from '../i18n/useI18n'
import type { ArchiveVisual } from './model'
import styles from './EntryVisual.module.scss'

/**
 * An entry's picture, from what already exists: the project's real screenshot, or the site's generated concept sketch (labelled, so it is never read as a screenshot), the
 * Lab's own still artwork for an experience, or the brand's five colours for the design tool. Only a real screenshot carries a description; the others are decoration.
 */
export function EntryVisual({ visual }: { visual: ArchiveVisual }) {
  const { t } = useI18n()
  switch (visual.type) {
    case 'image':
      return (
        <div className={styles.frame}>
          <img className={styles.image} src={visual.src} alt={visual.alt} width={visual.width} height={visual.height} loading="lazy" decoding="async" />
        </div>
      )
    case 'mockup':
      return (
        <div className={styles.frame}>
          <div className={styles.sketch} aria-hidden="true">
            <ProjectMockup kind={visual.kind} />
          </div>
          <p className={styles.caption}>{t.home.work.conceptSketch}</p>
        </div>
      )
    case 'lab':
      return (
        <div className={styles.frame} aria-hidden="true">
          <LabArt id={visual.id} />
        </div>
      )
    case 'tool':
      return (
        <div className={styles.frame} aria-hidden="true">
          <div className={styles.swatches}>
            <i />
            <i />
            <i />
            <i />
            <i />
          </div>
        </div>
      )
  }
}
