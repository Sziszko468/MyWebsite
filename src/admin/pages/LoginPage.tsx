import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ApiError } from '../api/client'
import { AdminButton } from '../components/AdminButton'
import { TextField } from '../components/form'
import { useText } from '../i18n'
import { useGate } from '../session/SessionProvider'
import shell from '../styles/shell.module.scss'
import styles from '../styles/ui.module.scss'

/**
 * The only screen without a session. It says the same thing for a wrong address, a wrong password and a locked account
 * (as the server does), tells the person when their session ended, and moves focus to what went wrong.
 */
export function LoginPage({ reason }: { reason: 'expired' | null }) {
  const t = useText()
  const { signIn } = useGate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const alert = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    if (problem) alert.current?.focus()
  }, [problem])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!email.trim() || !password) return setProblem(t.login.required)
    setProblem(null)
    setBusy(true)
    try {
      await signIn(email.trim(), password)
    } catch (error) {
      setBusy(false)
      if (error instanceof ApiError) {
        setProblem(error.code === 'network' ? t.login.network : error.status === 429 ? t.login.tooMany : error.status === 503 ? t.login.unavailable : t.login.invalid)
      } else {
        setProblem(t.login.unavailable)
      }
    }
  }

  return (
    <main className={shell.loginPage}>
      <form className={shell.loginCard} onSubmit={submit} noValidate>
        <div>
          <h1 className={shell.loginTitle}>{t.login.heading}</h1>
          <p className={styles.muted}>{t.login.lead}</p>
        </div>
        {reason === 'expired' && !problem && (
          <p className={styles.notice} role="status">
            {t.login.expired}
          </p>
        )}
        {problem && (
          <p ref={alert} tabIndex={-1} className={`${styles.notice} ${styles.noticeDanger}`} role="alert">
            {problem}
          </p>
        )}
        <TextField label={t.login.email} type="email" name="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required autoFocus />
        <TextField label={t.login.password} type="password" name="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        <AdminButton type="submit" variant="primary" loading={busy} loadingLabel={t.login.submitting} fullWidth>
          {t.login.submit}
        </AdminButton>
      </form>
    </main>
  )
}
