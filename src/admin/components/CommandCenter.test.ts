import { createElement as h, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import type { OperationsData } from '../api/types'
import { AdminTextProvider, formatDateTime } from '../i18n'
import { en } from '../i18n/en'
import { hu } from '../i18n/hu'
import { BACKUP_ERROR_CATEGORIES, attentionOf, backupErrorText, formatBytes } from '../lib/operations'
import { AssistantPanel, BackupPanel, CommandCenter, DatabasePanel, DeploymentPanel, EmailPanel, NetworkPanel } from './CommandCenter'

/** The Operations part of the System page, drawn on the server in the administration's own providers, in each of its two languages. */

const render = (node: ReactElement, language: 'en' | 'hu' = 'en'): string => renderToStaticMarkup(h(MemoryRouter, null, h(AdminTextProvider, { language, children: node })))
const AT = '2026-11-15T10:30:00.000Z'
const SHA = 'a1b2c3d4'.repeat(8)

const base: OperationsData = {
  backup: { enabled: true, encrypted: true, state: 'ok', staleAfterHours: 30, lastSuccess: { finishedAt: AT, ageHours: 5.5, folder: '2026-11-15', fileCount: 12, totalBytes: 5_242_880, databaseSha256: SHA, manifestSha256: 'f0e1d2c3'.repeat(8), encrypted: true, trigger: 'scheduled' }, lastAttempt: { status: 'success', startedAt: AT, finishedAt: AT, errorCategory: null, httpStatus: null, trigger: 'scheduled' } },
  migrations: { current: 40, latest: 40, pending: 0, snapshots: { enabled: true, retentionDays: 14, count: 2, newestAt: AT, newestBytes: 1000 } },
  disk: { available: true, freeBytes: 8 * 1024 ** 3, totalBytes: 10 * 1024 ** 3, freePercent: 80, databaseBytes: 3_145_728, low: false },
  email: { provider: 'smtp', enabled: true, paused: false, fromSet: true, replyToSet: false, notifyToSet: true, webhookSecretSet: false, deliveries: { pending: 1, failed: 2, accepted: 30, delivered: 0, bounced: 0 }, lastFailureAt: AT, checks: { checkedAt: AT, states: { verified: 4, not_verified: 2, unknown: 1 }, items: [{ id: 'spf', state: 'verified' }, { id: 'dkim', state: 'not_verified' }] } },
  assistant: { operatorEnabled: true, apiKeySet: true, model: 'claude-haiku-5-5', verification: 'verified', verifiedAt: AT, checkedAt: AT, failureReason: null, available: true, unavailableReason: null },
  network: { clientIp: '203.0.113.9', socketAddress: '10.0.0.4', forwardedFor: ['203.0.113.9', '198.51.100.7'], cloudflareConnectingIp: '203.0.113.9', trustProxy: 2, verdict: 'matches_cloudflare_header', measuredTrustProxy: 2 },
  deployment: { commit: 'abcdef1234567890abcdef1234567890abcdef12', shortCommit: 'abcdef123456', source: 'RENDER_GIT_COMMIT', service: 'my-website', environment: 'production', startedAt: AT },
}
const withBackup = (changes: Partial<OperationsData['backup']>): OperationsData['backup'] => ({ ...base.backup, ...changes })

describe('the backup panel', () => {
  it('shows the latest success with its age, what it holds, the encryption and both hashes', () => {
    const html = render(h(BackupPanel, { backup: base.backup }))
    expect(html).toContain(en.settings.operations.backup.states.ok)
    expect(html).toContain(formatDateTime(AT, 'en'))
    expect(html).toContain('5.5 hours ago')
    expect(html).toContain('12 files, 5 MB stored')
    expect(html).toContain(en.settings.operations.backup.encrypted)
    expect(html).toContain(SHA)
    expect(html).toContain('2026-11-15')
    expect(html).not.toContain(en.settings.operations.backup.staleWarning.slice(0, 20))
  })

  it('warns when the latest success is stale, in words an operator can act on', () => {
    const html = render(h(BackupPanel, { backup: withBackup({ state: 'stale', lastSuccess: { ...base.backup.lastSuccess!, ageHours: 52 } }) }))
    expect(html).toContain(en.settings.operations.backup.states.stale)
    expect(html).toContain('more than 30 hours old')
    expect(html).toContain('noticeDanger')
  })

  it('says there is no backup yet, and warns, when it is set up and has never succeeded', () => {
    const html = render(h(BackupPanel, { backup: withBackup({ state: 'never', lastSuccess: null, lastAttempt: null }) }))
    expect(html).toContain(en.settings.operations.backup.states.never)
    expect(html).toContain(en.settings.operations.backup.none)
    expect(html).toContain(en.settings.operations.backup.neverWarning.slice(0, 30))
  })

  it('says it is not set up, without a warning, when there is no Google Drive configuration', () => {
    const html = render(h(BackupPanel, { backup: withBackup({ enabled: false, state: 'disabled', lastSuccess: null, lastAttempt: null }) }))
    expect(html).toContain(en.settings.operations.backup.states.disabled)
    expect(html).toContain(en.settings.operations.backup.disabledHelp)
    expect(html).not.toContain('noticeDanger')
  })

  it('shows a failed attempt beside the last success, with the reason worded in the administrator’s language and never as the raw category', () => {
    const attempt = { status: 'failed' as const, startedAt: AT, finishedAt: AT, errorCategory: 'drive_auth', httpStatus: 401, trigger: 'startup' as const }
    const english = render(h(BackupPanel, { backup: withBackup({ lastAttempt: attempt }) }))
    expect(english).toContain(en.settings.operations.backup.errors.drive_auth.replace(/’/g, '&#x27;'))
    expect(english).toContain('the catch-up after a start')
    expect(english).not.toContain('drive_auth')
    const hungarian = render(h(BackupPanel, { backup: withBackup({ lastAttempt: attempt }) }), 'hu')
    expect(hungarian).toContain(hu.settings.operations.backup.errors.drive_auth)
    expect(hungarian).toContain('az indítás utáni pótlás')
  })

  it('draws an encrypted and an unencrypted latest backup differently, and shows the running state', () => {
    expect(render(h(BackupPanel, { backup: withBackup({ lastSuccess: { ...base.backup.lastSuccess!, encrypted: false } }) }))).toContain(en.settings.operations.backup.notEncrypted)
    expect(render(h(BackupPanel, { backup: withBackup({ state: 'running', lastAttempt: { ...base.backup.lastAttempt!, status: 'running', finishedAt: null } }) }))).toContain(en.settings.operations.backup.states.running)
  })

  it.each([...BACKUP_ERROR_CATEGORIES, 'something_new'])('words the failure %s in both languages and never as the raw code', (category) => {
    for (const language of ['en', 'hu'] as const) {
      const html = render(h(BackupPanel, { backup: withBackup({ lastAttempt: { status: 'failed', startedAt: AT, finishedAt: AT, errorCategory: category, httpStatus: null, trigger: 'scheduled' } }) }), language)
      // The code itself (drive_http, something_new, …) is never shown; a plain word that is also a code (snapshot) is part of its sentence.
      if (category.includes('_')) expect(html, `${language} ${category}`).not.toContain(category)
      expect(html).not.toContain(`>${category}<`)
    }
  })

  it('has a sentence for every failure category the server records, in both languages, each its own', () => {
    for (const dictionary of [en, hu]) {
      const sentences = BACKUP_ERROR_CATEGORIES.map((category) => backupErrorText(dictionary, category))
      expect(new Set(sentences).size).toBe(BACKUP_ERROR_CATEGORIES.length)
      expect(sentences).not.toContain(dictionary.settings.operations.backup.errors.unknown)
    }
    for (const unknown of [null, 'something_new', 'constructor', '__proto__']) expect(backupErrorText(en, unknown)).toBe(en.settings.operations.backup.errors.unknown)
  })
})

describe('the database and disk panel', () => {
  it('shows the schema, the snapshots, the database file and the free space', () => {
    const html = render(h(DatabasePanel, { migrations: base.migrations, disk: base.disk }))
    expect(html).toContain('40 of 40')
    expect(html).toContain('2 kept for 14 days')
    expect(html).toContain('3 MB')
    expect(html).toContain('8 GB of 10 GB (80 %)')
    expect(html).not.toContain('noticeDanger')
  })

  it('shows pending migrations, switched-off snapshots, and a low-space warning', () => {
    const html = render(h(DatabasePanel, { migrations: { ...base.migrations, current: 38, pending: 2, snapshots: { ...base.migrations.snapshots, enabled: false } }, disk: { ...base.disk, freeBytes: 100 * 1024 ** 2, freePercent: 3, low: true } }))
    expect(html).toContain('38 of 40, 2 pending')
    expect(html).toContain(en.settings.operations.database.snapshotsOff)
    expect(html).toContain(en.settings.operations.database.diskLow)
    expect(html).toContain('noticeDanger')
  })

  it('says the disk is not measured for an in-memory database, and speaks Hungarian', () => {
    expect(render(h(DatabasePanel, { migrations: base.migrations, disk: { available: false, freeBytes: null, totalBytes: null, freePercent: null, databaseBytes: null, low: false } }))).toContain(en.settings.operations.database.diskUnknown)
    const html = render(h(DatabasePanel, { migrations: base.migrations, disk: base.disk }), 'hu')
    expect(html).toContain(hu.settings.operations.database.title)
    expect(html).toContain('40 / 40')
  })
})

describe('the e-mail and assistant panels', () => {
  it('show the set-up as facts, the delivery counts and what the checks found, and warn that sending is not proof of delivery while a check is open', () => {
    const html = render(h(EmailPanel, { email: base.email }))
    expect(html).toContain(en.settings.operations.email.sendingStates.on)
    expect(html).toContain('sender Yes, reply-to No, owner notices Yes')
    expect(html).toContain('1 waiting, 30 accepted by the provider, 0 delivered (confirmed by the provider), 0 bounced, 2 failed')
    expect(html).toContain('4 verified, 2 not verified, 1 unknown')
    expect(html).toContain(en.settings.operations.email.warning.slice(0, 30))
  })

  it('say the checks have not run, and that sending is off or paused, without warning for a provider that is not set up', () => {
    expect(render(h(EmailPanel, { email: { ...base.email, checks: null } }))).toContain(en.settings.operations.email.checksNotRun)
    expect(render(h(EmailPanel, { email: { ...base.email, paused: true } }))).toContain(en.settings.operations.email.sendingStates.paused)
    const off = render(h(EmailPanel, { email: { ...base.email, provider: 'none', checks: null } }))
    expect(off).toContain(en.settings.operations.email.sendingStates.off)
    expect(off).not.toContain(en.settings.operations.email.warning.slice(0, 30))
  })

  it('show the assistant’s verification state and why it is not available', () => {
    expect(render(h(AssistantPanel, { assistant: base.assistant }))).toContain(en.settings.operations.assistant.states.verified)
    const html = render(h(AssistantPanel, { assistant: { ...base.assistant, verification: 'unverified', verifiedAt: null, available: false, unavailableReason: 'model_unverified' } }), 'hu')
    expect(html).toContain(hu.settings.operations.assistant.states.unverified)
    expect(html).toContain(hu.settings.operations.assistant.reasons.model_unverified)
  })
})

describe('the network and deployment panels', () => {
  it('shows the address the application uses, what the request carried, and says when the setting fits', () => {
    const html = render(h(NetworkPanel, { network: base.network }))
    expect(html).toContain('<strong>203.0.113.9</strong>')
    expect(html).toContain('203.0.113.9, 198.51.100.7')
    expect(html).toContain(en.settings.operations.network.verdicts.matches_cloudflare_header)
    expect(html).not.toContain('noticeWarning')
  })

  it('warns that every visitor may share one address when the setting does not fit, and shows the value that would', () => {
    const html = render(h(NetworkPanel, { network: { ...base.network, clientIp: '10.0.0.4', trustProxy: 0, verdict: 'differs_from_cloudflare_header', measuredTrustProxy: 2 } }))
    expect(html).toContain(en.settings.operations.network.verdicts.differs_from_cloudflare_header.slice(0, 40))
    expect(html).toContain('noticeWarning')
    expect(html).toContain(en.settings.operations.network.measured)
  })

  it('puts an address in the page as text, never as markup', () => {
    const html = render(h(NetworkPanel, { network: { ...base.network, forwardedFor: ['<img src=x onerror=alert(1)>'] } }))
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img')
  })

  it('shows the commit the host reports, shortened with the full one on hover, and says so when the host does not report one', () => {
    expect(render(h(DeploymentPanel, { deployment: base.deployment }))).toContain('title="abcdef1234567890abcdef1234567890abcdef12">abcdef123456</code>')
    const none = render(h(DeploymentPanel, { deployment: { ...base.deployment, commit: null, shortCommit: null, source: null, service: null } }))
    expect(none).toContain(en.settings.operations.deployment.unknown)
    expect(none).not.toContain(en.settings.operations.deployment.service)
  })
})

describe('the whole Operations part', () => {
  it('draws every panel in order, in both languages', () => {
    for (const [language, dictionary] of [['en', en], ['hu', hu]] as const) {
      const html = render(h(CommandCenter, { data: base }), language)
      const o = dictionary.settings.operations
      const positions = [o.backup.title, o.database.title, o.email.title, o.assistant.title, o.network.title, o.deployment.title].map((title) => html.indexOf(`>${title}<`))
      expect(positions.every((index) => index > 0), language).toBe(true)
      expect([...positions].sort((a, b) => a - b)).toEqual(positions)
    }
  })

  it('shows nothing a secret or a customer would be: only the fields it is given', () => {
    const html = render(h(CommandCenter, { data: { ...base, ...({ appSecret: 'SECRET-VALUE', customer: 'private@example.org' } as object) } }))
    expect(html).not.toContain('SECRET-VALUE')
    expect(html).not.toContain('private@example.org')
  })

  it('says what asks for attention: a stale or failing backup, low disk, pending migrations, open e-mail checks, a mismatched proxy setting', () => {
    expect(attentionOf(base)).toEqual(['email'])
    expect(attentionOf({ ...base, email: { ...base.email, checks: { checkedAt: AT, states: { verified: 5 }, items: [{ id: 'spf', state: 'verified' }] } } })).toEqual([])
    expect(attentionOf({ ...base, backup: withBackup({ state: 'stale' }), disk: { ...base.disk, low: true }, migrations: { ...base.migrations, pending: 1 }, network: { ...base.network, verdict: 'differs_from_cloudflare_header' }, assistant: { ...base.assistant, verification: 'failed' } })).toEqual(['backup', 'disk', 'migrations', 'email', 'network', 'assistant'])
    expect(attentionOf({ ...base, backup: withBackup({ enabled: false, state: 'disabled' }) })).not.toContain('backup')
    expect(attentionOf({ ...base, backup: withBackup({ lastAttempt: { ...base.backup.lastAttempt!, status: 'failed' } }) })).toContain('backup')
  })

  it('formats sizes the way people read them, in both languages', () => {
    expect(formatBytes(0, 'en')).toBe('0 B')
    expect(formatBytes(1023, 'en')).toBe('1,023 B')
    expect(formatBytes(1536, 'en')).toBe('2 KB')
    expect(formatBytes(5_242_880, 'en')).toBe('5 MB')
    expect(formatBytes(1_610_612_736, 'en')).toBe('1.5 GB')
    expect(formatBytes(1_610_612_736, 'hu')).toBe('1,5 GB')
  })
})
