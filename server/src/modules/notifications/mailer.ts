import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { EmailConfig } from '../../config.ts'
import { buildMime, type MailMessage } from './mime.ts'
import { createResendMailer, type FetchLike } from './resend.ts'
import { sendSmtp } from './smtp.ts'

/**
 * A way of sending a message. `send` resolves when the provider has **accepted** the message and throws a
 * `MailError` (smtp.ts) when it did not; it never says "delivered", because no provider can promise that (only a
 * verified provider event can, see webhook.ts). The outbox (notifier.ts) decides what a failure means (try again, or
 * give up). Everything that sends goes through this one interface: no feature calls a provider itself, so changing
 * provider is a change in this file and its siblings, not in the features.
 */
export interface Mailer {
  readonly name: string
  send(message: MailMessage): Promise<{ providerMessageId: string | null }>
}

export function createMailer(config: EmailConfig, fetchImpl?: FetchLike): Mailer | null {
  // Paused on purpose (EMAIL_ENABLED=false): configured, not sending.
  if (config.enabled === false) return null
  if (config.provider === 'resend' && config.apiKey) return createResendMailer(config, fetchImpl)
  if (config.provider === 'smtp' && config.smtp) {
    const smtp = config.smtp
    return {
      name: 'smtp',
      async send(message) {
        const result = await sendSmtp(smtp, message)
        return { providerMessageId: result.response || null }
      },
    }
  }
  if (config.provider === 'file' && config.fileDirectory) {
    const directory = config.fileDirectory
    return {
      name: 'file',
      async send(message) {
        mkdirSync(directory, { recursive: true })
        const name = `${message.date.toISOString().replace(/[:.]/g, '-')}-${message.messageId.split('@')[0].replace(/[^A-Za-z0-9-]/g, '')}.eml`
        writeFileSync(join(directory, name), buildMime(message))
        return { providerMessageId: name }
      },
    }
  }
  return null
}
