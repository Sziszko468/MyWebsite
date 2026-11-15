import { useState, type FormEvent } from 'react'
import { useLocation } from 'react-router'
import { LANGUAGES } from '../../i18n/config'
import { useI18n } from '../../i18n/useI18n'
import { askForDeletion, claimCandidates, type Candidate, endOtherSessions, endSession, fetchCandidates, fetchSessions, requestEmailChange, saveProfile, withdrawDeletion } from '../../portal/api'
import { failureText, usePortalText } from '../../portal/text'
import { useLoad, usePortal, useSessionData } from '../../portal/usePortal'
import { fill, formatMoment } from '../../utils/format'
import { Button } from '../Button/Button'
import { CheckboxField, ChoiceGroup, TextField } from '../form/fields'
import styles from './Portal.module.scss'
import { Load, PageHeader } from './ui'

const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/

/** The customer's own details, how they sign in, which devices are signed in, the records they may link, and the request to delete the account. */
export function AccountView() {
  const words = usePortalText()
  const { lang } = useI18n()
  const { customer, features } = useSessionData()
  const { updateCustomer, ended, refresh } = usePortal()
  const { state: location } = useLocation() as { state: { notice?: string | null } | null }

  // ---- profile
  const [name, setName] = useState(customer.name ?? '')
  const [company, setCompany] = useState(customer.company ?? '')
  const [language, setLanguage] = useState(customer.language)
  const [profileState, setProfileState] = useState<{ saving: boolean; saved: boolean; error: string | null; fields: Record<string, string> }>({ saving: false, saved: false, error: null, fields: {} })

  async function submitProfile(event: FormEvent) {
    event.preventDefault()
    setProfileState({ saving: true, saved: false, error: null, fields: {} })
    const result = await saveProfile({ name: name.trim(), company: company.trim(), language })
    if (result.ok) {
      updateCustomer(result.data)
      return setProfileState({ saving: false, saved: true, error: null, fields: {} })
    }
    if (result.failure.kind === 'unauthorized') return ended()
    setProfileState({ saving: false, saved: false, error: result.failure.kind === 'refused' ? null : failureText(result.failure, words), fields: result.failure.kind === 'refused' ? result.failure.fields : {} })
  }

  // ---- email
  const [newEmail, setNewEmail] = useState('')
  const [emailState, setEmailState] = useState<{ sending: boolean; sent: boolean; error: string | null }>({ sending: false, sent: false, error: null })
  async function submitEmail(event: FormEvent) {
    event.preventDefault()
    const typed = newEmail.trim()
    if (!typed) return setEmailState({ sending: false, sent: false, error: words.account.errors.required })
    if (!EMAIL.test(typed)) return setEmailState({ sending: false, sent: false, error: words.account.errors.invalidEmail })
    setEmailState({ sending: true, sent: false, error: null })
    const result = await requestEmailChange(typed)
    if (result.ok) {
      setNewEmail('')
      return setEmailState({ sending: false, sent: true, error: null })
    }
    if (result.failure.kind === 'unauthorized') return ended()
    setEmailState({ sending: false, sent: false, error: result.failure.kind === 'refused' ? words.account.errors.invalidEmail : failureText(result.failure, words) })
  }

  // ---- sessions
  const sessions = useLoad(fetchSessions, 'sessions')
  const [sessionMessage, setSessionMessage] = useState<string | null>(null)
  async function endOthers() {
    const result = await endOtherSessions()
    if (result.ok) {
      setSessionMessage(fill(words.account.endedOthers, { count: result.data.closed }))
      return sessions.reload()
    }
    if (result.failure.kind === 'unauthorized') return ended()
    setSessionMessage(failureText(result.failure, words))
  }
  async function endOne(id: string) {
    const result = await endSession(id)
    if (!result.ok) return result.failure.kind === 'unauthorized' ? ended() : setSessionMessage(failureText(result.failure, words))
    if (result.data.current) return ended()
    sessions.reload()
  }

  // ---- linking
  const candidates = useLoad<Candidate[]>(features.selfLinking ? fetchCandidates : () => Promise.resolve({ ok: true, data: [] }), `candidates-${features.selfLinking}`)
  const [picked, setPicked] = useState<Set<string> | null>(null)
  const [linkMessage, setLinkMessage] = useState<string | null>(null)
  async function link(all: string[]) {
    const ids = picked ? all.filter((id) => picked.has(id)) : all
    const result = await claimCandidates(ids)
    if (result.ok) {
      setLinkMessage(fill(words.account.linked, { count: result.data.linked }))
      setPicked(null)
      return candidates.reload()
    }
    if (result.failure.kind === 'unauthorized') return ended()
    setLinkMessage(failureText(result.failure, words))
  }

  // ---- deletion
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteProblem, setDeleteProblem] = useState<string | null>(null)
  async function ask() {
    const result = await askForDeletion()
    if (result.ok) return refresh()
    if (result.failure.kind === 'unauthorized') return ended()
    setDeleteProblem(failureText(result.failure, words))
  }
  async function withdraw() {
    const result = await withdrawDeletion()
    if (result.ok) return refresh()
    if (result.failure.kind === 'unauthorized') return ended()
    setDeleteProblem(failureText(result.failure, words))
  }

  return (
    <>
      <PageHeader title={words.account.title} lead={words.account.lead} focusKey="account" />
      {location?.notice === 'email' && (
        <p className={styles.notice} role="status">
          {words.verify.doneEmail}
        </p>
      )}

      <section className={styles.section} aria-labelledby="profile-title">
        <h2 id="profile-title" className={styles.sectionTitle}>
          {words.account.profile}
        </h2>
        <dl className={styles.facts}>
          <div>
            <dt>{words.account.email}</dt>
            <dd>
              {customer.email} {customer.verifiedAt && <span className={styles.verified}>{words.account.verified}</span>}
            </dd>
          </div>
          <div>
            <dt>{words.account.created}</dt>
            <dd>{formatMoment(customer.createdAt, lang)}</dd>
          </div>
        </dl>
        <form className={styles.form} onSubmit={submitProfile} noValidate>
          <TextField label={words.account.name} optionalText={words.common.optional} name="name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} error={profileState.fields.name ? words.account.errors.tooLong : undefined} />
          <TextField label={words.account.company} optionalText={words.common.optional} name="company" autoComplete="organization" value={company} onChange={(event) => setCompany(event.target.value)} error={profileState.fields.company ? words.account.errors.tooLong : undefined} />
          <ChoiceGroup legend={words.account.language} value={language} onChange={setLanguage} options={LANGUAGES.map((code) => ({ value: code, label: words.languages[code] }))} />
          {profileState.error && (
            <p className={styles.problemLine} role="alert">
              {profileState.error}
            </p>
          )}
          <div className={styles.row}>
            <Button type="submit" loading={profileState.saving} loadingLabel={words.common.saving}>
              {words.common.save}
            </Button>
            {profileState.saved && (
              <p role="status" className={styles.muted}>
                {words.common.saved}
              </p>
            )}
          </div>
        </form>
      </section>

      <section className={styles.section} aria-labelledby="email-title">
        <h2 id="email-title" className={styles.sectionTitle}>
          {words.account.changeEmail}
        </h2>
        <p className={styles.muted}>{words.account.changeEmailBody}</p>
        <form className={styles.form} onSubmit={submitEmail} noValidate>
          <TextField label={words.account.newEmail} name="new-email" type="email" inputMode="email" autoComplete="off" autoCapitalize="none" spellCheck={false} value={newEmail} onChange={(event) => setNewEmail(event.target.value)} error={emailState.error ?? undefined} />
          <div className={styles.row}>
            <Button type="submit" variant="secondary" loading={emailState.sending} loadingLabel={words.signIn.sending}>
              {words.account.sendEmailLink}
            </Button>
          </div>
          {emailState.sent && (
            <p role="status" className={styles.notice}>
              {words.account.emailLinkSent}
            </p>
          )}
        </form>
      </section>

      <section className={styles.section} aria-labelledby="security-title">
        <h2 id="security-title" className={styles.sectionTitle}>
          {words.account.security}
        </h2>
        <h3 className={styles.subTitle}>{words.account.sessions}</h3>
        <Load state={sessions.state} onRetry={sessions.reload}>
          {(rows) => (
            <>
              <ul className={styles.list}>
                {rows.map((row) => (
                  <li key={row.id} className={styles.sessionRow}>
                    <div>
                      <p className={styles.timelineLine}>
                        {row.browser || words.account.sessions} {row.current && <span className={styles.verified}>{words.account.thisDevice}</span>}
                      </p>
                      <p className={styles.timelineMeta}>
                        {fill(words.account.signedIn, { date: formatMoment(row.createdAt, lang) })} · {fill(words.account.lastUsed, { date: formatMoment(row.lastSeenAt, lang) })} · {fill(words.account.expires, { date: formatMoment(row.expiresAt, lang) })}
                      </p>
                    </div>
                    <Button type="button" variant="text" size="sm" onClick={() => void endOne(row.id)}>
                      {words.account.endSession}
                    </Button>
                  </li>
                ))}
              </ul>
              {rows.length > 1 ? (
                <Button type="button" variant="secondary" onClick={() => void endOthers()}>
                  {words.account.endOthers}
                </Button>
              ) : (
                <p className={styles.muted}>{words.account.noOthers}</p>
              )}
            </>
          )}
        </Load>
        {sessionMessage && (
          <p role="status" className={styles.notice}>
            {sessionMessage}
          </p>
        )}
      </section>

      {features.selfLinking && (
        <section className={styles.section} aria-labelledby="linking-title">
          <h2 id="linking-title" className={styles.sectionTitle}>
            {words.account.linking}
          </h2>
          <p className={styles.muted}>{words.account.linkingBody}</p>
          <Load state={candidates.state} onRetry={candidates.reload}>
            {(rows) =>
              rows.length === 0 ? (
                <p>{words.account.linkingNone}</p>
              ) : (
                <>
                  <ul className={styles.list}>
                    {rows.map((row) => (
                      <li key={row.id}>
                        <CheckboxField
                          label={`${words.account.kinds[row.type]} ${row.reference} · ${formatMoment(row.createdAt, lang)}`}
                          checked={picked ? picked.has(row.id) : true}
                          onChange={(checked) => {
                            const next = new Set(picked ?? rows.map((entry) => entry.id))
                            if (checked) next.add(row.id)
                            else next.delete(row.id)
                            setPicked(next)
                          }}
                        />
                      </li>
                    ))}
                  </ul>
                  <Button type="button" onClick={() => void link(rows.map((row) => row.id))}>
                    {words.account.linkSelected}
                  </Button>
                </>
              )
            }
          </Load>
          {linkMessage && (
            <p role="status" className={styles.notice}>
              {linkMessage}
            </p>
          )}
        </section>
      )}

      <section className={styles.section} aria-labelledby="deletion-title">
        <h2 id="deletion-title" className={styles.sectionTitle}>
          {words.account.deletion}
        </h2>
        <p className={styles.muted}>{words.account.deletionBody}</p>
        {customer.deletionRequestedAt ? (
          <>
            <p role="status" className={styles.notice}>
              {fill(words.account.deletionDone, { date: formatMoment(customer.deletionRequestedAt, lang) })}
            </p>
            <Button type="button" variant="secondary" onClick={() => void withdraw()}>
              {words.account.deletionCancel}
            </Button>
          </>
        ) : (
          <div className={styles.form}>
            <CheckboxField label={words.account.deletionConfirm} checked={confirmDelete} onChange={setConfirmDelete} />
            <div className={styles.row}>
              <Button type="button" variant="secondary" disabled={!confirmDelete} onClick={() => void ask()}>
                {words.account.deletionAsk}
              </Button>
            </div>
          </div>
        )}
        {deleteProblem && (
          <p className={styles.problemLine} role="alert">
            {deleteProblem}
          </p>
        )}
      </section>
    </>
  )
}
