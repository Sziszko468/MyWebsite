import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { localizedPath } from '../../i18n/paths'
import { useI18n } from '../../i18n/useI18n'
import { askForLink, verifyLink, type Failure } from '../../portal/api'
import { failureText, usePortalText, type PortalWords } from '../../portal/text'
import { usePortal } from '../../portal/usePortal'
import { fill } from '../../utils/format'
import { Button } from '../Button/Button'
import { Container } from '../Container/Container'
import { TextField } from '../form/fields'
import { LocalizedLink } from '../LocalizedLink/LocalizedLink'
import styles from './Portal.module.scss'
import { PageHeader } from './ui'

const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/

/** The sign-in page: an address, and a link sent to it. Whatever the address is, the answer is the same; nothing here says whether an account exists. */
export function SignInView() {
  const words = usePortalText()
  const { lang } = useI18n()
  const { state } = usePortal()
  const config = state.status === 'anonymous' ? state.config : null
  const ended = state.status === 'anonymous' && state.ended
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState<number | null>(null)
  const sentHeading = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (sent !== null) sentHeading.current?.focus()
  }, [sent])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setProblem(null)
    const typed = email.trim()
    if (!typed) return setError(words.signIn.errors.required)
    if (!EMAIL.test(typed)) return setError(words.signIn.errors.invalidEmail)
    setError(null)
    setSending(true)
    const result = await askForLink(typed, lang)
    setSending(false)
    if (result.ok) return setSent(result.data.linkMinutes)
    if (result.failure.kind === 'refused' && result.failure.fields.email) return setError(words.signIn.errors.invalidEmail)
    setProblem(failureText(result.failure, words))
  }

  const available = config?.signInAvailable !== false

  return (
    <Container size="narrow" className={styles.authPage}>
      <PageHeader eyebrow={words.signIn.eyebrow} title={words.signIn.title} lead={words.signIn.lead} focusKey="sign-in" />
      {ended && (
        <p className={styles.notice} role="status">
          {words.problems.ended}
        </p>
      )}
      {sent !== null ? (
        <section className={styles.panel} aria-labelledby="sent-title">
          <h2 id="sent-title" ref={sentHeading} tabIndex={-1} className={styles.panelTitle}>
            {words.signIn.sentTitle}
          </h2>
          <p role="status">{fill(words.signIn.sentBody, { minutes: sent })}</p>
          <p className={styles.muted}>{words.signIn.sentHint}</p>
          <Button type="button" variant="secondary" onClick={() => setSent(null)}>
            {words.signIn.again}
          </Button>
        </section>
      ) : !available ? (
        <p className={styles.notice} role="status">
          {words.signIn.unavailable}
        </p>
      ) : (
        <form className={styles.panel} onSubmit={submit} noValidate>
          <TextField label={words.signIn.email} name="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} value={email} onChange={(event) => setEmail(event.target.value)} error={error ?? undefined} />
          {problem && (
            <p className={styles.problemLine} role="alert">
              {problem}
            </p>
          )}
          <Button type="submit" arrow loading={sending} loadingLabel={words.signIn.sending}>
            {words.signIn.send}
          </Button>
        </form>
      )}
      <div className={styles.fineprint}>
        <p>{config?.registration ? words.signIn.registrationOpen : words.signIn.invitationOnly}</p>
        <p>{words.signIn.cookie}</p>
        <p>
          <LocalizedLink to="/contact">{words.common.contact}</LocalizedLink> · <LocalizedLink to="/privacy">{words.common.privacy}</LocalizedLink>
        </p>
      </div>
    </Container>
  )
}

const TOKEN = /^[A-Za-z0-9_-]{43}$/

/** The secret in the address, if there is one of the right shape. */
const tokenFromAddress = (): string | null => {
  const raw = window.location.hash.replace(/^#/, '')
  return TOKEN.test(raw) ? raw : null
}

/** The secret leaves the address bar and the history, whatever happens next. */
const forgetAddressSecret = (): void => {
  if (window.location.hash) window.history.replaceState(null, '', window.location.pathname + window.location.search)
}

function failureTitles(failure: Failure, words: PortalWords): { title: string; body: string } {
  switch (failure.kind) {
    case 'expired':
      return { title: words.verify.expiredTitle, body: words.verify.expiredBody }
    case 'used':
      return { title: words.verify.usedTitle, body: words.verify.usedBody }
    case 'replaced':
      return { title: words.verify.replacedTitle, body: words.verify.replacedBody }
    case 'not_found':
      return { title: words.verify.invalidTitle, body: words.verify.invalidBody }
    default:
      return { title: words.verify.invalidTitle, body: failureText(failure, words) }
  }
}

/**
 * Where the link in an e-mail lands: `/client-portal/verify#<secret>`. The secret is in the fragment, so no server, log or other site ever sees it; it is read
 * once, taken out of the address bar and the history at once, and used only when the person presses the button (so a mail program that opens a link to check
 * it cannot spend it).
 */
export function VerifyView() {
  const words = usePortalText()
  const { lang } = useI18n()
  const navigate = useNavigate()
  const { adopt } = usePortal()
  const [token, setToken] = useState<string | null>(tokenFromAddress)
  const [working, setWorking] = useState(false)
  const [failure, setFailure] = useState<Failure | null>(null)

  useEffect(() => {
    forgetAddressSecret()
    // A link opened in this same tab only changes the fragment: take the new secret, and forget it again.
    const onChange = () => {
      const next = tokenFromAddress()
      if (next) {
        setToken(next)
        setFailure(null)
      }
      forgetAddressSecret()
    }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  async function confirm() {
    if (!token) return
    setWorking(true)
    setFailure(null)
    const result = await verifyLink(token)
    if (!result.ok) {
      setWorking(false)
      return setFailure(result.failure)
    }
    adopt(result.data.customer, result.data.csrfToken)
    const target = result.data.purpose === 'email_change' ? '/client-portal/account' : '/client-portal'
    navigate(localizedPath(lang, target), { replace: true, state: { notice: result.data.purpose === 'email_change' ? 'email' : result.data.created ? 'created' : null } })
  }

  if (!token || failure) {
    const shown = failure ? failureTitles(failure, words) : { title: words.verify.incompleteTitle, body: words.verify.incompleteBody }
    return (
      <Container size="narrow" className={styles.authPage}>
        <PageHeader title={shown.title} focusKey={`verify-${failure?.kind ?? 'incomplete'}`} />
        <p role="alert">{shown.body}</p>
        <Button to="/client-portal" variant="secondary">
          {words.verify.newLink}
        </Button>
      </Container>
    )
  }
  return (
    <Container size="narrow" className={styles.authPage}>
      <PageHeader eyebrow={words.signIn.eyebrow} title={words.verify.title} lead={words.verify.lead} focusKey="verify" />
      <div className={styles.panel}>
        <Button type="button" arrow loading={working} loadingLabel={words.verify.working} onClick={() => void confirm()}>
          {words.verify.button}
        </Button>
      </div>
    </Container>
  )
}
