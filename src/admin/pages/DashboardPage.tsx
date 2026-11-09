import { Link } from 'react-router'
import { dashboard as loadDashboard } from '../api/endpoints'
import type { DashboardData } from '../api/types'
import { describeActivity } from '../components/ActivityTimeline'
import { AdminButton } from '../components/AdminButton'
import { DashboardStatCard, DetailPanel, PageHeader } from '../components/layout'
import { EmptyState, ErrorState, LoadingState } from '../components/states'
import { StatusBadge } from '../components/StatusBadge'
import { useResource } from '../hooks/useResource'
import { fill, formatDateTime, formatNumber, useInterfaceLanguage, useText } from '../i18n'
import { useItemsSummary } from '../components/QuoteRequestList'
import page from '../styles/pages.module.scss'
import styles from '../styles/ui.module.scss'

/** The links from a recent activity line to the record it is about, when there is one to open. */
function activityTarget(entityType: string, entityId: string | null): string | null {
  if (!entityId) return null
  if (entityType === 'inquiry') return `/inquiries/${entityId}`
  if (entityType === 'quote_request') return `/quotes/${entityId}`
  return null
}

const EDIT_PATH: Record<DashboardData['recentlyEdited'][number]['kind'], (key: string) => string> = {
  service: (key) => `/services/service/${key}`,
  package: (key) => `/services/package/${key}`,
  extra: (key) => `/services/extra/${key}`,
  faq: (key) => `/content/faq/${key}`,
}

/**
 * The overview. Four states: loading (a placeholder), failed (with the way to try again), empty (a sentence per part that
 * has nothing in it: no invented activity), and loaded. Every number was counted by the server when the page opened.
 */
export function DashboardPage() {
  const t = useText()
  const language = useInterfaceLanguage()
  const summary = useItemsSummary()
  const resource = useResource((signal) => loadDashboard(signal).then((answer) => answer.data), [])
  const data = resource.data

  return (
    <>
      <PageHeader title={t.dashboard.title} lead={t.dashboard.lead} />
      {resource.loading ? (
        <LoadingState />
      ) : resource.error || !data ? (
        <ErrorState error={resource.error} onRetry={resource.reload} />
      ) : (
        <div className={styles.stackLg}>
          <section aria-label={t.dashboard.title} className={page.stats}>
            <DashboardStatCard label={t.dashboard.stats.inquiries} value={formatNumber(data.inquiries.total, language)} note={fill(t.dashboard.stats.inquiriesNote, { archived: data.inquiries.archived })} to="/inquiries" />
            <DashboardStatCard label={t.dashboard.stats.newInquiries} value={formatNumber(data.inquiries.new, language)} note={fill(t.dashboard.stats.newInquiriesNote, { count: data.inquiries.last7Days })} to="/inquiries?status=new" tone="accent" />
            <DashboardStatCard label={t.dashboard.stats.inProgress} value={formatNumber(data.inquiries.inProgress, language)} note={fill(t.dashboard.stats.inProgressNote, { waiting: data.inquiries.waitingClient })} to="/inquiries?status=in_progress" tone="info" />
            <DashboardStatCard label={t.dashboard.stats.pendingQuotes} value={formatNumber(data.quotes.pending, language)} note={fill(t.dashboard.stats.pendingQuotesNote, { quoted: data.quotes.quoteSent, total: data.quotes.total })} to="/quotes?status=new" tone="warning" />
            <DashboardStatCard label={t.dashboard.stats.completed} value={formatNumber(data.completedRequests, language)} note={fill(t.dashboard.stats.completedNote, { inquiries: data.inquiries.completed, quotes: data.quotes.completed })} tone="success" />
          </section>

          <div className={page.dashGrid}>
            <div className={styles.stackLg}>
              <DetailPanel title={t.dashboard.recentInquiries} actions={data.recentInquiries.length > 0 ? <Link to="/inquiries">{t.dashboard.viewAll}</Link> : undefined}>
                {data.recentInquiries.length === 0 ? (
                  <EmptyState title={t.dashboard.empty.inquiriesTitle}>{t.dashboard.empty.inquiriesBody}</EmptyState>
                ) : (
                  <ul className={page.miniList}>
                    {data.recentInquiries.map((row) => (
                      <li key={row.id}>
                        <span className={page.miniTop}>
                          <Link to={`/inquiries/${row.id}`}>{row.subject}</Link>
                          <StatusBadge kind="inquiry" status={row.status} />
                        </span>
                        <span className={styles.muted}>
                          {row.name} · {formatDateTime(row.created_at, language)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </DetailPanel>

              <DetailPanel title={t.dashboard.recentQuotes} actions={data.recentQuotes.length > 0 ? <Link to="/quotes">{t.dashboard.viewAll}</Link> : undefined}>
                {data.recentQuotes.length === 0 ? (
                  <EmptyState icon="quote" title={t.dashboard.empty.quotesTitle}>
                    {t.dashboard.empty.quotesBody}
                  </EmptyState>
                ) : (
                  <ul className={page.miniList}>
                    {data.recentQuotes.map((row) => (
                      <li key={row.id}>
                        <span className={page.miniTop}>
                          <Link to={`/quotes/${row.id}`}>{row.name}</Link>
                          <StatusBadge kind="quote" status={row.status} />
                        </span>
                        <span className={styles.muted}>
                          {summary(row.items) || row.reference} · {formatDateTime(row.created_at, language)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </DetailPanel>
            </div>

            <div className={styles.stackLg}>
              <DetailPanel title={t.dashboard.quickActions}>
                <div className={page.quick}>
                  <AdminButton to="/inquiries?status=new" variant="secondary" className={page.wide}>
                    {t.dashboard.quick.newInquiries}
                  </AdminButton>
                  <AdminButton to="/quotes?status=new" variant="secondary" className={page.wide}>
                    {t.dashboard.quick.pendingQuotes}
                  </AdminButton>
                  <AdminButton to="/services/new/service" variant="secondary" className={page.wide}>
                    {t.dashboard.quick.newService}
                  </AdminButton>
                  <AdminButton to="/content" variant="secondary" className={page.wide}>
                    {t.dashboard.quick.editContent}
                  </AdminButton>
                </div>
              </DetailPanel>

              <DetailPanel title={t.dashboard.email.title} actions={<Link to="/notifications">{t.dashboard.email.manage}</Link>}>
                <p className={styles.small}>{data.email.enabled ? fill(t.dashboard.email.on, { accepted: data.email.accepted, pending: data.email.pending, failed: data.email.failed }) : t.dashboard.email.off}</p>
              </DetailPanel>

              <DetailPanel title={t.dashboard.recentEdits}>
                {data.recentlyEdited.length === 0 ? (
                  <EmptyState icon="edit" title={t.dashboard.empty.editsTitle}>
                    {t.dashboard.empty.editsBody}
                  </EmptyState>
                ) : (
                  <ul className={page.miniList}>
                    {data.recentlyEdited.map((item) => (
                      <li key={`${item.kind}-${item.key}`}>
                        <span className={page.miniTop}>
                          <Link to={EDIT_PATH[item.kind](item.key)}>{item.title}</Link>
                          <StatusBadge kind="availability" status={item.status} />
                        </span>
                        <span className={styles.muted}>
                          {(t.dashboard.editedKinds as Record<string, string>)[item.kind]} · {formatDateTime(item.updatedAt, language)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </DetailPanel>

              <DetailPanel title={t.dashboard.activity}>
                {data.activity.length === 0 ? (
                  <EmptyState icon="info" title={t.dashboard.empty.activityTitle}>
                    {t.dashboard.empty.activityBody}
                  </EmptyState>
                ) : (
                  <ul className={page.miniList}>
                    {data.activity.map((event, index) => {
                      const target = activityTarget(event.entityType, event.entityId)
                      const text = describeActivity(t, event)
                      return (
                        <li key={`${event.at}-${index}`}>
                          <span>
                            {target ? <Link to={target}>{event.label ?? text}</Link> : event.label}
                            {event.label ? ' · ' : ''}
                            {text}
                          </span>
                          <span className={styles.muted}>
                            {formatDateTime(event.at, language)}
                            {event.actor ? ` · ${event.actor}` : ''}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </DetailPanel>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
