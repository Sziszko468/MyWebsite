import { useI18n } from '../../i18n/useI18n'
import { useTheme } from '../../theme/useTheme'
import styles from './ThemeToggle.module.scss'

function MoonIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path d="M13.5 9.6A5.5 5.5 0 0 1 6.4 2.5a5.5 5.5 0 1 0 7.1 7.1Z" fill="currentColor" />
    </svg>
  )
}

function SunIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <circle cx="8" cy="8" r="3" fill="currentColor" />
      <path
        d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.4 1.4M11.55 11.55l1.4 1.4M3.05 12.95l1.4-1.4M11.55 4.45l1.4-1.4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** A switch whose "on" state is dark mode; the state is announced via aria-checked. */
export function ThemeToggle() {
  const { t } = useI18n()
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={t.theme.darkMode}
      className={styles.toggle}
      onClick={toggleTheme}
    >
      <span className={styles.track}>
        <span className={styles.thumb}>{isDark ? <MoonIcon /> : <SunIcon />}</span>
      </span>
    </button>
  )
}
