import { useCommonText } from '../../shop/hooks'
import styles from './ShopFallback.module.scss'

/**
 * What the shop's pages show while their code arrives: a slim moving bar and a name for it, in a
 * block as tall as a page so the footer does not jump up and down. Under reduced motion the bar
 * stands still (the durations collapse to nothing).
 */
export function ShopFallback() {
  const common = useCommonText()
  return (
    <div className={styles.fallback} role="status" aria-live="polite">
      <span className={styles.bar} aria-hidden="true" />
      <span className="visually-hidden">{common.loading}</span>
    </div>
  )
}
