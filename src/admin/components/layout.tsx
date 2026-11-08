import { useId, type KeyboardEvent, type ReactNode } from 'react'
import { Link } from 'react-router'
import { cx } from '../../utils/cx'
import { useText } from '../i18n'
import page from '../styles/pages.module.scss'
import styles from '../styles/ui.module.scss'
import { Icon } from './Icon'

/** The page's title block: where it is, what it is for, and the actions that belong to the whole page. */
export function PageHeader({ title, lead, actions, back }: { title: string; lead?: ReactNode; actions?: ReactNode; back?: { to: string; label: string } }) {
  return (
    <header className={page.pageHeader}>
      {back && (
        <Link className={page.back} to={back.to}>
          <Icon name="left" />
          {back.label}
        </Link>
      )}
      <div className={styles.spread}>
        <div className={page.pageTitleBlock}>
          <h1 className={page.pageTitle} tabIndex={-1} id="page-title">
            {title}
          </h1>
          {lead && <p className={cx(styles.muted, page.lead)}>{lead}</p>}
        </div>
        {actions && <div className={styles.row}>{actions}</div>}
      </div>
    </header>
  )
}

/** A titled surface for one part of a detail screen. */
export function DetailPanel({ title, children, className, actions }: { title?: string; children: ReactNode; className?: string; actions?: ReactNode }) {
  const id = useId()
  return (
    <section className={cx(styles.card, className)} aria-labelledby={title ? id : undefined}>
      {(title || actions) && (
        <div className={cx(styles.spread, page.panelHead)}>
          {title && (
            <h2 id={id} className={styles.cardTitleTight}>
              {title}
            </h2>
          )}
          {actions}
        </div>
      )}
      {children}
    </section>
  )
}

/** One of the numbers on the dashboard; a link when there is a list behind it. */
export function DashboardStatCard({ label, value, note, to, tone, compact }: { label: string; value: string; note?: string; to?: string; tone?: 'accent' | 'info' | 'warning' | 'success'; compact?: boolean }) {
  const body = (
    <>
      <span className={page.statLabel}>{label}</span>
      <span className={cx(page.statValue, compact && page.statValueCompact, tone && page[`tone_${tone}`])}>{value}</span>
      {note && <span className={page.statNote}>{note}</span>}
    </>
  )
  return to ? (
    <Link to={to} className={cx(page.stat, page.statLink)}>
      {body}
    </Link>
  ) : (
    <div className={page.stat}>{body}</div>
  )
}

export interface TabItem {
  id: string
  label: string
  /** A small marker on the tab (something on it needs attention). */
  attention?: boolean
  attentionLabel?: string
}

/**
 * Tabs that switch what is shown in place. One tab is in the tab order at a time; the arrow keys, Home and End move
 * between them (the pattern a screen-reader user expects from `role="tablist"`), and each tab names its panel.
 */
export function Tabs({ tabs, value, onChange, label, idBase }: { tabs: readonly TabItem[]; value: string; onChange: (id: string) => void; label: string; idBase: string }) {
  const move = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = tabs.findIndex((tab) => tab.id === value)
    let next = index
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length
    else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = tabs.length - 1
    else return
    event.preventDefault()
    onChange(tabs[next].id)
    requestAnimationFrame(() => document.getElementById(`${idBase}-tab-${tabs[next].id}`)?.focus())
  }
  return (
    <div className={styles.tabs} role="tablist" aria-label={label} onKeyDown={move}>
      {tabs.map((tab) => (
        <button key={tab.id} type="button" role="tab" id={`${idBase}-tab-${tab.id}`} className={styles.tab} aria-selected={tab.id === value} aria-controls={`${idBase}-panel-${tab.id}`} tabIndex={tab.id === value ? 0 : -1} onClick={() => onChange(tab.id)}>
          {tab.label}
          {tab.attention && (
            <>
              <span className={styles.tabDot} aria-hidden="true" />
              {tab.attentionLabel && <span className={styles.srOnly}>{tab.attentionLabel}</span>}
            </>
          )}
        </button>
      ))}
    </div>
  )
}

export function TabPanel({ id, idBase, active, children }: { id: string; idBase: string; active: boolean; children: ReactNode }) {
  return (
    <div role="tabpanel" id={`${idBase}-panel-${id}`} aria-labelledby={`${idBase}-tab-${id}`} hidden={!active}>
      {active ? children : null}
    </div>
  )
}

/** A short line telling what a language or group means in the surrounding text; kept here so the screens say it the same way. */
export function useLanguageName(): (code: string) => string {
  const t = useText()
  return (code) => (t.languages as Record<string, string>)[code] ?? code
}
