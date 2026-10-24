import type { ReactNode } from 'react'
import styles from './MainContent.module.scss'

/**
 * The page's <main> landmark and skip-link target. It adds no padding of its own: each page
 * owns its vertical rhythm, so a full-bleed Hero can run under the header.
 */
export function MainContent({ children }: { children: ReactNode }) {
  return (
    <main id="main" tabIndex={-1} className={styles.main}>
      {children}
    </main>
  )
}
