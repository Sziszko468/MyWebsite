import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { cx } from '../../utils/cx'
import { useText } from '../i18n'
import styles from '../styles/ui.module.scss'
import { Icon } from './Icon'

/**
 * Short messages about what just happened (saved, sent, failed). A success or a piece of information is announced
 * politely and goes by itself after a few seconds; a failure is announced at once and stays until it is dismissed, so
 * it cannot be missed while looking elsewhere. Nothing here moves or fades in a way that delays work.
 */

type Tone = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  tone: Tone
  message: string
}

interface Toasts {
  success: (message: string) => void
  error: (message: string) => void
  info: (message: string) => void
}

const Context = createContext<Toasts | null>(null)

const LIFETIME_MS: Record<Tone, number | null> = { success: 5000, info: 6000, error: null }

export function ToastNotification({ toast, onDismiss }: { toast: Pick<ToastItem, 'tone' | 'message'>; onDismiss: () => void }) {
  const t = useText()
  return (
    <div className={cx(styles.toast, toast.tone === 'success' && styles.toastSuccess, toast.tone === 'error' && styles.toastError, toast.tone === 'info' && styles.toastInfo)} role={toast.tone === 'error' ? 'alert' : 'status'}>
      <Icon name={toast.tone === 'error' ? 'alert' : toast.tone === 'success' ? 'checkCircle' : 'info'} className={styles.toastIcon} />
      <span className={styles.toastText}>{toast.message}</span>
      <button type="button" className={styles.iconButton} onClick={onDismiss} aria-label={t.toast.dismiss}>
        <Icon name="x" />
      </button>
    </div>
  )
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const counter = useRef(0)
  const t = useText()

  const dismiss = useCallback((id: number) => setItems((current) => current.filter((item) => item.id !== id)), [])
  const add = useCallback(
    (tone: Tone, message: string) => {
      counter.current += 1
      const id = counter.current
      setItems((current) => [...current.slice(-3), { id, tone, message }])
      const life = LIFETIME_MS[tone]
      if (life !== null) window.setTimeout(() => dismiss(id), life)
    },
    [dismiss],
  )

  const api = useMemo<Toasts>(() => ({ success: (message) => add('success', message), error: (message) => add('error', message), info: (message) => add('info', message) }), [add])

  // Keep them clear of the bottom navigation on a phone.
  const region = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const element = region.current
    if (!element) return
    const query = window.matchMedia('(max-width: 47.99rem)')
    const place = () => element.style.setProperty('--_toast-offset', query.matches ? 'var(--admin-bottom-nav-total)' : '0px')
    place()
    query.addEventListener('change', place)
    return () => query.removeEventListener('change', place)
  }, [])

  return (
    <Context value={api}>
      {children}
      <div ref={region} className={styles.toasts} role="region" aria-label={t.toast.region}>
        {items.map((item) => (
          <ToastNotification key={item.id} toast={item} onDismiss={() => dismiss(item.id)} />
        ))}
      </div>
    </Context>
  )
}

export function useToast(): Toasts {
  const value = useContext(Context)
  if (!value) throw new Error('useToast must be used inside <ToastProvider>')
  return value
}
