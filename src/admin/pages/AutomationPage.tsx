import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { fill } from '../../utils/format'
import { ACTION_STATUSES, ACTION_TYPES, automation, type AutomationConfig } from '../api/automation'
import { ApiError } from '../api/client'
import { AdminButton } from '../components/AdminButton'
import { SelectField, TextField } from '../components/form'
import { PageHeader, TabPanel, Tabs } from '../components/layout'
import { EmptyState, LoadingState } from '../components/states'
import { Pagination } from '../components/Pagination'
import { useResource } from '../hooks/useResource'
import { useInterfaceLanguage } from '../i18n'
import { AUTOMATION_LANGUAGES, type AutomationLanguage } from '../i18n/automation'
import { DEFAULT_FILTERS, moment, queryFor, readFilters, typeName, word, writeFilters, type Filters, type Tab } from '../automation/model'
import { Notice, StatusPill, SummaryLine } from '../automation/Parts'
import { AutomationTextProvider, readStoredLanguage, storeLanguage, useAutomationLanguage, useAutomationText } from '../automation/text'
import styles from '../styles/automation.module.scss'

/**
 * `/admin/automation` (PROMPT 33): the actions the AI assistant has PROPOSED, waiting for a person, and everything that has happened to them since. Nothing on this screen runs by itself:
 * an action runs only when an administrator uses the approval control on its own page, and the server checks everything again. The tab, the filters and the page live in the address, so a
 * view can be shared and the back button works. The screen speaks the language picked for it (Hungarian, English or Dutch).
 */

export function AutomationPage() {
  const interfaceLanguage = useInterfaceLanguage()
  const [language, setLanguage] = useState<AutomationLanguage>(() => readStoredLanguage(interfaceLanguage))
  const choose = (next: AutomationLanguage) => {
    setLanguage(next)
    storeLanguage(next)
  }
  return (
    <AutomationTextProvider language={language}>
      <Screen language={language} onLanguage={choose} />
    </AutomationTextProvider>
  )
}

function Screen({ language, onLanguage }: { language: AutomationLanguage; onLanguage: (language: AutomationLanguage) => void }) {
  const t = useAutomationText()
  const [params, setParams] = useSearchParams()
  const { tab, filters } = useMemo(() => readFilters(params), [params])
  const config = useResource((signal) => automation.config(signal), [])
  const names = t.language.names as Record<string, string>
  const picker = <SelectField label={t.language.label} hint={t.language.note} value={language} onChange={(event) => onLanguage(event.target.value as AutomationLanguage)} options={AUTOMATION_LANGUAGES.map((code) => ({ value: code, label: names[code] }))} />
  const open = (next: Tab) => setParams(writeFilters(next, DEFAULT_FILTERS))
  const change = (patch: Partial<Filters>) => setParams(writeFilters(tab, { ...filters, page: 1, ...patch }), { replace: true })

  return (
    <>
      <PageHeader title={t.title} lead={t.lead} actions={picker} />
      {config.loading && <LoadingState label={t.loading} />}
      {config.error !== null && !config.data && <Failure error={config.error} onRetry={config.reload} />}
      {config.data && (
        <>
          {!config.data.enabled && (
            <Notice tone="alert">
              <strong>{t.disabled.title}.</strong> {t.disabled.body}
            </Notice>
          )}
          <Tabs tabs={TAB_LIST.map((id) => ({ id, label: t.tabs[id] }))} value={tab} onChange={(id) => open(id as Tab)} label={t.tabs.label} idBase="automation" />
          {TAB_LIST.map((id) => (
            <TabPanel key={id} id={id} idBase="automation" active={id === tab}>
              {id === 'catalog' ? <Catalog config={config.data!} /> : <Results tab={id} filters={filters} config={config.data!} onChange={change} onReset={() => setParams(writeFilters(tab, DEFAULT_FILTERS), { replace: true })} />}
            </TabPanel>
          ))}
        </>
      )}
    </>
  )
}

const TAB_LIST: readonly Tab[] = ['pending', 'history', 'catalog']

function Failure({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const t = useAutomationText()
  const sentence = error instanceof ApiError && error.status === 403 ? t.errors.forbidden : t.errors.generic
  return (
    <EmptyState icon="alert" title={t.errors.generic} action={<AdminButton variant="secondary" type="button" onClick={onRetry}>{t.errors.retry}</AdminButton>}>
      {sentence}
    </EmptyState>
  )
}

// ---- the list ------------------------------------------------------------------------------------------------------------------------

function Results({ tab, filters, config, onChange, onReset }: { tab: Exclude<Tab, 'catalog'>; filters: Filters; config: AutomationConfig; onChange: (patch: Partial<Filters>) => void; onReset: () => void }) {
  const t = useAutomationText()
  const language = useAutomationLanguage()
  const query = queryFor(tab, filters)
  const list = useResource((signal) => automation.list(query, signal), [tab, JSON.stringify(query)])
  const dirty = JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS)
  const any = (label: string) => ({ value: '', label })
  const statuses = ACTION_STATUSES.filter((status) => (tab === 'pending' ? ['proposed', 'awaiting_approval', 'approved', 'executing'] : ['completed', 'rejected', 'expired', 'cancelled', 'failed']).includes(status))
  return (
    <div className={styles.results}>
      <section className={styles.filters} aria-label={t.filters.title}>
        <h2 className={styles.panelTitle}>{t.filters.title}</h2>
        <div className={styles.filterGrid}>
          <SelectField label={t.filters.status} value={filters.status} onChange={(event) => onChange({ status: event.target.value })} options={[any(t.filters.any), ...statuses.map((status) => ({ value: status, label: word(t.status, status) }))]} />
          <SelectField label={t.filters.type} value={filters.type} onChange={(event) => onChange({ type: event.target.value })} options={[any(t.filters.any), ...ACTION_TYPES.map((type) => ({ value: type, label: typeName(t, type) }))]} />
          {config.seesAll && <SelectField label={t.filters.administrator} value={filters.admin} onChange={(event) => onChange({ admin: event.target.value })} options={[any(t.filters.any), ...config.administrators.map((admin) => ({ value: admin.id, label: admin.email }))]} />}
          <TextField label={t.filters.target} hint={t.filters.targetHint} value={filters.target} onChange={(event) => onChange({ target: event.target.value.trim() })} maxLength={64} autoComplete="off" />
          {tab === 'history' && (
            <>
              <TextField label={t.filters.from} type="date" value={filters.from} onChange={(event) => onChange({ from: event.target.value })} />
              <TextField label={t.filters.to} type="date" value={filters.to} onChange={(event) => onChange({ to: event.target.value })} />
            </>
          )}
        </div>
        <div className={styles.filterFoot}>
          {!config.seesAll && <p className={styles.muted}>{t.filters.own}</p>}
          {dirty && (
            <AdminButton variant="text" type="button" onClick={onReset}>
              {t.filters.reset}
            </AdminButton>
          )}
        </div>
      </section>

      {list.loading && <LoadingState label={t.loading} />}
      {list.error !== null && !list.data && <Failure error={list.error} onRetry={list.reload} />}
      {list.data && (
        <>
          <p className={styles.muted} role="status">
            {fill(t.list.count, { count: list.data.total })}
          </p>
          {list.data.items.length === 0 ? (
            <EmptyState icon="info" title={tab === 'pending' && !dirty ? t.list.emptyPending : t.list.empty} />
          ) : (
            <div className={styles.tableScroll} tabIndex={0} role="group" aria-label={t.list.caption}>
              <table>
                <caption className={styles.srOnly}>{t.list.caption}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t.list.columns.reference}</th>
                    <th scope="col">{t.list.columns.action}</th>
                    <th scope="col">{t.list.columns.target}</th>
                    <th scope="col">{t.list.columns.status}</th>
                    {config.seesAll && <th scope="col">{t.list.columns.administrator}</th>}
                    <th scope="col">{t.list.columns.created}</th>
                    <th scope="col">{t.list.columns.expires}</th>
                  </tr>
                </thead>
                <tbody>
                  {list.data.items.map((item) => (
                    <tr key={item.reference}>
                      <th scope="row">
                        <Link to={`/automation/${item.reference}`} aria-label={fill(t.list.open, { reference: item.reference })}>
                          {item.reference}
                        </Link>
                      </th>
                      <td>
                        <strong>{typeName(t, item.type)}</strong>
                        {item.change && (
                          <>
                            <br />
                            <span className={styles.muted}>
                              <SummaryLine item={item} />
                            </span>
                          </>
                        )}
                        {item.requiresSecondConfirmation && <span className={styles.tag}>{t.list.secondConfirmation}</span>}
                        {item.customerVisible && <span className={styles.tag}>{t.list.customerVisible}</span>}
                      </td>
                      <td>{item.target.reference ?? t.list.noTarget}</td>
                      <td>
                        <StatusPill status={item.status} />
                      </td>
                      {config.seesAll && <td>{item.administrator.email ?? t.detail.unknownAdmin}</td>}
                      <td>{moment(item.createdAt, language)}</td>
                      <td>{item.status === 'awaiting_approval' ? moment(item.expiresAt, language) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={(page) => onChange({ page })} />
        </>
      )}
    </div>
  )
}

// ---- what it can and cannot do ----------------------------------------------------------------------------------------------------

function Catalog({ config }: { config: AutomationConfig }) {
  const t = useAutomationText()
  return (
    <div className={styles.results}>
      <section aria-labelledby="catalog-title">
        <h2 id="catalog-title" className={styles.panelTitle}>
          {t.catalog.title}
        </h2>
        <p className={styles.muted}>{t.catalog.lead}</p>
        <div className={styles.cards}>
          {config.types.map((entry) => (
            <article key={entry.type} className={styles.card}>
              <h3 className={styles.cardTitle}>{typeName(t, entry.type)}</h3>
              <p>{(t.types as Record<string, { summary: string }>)[entry.type]?.summary}</p>
              <dl className={styles.facts}>
                <div>
                  <dt>{t.catalog.permission}</dt>
                  <dd>
                    <code>{entry.permission}</code>
                  </dd>
                </div>
                <div>
                  <dt>{t.catalog.reversible}</dt>
                  <dd>{word(t.reversible, entry.reversible)}</dd>
                </div>
                <div>
                  <dt>{t.catalog.customerVisible}</dt>
                  <dd>{entry.customerVisible ? t.catalog.yes : t.catalog.no}</dd>
                </div>
                <div>
                  <dt>{t.catalog.second}</dt>
                  <dd>{word(t.catalog.secondValues, entry.secondConfirmation)}</dd>
                </div>
              </dl>
              <ul className={styles.plainList}>
                {entry.sideEffects.map((code) => (
                  <li key={code}>{word(t.sideEffects, code)}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>
      <section aria-labelledby="unsupported-title">
        <h2 id="unsupported-title" className={styles.panelTitle}>
          {t.catalog.unsupportedTitle}
        </h2>
        <p className={styles.muted}>{t.catalog.unsupportedLead}</p>
        <ul className={styles.plainList}>
          {config.unsupported.map((item) => (
            <li key={item.code}>
              <strong>{word(t.catalog.unsupported, item.code)}.</strong> {word(t.catalog.reasons, item.reason)}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
