import type { MouseEventHandler } from 'react'
import { getMonogram, siteConfig } from '../../config/site'
import { useI18n } from '../../i18n/useI18n'
import { cx } from '../../utils/cx'
import { LocalizedLink } from '../LocalizedLink/LocalizedLink'
import styles from './BrandMark.module.scss'

interface BrandMarkProps {
  onNavigate?: MouseEventHandler<HTMLAnchorElement>
  /** Hide the written name on mid-width screens, where the inline navigation needs the room. */
  collapseName?: boolean
}

/** Monogram plus brand name, linking home. Name and monogram come from src/config/site.ts. */
export function BrandMark({ onNavigate, collapseName = false }: BrandMarkProps) {
  const { t } = useI18n()

  return (
    <LocalizedLink
      to="/"
      className={cx(styles.brand, collapseName && styles.collapseName)}
      aria-label={`${siteConfig.brandName} — ${t.nav.home}`}
      onClick={onNavigate}
    >
      <span className={styles.monogram} aria-hidden="true">
        {getMonogram()}
      </span>
      <span className={styles.name}>{siteConfig.brandName}</span>
    </LocalizedLink>
  )
}
