import { createApp } from './app.ts'
import { ConfigError, loadConfig } from './config.ts'
import { Database } from './db/database.ts'
import { migrate, migrationStatus } from './db/migrate.ts'
import { seedCatalog } from './db/seed.ts'
import { seedProjects } from './modules/projects/service.ts'
import { seedShopDocuments } from './modules/shop/documents.ts'
import { createLogger } from './lib/logger.ts'
import { DAY, systemClock } from './lib/time.ts'
import { createMailer } from './modules/notifications/mailer.ts'
import { runMaintenance } from './modules/system/maintenance.ts'

/**
 * Starts the server: read and check the configuration, open the database, bring the schema up to date, load the
 * catalogue into an empty database, listen. It stops on the first thing that is wrong, with a message that says
 * what, because a server that starts half-configured is worse than one that does not start.
 */

async function main(): Promise<void> {
  let config
  try {
    config = loadConfig()
  } catch (error) {
    if (error instanceof ConfigError) {
      process.stderr.write(`${error.message}\n`)
      process.exit(78)
    }
    throw error
  }
  const log = createLogger({ level: config.logLevel })

  const db = new Database(config.databasePath)
  if (config.migrateOnStart) {
    const applied = migrate(db, systemClock)
    if (applied.length > 0) log.info('migrations applied', { versions: applied })
  } else if (migrationStatus(db).pending > 0) {
    log.error('the database has pending migrations; run `npm run server:migrate` (or set MIGRATE_ON_START=true)')
    process.exit(1)
  }

  const app = createApp({ config, db, clock: systemClock, log, mailer: createMailer(config.email) })
  if (config.seedOnStart) {
    const seeded = seedCatalog(app.context)
    if (seeded.seeded) log.info('catalogue loaded into an empty database', { services: seeded.services, packages: seeded.packages, extras: seeded.extras, faq: seeded.faq })
    // The portfolio is seeded on its own: a database that already holds a catalogue still gets the website's projects once.
    const projects = seedProjects(app.context)
    if (projects.seeded) log.info('projects loaded into an empty table', { projects: projects.projects, media: projects.media })
    // The tier comparison and the FULL EXPERIENCE offer, once, after the packages they are about exist.
    const shop = seedShopDocuments(app.context)
    if (shop.seeded) log.info('shop documents loaded into an empty table', { documents: shop.documents })
  }
  if (config.env === 'production' && config.retentionDays === null) log.warn('RETENTION_DAYS is not set: closed and archived requests are kept until an administrator deletes them')
  if (config.email.provider !== 'none' && !config.email.notifyTo) log.warn('e-mail is configured but NOTIFY_TO is not set: the owner will not be notified of new messages')
  if (config.email.provider !== 'none' && !config.email.enabled) log.warn('e-mail sending is paused (EMAIL_ENABLED=false): nothing will be sent until it is switched on')
  if (config.email.provider === 'resend' && !config.email.webhookSecret) log.warn('EMAIL_WEBHOOK_SECRET is not set: messages can be sent but never shown as delivered or bounced')
  if (config.email.provider !== 'none' && !config.email.replyTo) log.warn('EMAIL_REPLY_TO is not set: a customer who replies will reach the sender address')

  await new Promise<void>((resolve, reject) => {
    app.server.once('error', reject)
    app.server.listen(config.port, config.host, () => resolve())
  })
  app.start()
  const address = app.server.address()
  log.info('server listening', { host: config.host, port: typeof address === 'object' && address ? address.port : config.port, env: config.env, mailer: config.email.provider, database: config.databasePath === ':memory:' ? 'memory' : 'file' })

  const maintenance = setInterval(() => {
    try {
      const result = runMaintenance(app.context)
      log.info('maintenance', { ...result })
    } catch (error) {
      log.error('maintenance failed', { error })
    }
  }, DAY)
  maintenance.unref()

  let stopping = false
  const stop = async (reason: string, code: number) => {
    if (stopping) return
    stopping = true
    log.info('shutting down', { reason })
    const force = setTimeout(() => process.exit(code || 1), 10_000)
    force.unref()
    clearInterval(maintenance)
    await app.close().catch((error) => log.error('error while closing', { error }))
    db.close()
    process.exit(code)
  }
  process.on('SIGTERM', () => void stop('SIGTERM', 0))
  process.on('SIGINT', () => void stop('SIGINT', 0))
  process.on('unhandledRejection', (error) => {
    log.error('unhandled rejection', { error })
    void stop('unhandledRejection', 1)
  })
  process.on('uncaughtException', (error) => {
    log.error('uncaught exception', { error })
    void stop('uncaughtException', 1)
  })
}

main().catch((error) => {
  process.stderr.write(`The server could not start: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
