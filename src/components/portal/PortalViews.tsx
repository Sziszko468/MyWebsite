import { useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router'
import { instantDay, instantMoment, instantRange, zoneName } from '../../booking/dates'
import { consultationText } from '../../content/consultation'
import { quoteText } from '../../content/quotes'
import { localize } from '../../content/trilingual'
import { localizedPath } from '../../i18n/paths'
import { useI18n } from '../../i18n/useI18n'
import {
  fetchBooking,
  fetchBookings,
  fetchDocuments,
  fetchOverview,
  fetchProject,
  fetchProjects,
  fetchRequest,
  fetchRequests,
  openBooking,
  openRequest,
  type ProjectSummary,
} from '../../portal/api'
import { failureText, usePortalText } from '../../portal/text'
import { useLoad, useSessionData } from '../../portal/usePortal'
import { fill, formatDay, formatMoment } from '../../utils/format'
import { Button } from '../Button/Button'
import { LocalizedLink } from '../LocalizedLink/LocalizedLink'
import styles from './Portal.module.scss'
import { Load, PageHeader, Progress, StatusBadge } from './ui'
import work from './Work.module.scss'
import { eventText } from './eventText'
import { ProjectWork } from './WorkViews'

/** What the customer reads: overview, projects, quote requests, bookings, documents. Every number and every line is a record the server returned for THIS customer. */

function useWords() {
  const { lang } = useI18n()
  const words = usePortalText()
  const quotes = localize(quoteText, lang)
  const booking = localize(consultationText, lang)
  return { lang, words, quotes, booking }
}

function Notice() {
  const { state } = useLocation() as { state: { notice?: string | null } | null }
  const words = usePortalText()
  const notice = state?.notice
  if (!notice) return null
  return (
    <p className={styles.notice} role="status">
      {notice === 'email' ? words.verify.doneEmail : words.verify.doneCreated}
    </p>
  )
}

function ProjectCard({ project }: { project: ProjectSummary }) {
  const { lang, words } = useWords()
  return (
    <li className={styles.card} data-attention={project.status === 'waiting_customer'}>
      <div className={styles.cardHead}>
        <h2 className={styles.cardTitle}>
          <LocalizedLink to={`/client-portal/projects/${project.reference}`} className={styles.cardLink}>
            {project.name}
          </LocalizedLink>
        </h2>
        <StatusBadge status={project.status} label={words.status[project.status]} />
      </div>
      <dl className={styles.facts}>
        <div>
          <dt>{words.projects.reference}</dt>
          <dd className={styles.code}>{project.reference}</dd>
        </div>
        <div>
          <dt>{words.projects.category}</dt>
          <dd>{words.categories[project.category]}</dd>
        </div>
        <div>
          <dt>{words.projects.started}</dt>
          <dd>{project.startedOn ? formatDay(project.startedOn, lang) : words.common.notSet}</dd>
        </div>
        <div>
          <dt>{words.projects.expected}</dt>
          <dd>{project.expectedOn ? formatDay(project.expectedOn, lang) : words.common.notSet}</dd>
        </div>
        <div>
          <dt>{words.projects.updated}</dt>
          <dd>{formatMoment(project.updatedAt, lang)}</dd>
        </div>
        <div>
          <dt>{words.projects.next}</dt>
          <dd>{project.nextMilestone ? <>{project.nextMilestone.title}{project.nextMilestone.dueOn ? ` · ${formatDay(project.nextMilestone.dueOn, lang)}` : ''}</> : words.projects.noNext}</dd>
        </div>
      </dl>
      {project.milestones && <Progress done={project.milestones.done} total={project.milestones.total} label={fill(words.projects.milestonesDone, project.milestones)} />}
      {project.progress.percent !== null && <p className={styles.progressText}>{fill(words.work.progress.percent, { percent: project.progress.percent })}</p>}
    </li>
  )
}

// ---- overview ------------------------------------------------------------------------------------------------------------------------

export function OverviewView() {
  const { lang, words } = useWords()
  const { customer, features } = useSessionData()
  const { state, reload } = useLoad(fetchOverview, 'overview')
  return (
    <>
      <PageHeader
        eyebrow={words.signIn.eyebrow}
        title={customer.name ? fill(words.overview.hello, { name: customer.name }) : words.overview.helloNoName}
        lead={words.overview.lead}
        focusKey="overview"
      />
      <Notice />
      <Load state={state} onRetry={reload}>
        {(data) => {
          const empty = data.counts.active + data.counts.completed + data.counts.awaitingYou === 0 && data.activity.length === 0
          return (
            <>
              <section aria-label={words.overview.counts.label}>
                <ul className={styles.stats}>
                  <li>
                    <span className={styles.statNumber}>{data.counts.active}</span>
                    <span className={styles.statLabel}>{words.overview.counts.active}</span>
                  </li>
                  <li data-attention={data.counts.awaitingYou > 0}>
                    <span className={styles.statNumber}>{data.counts.awaitingYou}</span>
                    <span className={styles.statLabel}>{words.overview.counts.awaiting}</span>
                  </li>
                  <li>
                    <span className={styles.statNumber}>{data.counts.completed}</span>
                    <span className={styles.statLabel}>{words.overview.counts.completed}</span>
                  </li>
                </ul>
              </section>

              {empty && (
                <section className={styles.empty} aria-labelledby="empty-title">
                  <h2 id="empty-title" className={styles.sectionTitle}>
                    {words.overview.emptyTitle}
                  </h2>
                  <p>{words.overview.emptyBody}</p>
                  <p className={styles.muted}>{words.overview.emptyHelp}</p>
                  <div className={styles.row}>
                    <Button to="/contact" variant="secondary">
                      {words.common.contact}
                    </Button>
                    {features.selfLinking && (
                      <Button to="/client-portal/account" variant="text">
                        {words.account.linking}
                      </Button>
                    )}
                  </div>
                </section>
              )}

              {data.needsYou.length > 0 && (
                <section className={styles.section} aria-labelledby="needs-title">
                  <h2 id="needs-title" className={styles.sectionTitle}>
                    {words.work.overview.needsYouTitle}
                  </h2>
                  <p className={styles.muted}>{words.work.overview.needsYouBody}</p>
                  <ul className={styles.list}>
                    {data.needsYou.map((entry) => (
                      <li key={`${entry.project.reference}-${entry.task.reference}`}>
                        <LocalizedLink to={`/client-portal/projects/${entry.project.reference}/tasks/${entry.task.reference}`} className={styles.rowLink}>
                          <span>
                            {entry.task.title} <span className={styles.timelineMeta}>· {entry.project.name}</span>
                          </span>
                          <span className={work.taskMeta}>
                            {entry.dueOn ? fill(words.work.tasks.due, { date: formatDay(entry.dueOn, lang) }) : words.work.action.status[entry.status]}
                            {entry.overdue ? <strong className={work.late}> · {words.work.overview.overdue}</strong> : null}
                          </span>
                        </LocalizedLink>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {data.awaitingYou.length > 0 && (
                <section className={styles.section} aria-labelledby="awaiting-title">
                  <h2 id="awaiting-title" className={styles.sectionTitle}>
                    {words.overview.awaitingTitle}
                  </h2>
                  <p className={styles.muted}>{words.overview.awaitingBody}</p>
                  <ul className={styles.list}>
                    {data.awaitingYou.map((project) => (
                      <li key={project.reference}>
                        <LocalizedLink to={`/client-portal/projects/${project.reference}`} className={styles.rowLink}>
                          <span>{project.name}</span>
                          <StatusBadge status={project.status} label={words.status[project.status]} />
                        </LocalizedLink>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {!empty && (
                <div className={styles.twoColumns}>
                  <section className={styles.section} aria-labelledby="activity-title">
                    <h2 id="activity-title" className={styles.sectionTitle}>
                      {words.overview.activityTitle}
                    </h2>
                    {data.activity.length === 0 ? (
                      <p className={styles.muted}>{words.overview.activityEmpty}</p>
                    ) : (
                      <ol className={styles.timeline}>
                        {data.activity.map((entry) => (
                          <li key={entry.id}>
                            <p className={styles.timelineLine}>{eventText(entry, words)}</p>
                            <p className={styles.timelineMeta}>
                              <LocalizedLink to={`/client-portal/projects/${entry.project.reference}`}>{entry.project.name}</LocalizedLink> · {formatMoment(entry.at, lang)}
                            </p>
                            {entry.note && <p className={styles.timelineNote}>{entry.note}</p>}
                          </li>
                        ))}
                      </ol>
                    )}
                  </section>

                  <section className={styles.section} aria-labelledby="upcoming-title">
                    <h2 id="upcoming-title" className={styles.sectionTitle}>
                      {words.overview.upcomingTitle}
                    </h2>
                    {data.upcoming.length === 0 ? (
                      <p className={styles.muted}>{words.overview.upcomingEmpty}</p>
                    ) : (
                      <ul className={styles.list}>
                        {data.upcoming.map((milestone) => (
                          <li key={`${milestone.kind}-${milestone.project.reference}-${milestone.title}`} className={styles.milestoneRow}>
                            <span>
                              <span className={work.scheduleKind}>{milestone.kind === 'task' ? words.work.overview.taskKind : words.work.overview.milestoneKind}</span> {milestone.title}
                            </span>
                            <span className={styles.timelineMeta}>
                              {milestone.project.name}
                              {milestone.dueOn ? ` · ${formatDay(milestone.dueOn, lang)}` : ''}
                              {milestone.overdue ? ` · ${words.overview.overdue}` : ''}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {data.bookings.length > 0 && (
                      <>
                        <h2 className={styles.sectionTitle}>{words.overview.bookingsTitle}</h2>
                        <ul className={styles.list}>
                          {data.bookings.map((booking) => (
                            <li key={booking.reference}>
                              <LocalizedLink to={`/client-portal/bookings/${booking.reference}`} className={styles.rowLink}>
                                <span>{booking.typeName}</span>
                                <span className={styles.timelineMeta}>{instantMoment(booking.startAt, booking.timeZone, lang)}</span>
                              </LocalizedLink>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </section>
                </div>
              )}
              {!empty && features.selfLinking && (
                <p className={styles.muted}>
                  {words.overview.linkHint} <LocalizedLink to="/client-portal/account">{words.account.title}</LocalizedLink>
                </p>
              )}
            </>
          )
        }}
      </Load>
    </>
  )
}

// ---- projects ------------------------------------------------------------------------------------------------------------------------

export function ProjectsView() {
  const { words } = useWords()
  const { state, reload } = useLoad(fetchProjects, 'projects')
  return (
    <>
      <PageHeader title={words.projects.title} lead={words.projects.lead} focusKey="projects" />
      <Load state={state} onRetry={reload}>
        {(projects) =>
          projects.length === 0 ? (
            <section className={styles.empty}>
              <p>{words.projects.empty}</p>
              <p className={styles.muted}>{words.overview.emptyBody}</p>
            </section>
          ) : (
            <ul className={styles.cards} aria-label={words.projects.cards}>
              {projects.map((project) => (
                <ProjectCard key={project.reference} project={project} />
              ))}
            </ul>
          )
        }
      </Load>
    </>
  )
}

export function ProjectView() {
  const { reference = '' } = useParams()
  const { lang, words } = useWords()
  const { state, reload } = useLoad(() => fetchProject(reference), reference)
  return (
    <>
      <p className={styles.back}>
        <LocalizedLink to="/client-portal/projects">← {words.project.back}</LocalizedLink>
      </p>
      <Load state={state} onRetry={reload} heading>
        {(project) => (
          <>
            <PageHeader eyebrow={words.categories[project.category]} title={project.name} focusKey={reference}>
              <p className={styles.statusLine}>
                <StatusBadge status={project.status} label={words.status[project.status]} />
                <span>{words.statusNote[project.status]}</span>
              </p>
            </PageHeader>
            <dl className={styles.facts} aria-label={words.project.summary}>
              <div>
                <dt>{words.projects.reference}</dt>
                <dd className={styles.code}>{project.reference}</dd>
              </div>
              <div>
                <dt>{words.projects.started}</dt>
                <dd>{project.startedOn ? formatDay(project.startedOn, lang) : words.common.notSet}</dd>
              </div>
              <div>
                <dt>{words.projects.expected}</dt>
                <dd>{project.expectedOn ? formatDay(project.expectedOn, lang) : words.common.notSet}</dd>
              </div>
              <div>
                <dt>{words.projects.updated}</dt>
                <dd>{formatMoment(project.updatedAt, lang)}</dd>
              </div>
              {project.request && (
                <div>
                  <dt>{words.project.request}</dt>
                  <dd>
                    <LocalizedLink to={`/client-portal/requests/${project.request.reference}`} className={styles.code}>
                      {project.request.reference}
                    </LocalizedLink>
                  </dd>
                </div>
              )}
            </dl>

            <ProjectWork reference={reference} milestones={project.milestoneList} />

            <section className={styles.section} aria-labelledby="milestones-title">
              <h2 id="milestones-title" className={styles.sectionTitle}>
                {words.project.milestones}
              </h2>
              {project.milestones && <Progress done={project.milestones.done} total={project.milestones.total} label={fill(words.projects.milestonesDone, project.milestones)} />}
              {project.milestoneList.length === 0 ? (
                <p className={styles.muted}>{words.project.noMilestones}</p>
              ) : (
                <ol className={styles.milestones}>
                  {project.milestoneList.map((milestone) => (
                    <li key={milestone.id} data-done={milestone.completedAt !== null}>
                      <span className={styles.milestoneMark} aria-hidden="true">
                        {milestone.completedAt ? '✓' : '○'}
                      </span>
                      <span>
                        {milestone.title}
                        <span className={styles.timelineMeta}>
                          {words.work.milestones.status[milestone.status]}
                          {milestone.completedAt ? ` · ${fill(words.project.doneOn, { date: formatMoment(milestone.completedAt, lang) })}` : milestone.dueOn ? ` · ${fill(words.project.due, { date: formatDay(milestone.dueOn, lang) })}` : ''}
                        </span>
                        {milestone.description && <span className={styles.timelineNote}>{milestone.description}</span>}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <section className={styles.section} aria-labelledby="timeline-title">
              <h2 id="timeline-title" className={styles.sectionTitle}>
                {words.project.timeline}
              </h2>
              <ol className={styles.timeline}>
                {project.timeline.map((entry) => (
                  <li key={entry.id}>
                    <p className={styles.timelineLine}>{eventText(entry, words)}</p>
                    <p className={styles.timelineMeta}>{formatMoment(entry.at, lang)}</p>
                    {entry.note && <p className={styles.timelineNote}>{entry.note}</p>}
                  </li>
                ))}
              </ol>
            </section>

            <section className={styles.section} aria-labelledby="documents-title">
              <h2 id="documents-title" className={styles.sectionTitle}>
                {words.project.documents}
              </h2>
              {project.documents.length === 0 ? (
                <p className={styles.muted}>{words.project.noDocuments}</p>
              ) : (
                <ul className={styles.list}>
                  {project.documents.map((doc) => (
                    <li key={doc.id}>{doc.title}</li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </Load>
    </>
  )
}

// ---- quote requests ------------------------------------------------------------------------------------------------------------------

export function RequestsView() {
  const { lang, words, quotes } = useWords()
  const { state, reload } = useLoad(fetchRequests, 'requests')
  return (
    <>
      <PageHeader title={words.requests.title} lead={words.requests.lead} focusKey="requests" />
      <Load state={state} onRetry={reload}>
        {(rows) =>
          rows.length === 0 ? (
            <section className={styles.empty}>
              <p>{words.requests.empty}</p>
            </section>
          ) : (
            <ul className={styles.cards}>
              {rows.map((row) => (
                <li key={row.reference} className={styles.card}>
                  <div className={styles.cardHead}>
                    <h2 className={styles.cardTitle}>
                      <LocalizedLink to={`/client-portal/requests/${row.reference}`} className={styles.cardLink}>
                        <span className={styles.code}>{row.reference}</span>
                      </LocalizedLink>
                    </h2>
                    <StatusBadge status={row.status} label={quotes.request.statuses[row.status]} />
                  </div>
                  <dl className={styles.facts}>
                    <div>
                      <dt>{words.requests.sent}</dt>
                      <dd>{formatMoment(row.createdAt, lang)}</dd>
                    </div>
                    {row.acceptedQuote && (
                      <div>
                        <dt>{words.requests.accepted}</dt>
                        <dd className={styles.code}>{row.acceptedQuote}</dd>
                      </div>
                    )}
                    {row.projects > 0 && (
                      <div>
                        <dt>{words.requests.projects}</dt>
                        <dd>{row.projects}</dd>
                      </div>
                    )}
                  </dl>
                </li>
              ))}
            </ul>
          )
        }
      </Load>
    </>
  )
}

export function RequestView() {
  const { reference = '' } = useParams()
  const { lang, words, quotes } = useWords()
  const navigate = useNavigate()
  const { state, reload } = useLoad(() => fetchRequest(reference), reference)
  const [problem, setProblem] = useState<string | null>(null)
  const [opening, setOpening] = useState<string | null>(null)

  async function open(quote: string | null) {
    setProblem(null)
    setOpening(quote ?? 'status')
    const result = await openRequest(reference, quote)
    setOpening(null)
    if (!result.ok) return setProblem(failureText(result.failure, words))
    navigate(localizedPath(lang, `/${result.data.path}`))
  }

  return (
    <>
      <p className={styles.back}>
        <LocalizedLink to="/client-portal/requests">← {words.requests.back}</LocalizedLink>
      </p>
      <Load state={state} onRetry={reload} heading>
        {(request) => (
          <>
            <PageHeader eyebrow={words.requests.title} title={request.reference} focusKey={reference}>
              <p className={styles.statusLine}>
                <StatusBadge status={request.status} label={quotes.request.statuses[request.status]} />
                <span>{fill(`${words.requests.sent}: {date}`, { date: formatMoment(request.createdAt, lang) })}</span>
              </p>
            </PageHeader>
            {problem && (
              <p className={styles.problemLine} role="alert">
                {problem}
              </p>
            )}
            <section className={styles.section} aria-labelledby="quotes-title">
              <h2 id="quotes-title" className={styles.sectionTitle}>
                {words.requests.quotes}
              </h2>
              {request.quotes.length === 0 ? (
                <p className={styles.muted}>{words.requests.noQuotes}</p>
              ) : (
                <ul className={styles.cards}>
                  {request.quotes.map((quote) => (
                    <li key={quote.reference} className={styles.card}>
                      <div className={styles.cardHead}>
                        <h3 className={styles.cardTitle} lang={quote.language}>
                          {quote.title}
                        </h3>
                        <StatusBadge status={quote.state === 'accepted' ? 'completed' : quote.state === 'open' ? 'waiting_customer' : 'on_hold'} label={quotes.request.states[quote.state]} />
                      </div>
                      <dl className={styles.facts}>
                        <div>
                          <dt>{words.projects.reference}</dt>
                          <dd className={styles.code}>
                            {quote.reference} · {fill(words.requests.version, { version: quote.version })}
                          </dd>
                        </div>
                        {quote.price && (
                          <div>
                            <dt>{words.requests.price}</dt>
                            <dd lang={quote.language}>{quote.price}</dd>
                          </div>
                        )}
                        {quote.timeline && (
                          <div>
                            <dt>{words.requests.timeline}</dt>
                            <dd lang={quote.language}>{quote.timeline}</dd>
                          </div>
                        )}
                        {quote.validUntil && (
                          <div>
                            <dt>{words.requests.validUntil}</dt>
                            <dd>{formatDay(quote.validUntil, lang)}</dd>
                          </div>
                        )}
                        {quote.acceptedAt && (
                          <div>
                            <dt>{words.requests.acceptedOn}</dt>
                            <dd>{formatMoment(quote.acceptedAt, lang)}</dd>
                          </div>
                        )}
                      </dl>
                      <Button type="button" variant="secondary" size="sm" loading={opening === quote.reference} onClick={() => void open(quote.reference)}>
                        {words.requests.openQuote}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              <p className={styles.muted}>{words.requests.note}</p>
              <div className={styles.row}>
                <Button type="button" variant="text" loading={opening === 'status'} onClick={() => void open(null)}>
                  {words.requests.openStatus}
                </Button>
              </div>
            </section>

            {request.updates.length > 0 && (
              <section className={styles.section} aria-labelledby="updates-title">
                <h2 id="updates-title" className={styles.sectionTitle}>
                  {quotes.request.updates}
                </h2>
                <ol className={styles.timeline}>
                  {request.updates.map((update, index) => (
                    <li key={index}>
                      <p className={styles.timelineLine}>{update.status ? quotes.request.statuses[update.status] : ''}</p>
                      <p className={styles.timelineMeta}>{formatMoment(update.at, lang)}</p>
                      {update.body && (
                        <p className={styles.timelineNote} lang={request.language}>
                          {update.body}
                        </p>
                      )}
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {request.projects.length > 0 && (
              <section className={styles.section} aria-labelledby="request-projects-title">
                <h2 id="request-projects-title" className={styles.sectionTitle}>
                  {words.requests.projects}
                </h2>
                <ul className={styles.list}>
                  {request.projects.map((project) => (
                    <li key={project.reference}>
                      <LocalizedLink to={`/client-portal/projects/${project.reference}`} className={styles.rowLink}>
                        <span>{project.name}</span>
                        <StatusBadge status={project.status} label={words.status[project.status]} />
                      </LocalizedLink>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </Load>
    </>
  )
}

// ---- bookings --------------------------------------------------------------------------------------------------------------------------

export function BookingsView() {
  const { lang, words, booking } = useWords()
  const { state, reload } = useLoad(fetchBookings, 'bookings')
  return (
    <>
      <PageHeader title={words.bookings.title} lead={words.bookings.lead} focusKey="bookings" />
      <Load state={state} onRetry={reload}>
        {(rows) =>
          rows.length === 0 ? (
            <section className={styles.empty}>
              <p>{words.bookings.empty}</p>
            </section>
          ) : (
            <ul className={styles.cards}>
              {rows.map((row) => (
                <li key={row.reference} className={styles.card}>
                  <div className={styles.cardHead}>
                    <h2 className={styles.cardTitle}>
                      <LocalizedLink to={`/client-portal/bookings/${row.reference}`} className={styles.cardLink}>
                        {row.typeName || row.reference}
                      </LocalizedLink>
                    </h2>
                    <StatusBadge status={row.status === 'cancelled' || row.status === 'no_show' ? 'cancelled' : row.status === 'completed' ? 'completed' : 'active'} label={booking.manage.statuses[row.status]} />
                  </div>
                  <dl className={styles.facts}>
                    <div>
                      <dt>{booking.manage.when}</dt>
                      <dd>
                        {instantDay(row.startAt, row.timeZone, lang, 'long')}, {instantRange(row.startAt, row.endAt, row.timeZone, lang)}
                      </dd>
                    </div>
                    <div>
                      <dt>{booking.manage.reference}</dt>
                      <dd className={styles.code}>{row.reference}</dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>
          )
        }
      </Load>
    </>
  )
}

export function BookingView() {
  const { reference = '' } = useParams()
  const { lang, words, booking } = useWords()
  const navigate = useNavigate()
  const { state, reload } = useLoad(() => fetchBooking(reference), reference)
  const [problem, setProblem] = useState<string | null>(null)
  const [opening, setOpening] = useState(false)

  async function manage() {
    setProblem(null)
    setOpening(true)
    const result = await openBooking(reference)
    setOpening(false)
    if (!result.ok) return setProblem(failureText(result.failure, words))
    navigate(localizedPath(lang, `/${result.data.path}`))
  }

  return (
    <>
      <p className={styles.back}>
        <LocalizedLink to="/client-portal/bookings">← {words.bookings.back}</LocalizedLink>
      </p>
      <Load state={state} onRetry={reload} heading>
        {(data) => (
          <>
            <PageHeader eyebrow={booking.manage.consultation} title={data.type.name || data.reference} focusKey={reference}>
              <p className={styles.statusLine}>
                <StatusBadge status={data.status === 'cancelled' || data.status === 'no_show' ? 'cancelled' : data.status === 'completed' ? 'completed' : 'active'} label={booking.manage.statuses[data.status]} />
              </p>
            </PageHeader>
            <dl className={styles.facts}>
              <div>
                <dt>{booking.manage.when}</dt>
                <dd>
                  {instantDay(data.startAt, data.timeZone, lang, 'full')}, {instantRange(data.startAt, data.endAt, data.timeZone, lang)}
                </dd>
              </div>
              <div>
                <dt>{booking.manage.zone}</dt>
                <dd>{zoneName(data.timeZone, lang, data.startAt)}</dd>
              </div>
              <div>
                <dt>{booking.manage.duration}</dt>
                <dd>{fill(booking.type.duration, { minutes: data.durationMinutes })}</dd>
              </div>
              <div>
                <dt>{booking.manage.reference}</dt>
                <dd className={styles.code}>{data.reference}</dd>
              </div>
            </dl>
            {data.type.description && <p className={styles.prose}>{data.type.description}</p>}
            {problem && (
              <p className={styles.problemLine} role="alert">
                {problem}
              </p>
            )}
            <div className={styles.row}>
              <Button type="button" variant="secondary" loading={opening} onClick={() => void manage()}>
                {words.bookings.manage}
              </Button>
            </div>
            <p className={styles.muted}>{words.bookings.manageNote}</p>
          </>
        )}
      </Load>
    </>
  )
}

// ---- documents -------------------------------------------------------------------------------------------------------------------------

export function DocumentsView() {
  const { words } = useWords()
  const { features } = useSessionData()
  const { state, reload } = useLoad(fetchDocuments, 'documents')
  return (
    <>
      <PageHeader title={words.documents.title} lead={words.documents.lead} focusKey="documents" />
      <Load state={state} onRetry={reload}>
        {(rows) => (
          <>
            {rows.length === 0 ? (
              <section className={styles.empty}>
                <p>{words.documents.empty}</p>
              </section>
            ) : (
              <ul className={styles.list}>
                {rows.map((doc) => (
                  <li key={doc.id} className={styles.milestoneRow}>
                    <span>{doc.title}</span>
                    <span className={styles.timelineMeta}>{doc.project.name}</span>
                  </li>
                ))}
              </ul>
            )}
            {!features.documents && <p className={styles.notice}>{words.documents.notReady}</p>}
          </>
        )}
      </Load>
    </>
  )
}

