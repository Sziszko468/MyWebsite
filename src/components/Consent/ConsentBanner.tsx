import { useSyncExternalStore } from 'react'
import { consentActions, consentStore, promptStore } from '../../analytics/consent'
import { measurementIsOffered } from '../../analytics/offer'
import { siteConfig } from '../../config/site'
import { useI18n } from '../../i18n/useI18n'
import { Button } from '../Button/Button'
import { LocalizedLink } from '../LocalizedLink/LocalizedLink'
import styles from './ConsentBanner.module.scss'

/**
 * The question about measurement. It appears only when the owner has set up a destination for events (so on
 * a site that measures nothing there is nothing to ask), until the visitor answers, and again when they ask
 * for it from the footer. Accepting and declining are the same kind of button and sit side by side; the band
 * is not a dialog, takes no focus and blocks nothing.
 */
export function ConsentBanner() {
  const { t } = useI18n()
  const consent = useSyncExternalStore(consentStore.subscribe, consentStore.get, () => 'unknown' as const)
  const reopened = useSyncExternalStore(promptStore.subscribe, promptStore.get, () => false)
  if (!measurementIsOffered() || (consent !== 'unknown' && !reopened)) return null

  const privacyPath = siteConfig.legal.find((entry) => entry.id === 'privacy')?.path ?? null
  return (
    <section className={styles.banner} aria-label={t.consent.region}>
      <div>
        <p className={styles.title}>{t.consent.title}</p>
        <p className={styles.text}>{t.consent.text}</p>
        {privacyPath && (
          <LocalizedLink to={privacyPath} className={styles.link}>
            {t.consent.details}
          </LocalizedLink>
        )}
      </div>
      <div className={styles.actions}>
        <Button variant="secondary" onClick={consentActions.deny}>
          {t.consent.decline}
        </Button>
        <Button variant="secondary" onClick={consentActions.grant}>
          {t.consent.accept}
        </Button>
      </div>
    </section>
  )
}

/** The footer's way back to the question. Renders nothing while there is nothing to ask. */
export function MeasurementSettingsButton({ className }: { className?: string }) {
  const { t } = useI18n()
  useSyncExternalStore(consentStore.subscribe, consentStore.get, () => 'unknown' as const)
  if (!measurementIsOffered()) return null
  return (
    <button type="button" className={className} onClick={consentActions.reopen}>
      {t.consent.settings}
    </button>
  )
}
