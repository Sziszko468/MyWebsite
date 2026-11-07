import { existsSync, mkdirSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createApp } from './app.ts'
import { ConfigError, loadConfig, redactedConfig } from './config.ts'
import { Database } from './db/database.ts'
import { migrate, migrationStatus } from './db/migrate.ts'
import { seedCatalog } from './db/seed.ts'
import { seedProjects } from './modules/projects/service.ts'
import { seedShopDocuments } from './modules/shop/documents.ts'
import { createLogger } from './lib/logger.ts'
import { systemClock } from './lib/time.ts'
import { createUser, findUserByEmail, listUsers, normalizeEmail, setPassword, setUserStatus } from './modules/auth/users.ts'
import { destroyUserSessions } from './modules/auth/sessions.ts'
import type { Role } from './modules/auth/permissions.ts'
import { eraseByEmail, runMaintenance } from './modules/system/maintenance.ts'

/**
 * Operator tasks, run from a terminal on the server: `node server/src/cli.ts <command>` (the npm scripts wrap
 * these). Administrator accounts are created here and nowhere else: there is no sign-up page.
 *
 *   migrate                              apply pending schema migrations
 *   seed                                 load the website's catalogue into an empty database
 *   check                                validate the configuration and print it without secrets
 *   admin create <email> [admin|editor]  create an administrator (asks for the password)
 *   admin password <email>               set a new password (and sign the account out everywhere)
 *   admin disable|enable <email>
 *   admin list
 *   backup <file>                        write a consistent copy of the database to a new file (safe while the server runs)
 *   maintenance                          remove expired sessions and, if RETENTION_DAYS is set, old finished requests
 *   erase <email>                        delete everything held about an e-mail address
 */

/** Input that has arrived but not yet been asked for: piped text can hold several answers in one chunk. */
let unread = ''

function takeLine(): string | null {
  const index = unread.indexOf('\n')
  if (index < 0) return null
  const line = unread.slice(0, index).replace(/\r$/, '')
  unread = unread.slice(index + 1)
  return line
}

function prompt(question: string, secret: boolean): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(question)
    const stdin = process.stdin
    if (!secret || !stdin.isTTY) {
      const ready = takeLine()
      if (ready !== null) return resolve(ready)
      stdin.setEncoding('utf8')
      const onData = (chunk: string) => {
        unread += chunk
        const line = takeLine()
        if (line !== null) {
          stdin.removeListener('data', onData)
          stdin.pause()
          resolve(line)
        }
      }
      stdin.on('data', onData)
      stdin.resume()
      return
    }
    // A terminal: read key by key and print nothing, so the password is not shown.
    let value = ''
    stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding('utf8')
    const onKey = (key: string) => {
      for (const char of key) {
        if (char === '\u0003') process.exit(130)
        if (char === '\r' || char === '\n') {
          stdin.setRawMode(false)
          stdin.removeListener('data', onKey)
          stdin.pause()
          process.stdout.write('\n')
          resolve(value)
          return
        }
        value = char === '\u007f' ? value.slice(0, -1) : value + char
      }
    }
    stdin.on('data', onKey)
  })
}

async function askPassword(email: string): Promise<string> {
  const fromEnv = process.env.ADMIN_PASSWORD
  if (fromEnv) return fromEnv
  const first = await prompt('Password (at least 12 characters): ', true)
  const second = await prompt('Repeat the password: ', true)
  if (first !== second) throw new Error('The two passwords are not the same.')
  void email
  return first
}

async function run(): Promise<void> {
  const [command, ...args] = process.argv.slice(2)
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

  if (command === 'check') {
    process.stdout.write(`${JSON.stringify(redactedConfig(config), null, 2)}\nConfiguration is valid.\n`)
    return
  }

  const db = new Database(config.databasePath)
  const log = createLogger({ level: config.logLevel === 'info' ? 'warn' : config.logLevel })
  try {
    if (command === 'migrate') {
      const applied = migrate(db, systemClock)
      const status = migrationStatus(db)
      process.stdout.write(applied.length > 0 ? `Applied migrations: ${applied.join(', ')}.\n` : 'The schema is up to date.\n')
      process.stdout.write(`Schema version ${status.current}.\n`)
      return
    }
    migrate(db, systemClock)
    const app = createApp({ config, db, clock: systemClock, log, mailer: null })

    switch (command) {
      case 'seed': {
        const result = seedCatalog(app.context)
        const projectSeed = seedProjects(app.context)
        const shopSeed = seedShopDocuments(app.context)
        if (shopSeed.seeded) process.stdout.write('Loaded the tier comparison and the FULL EXPERIENCE offer.' + '\n')
        if (projectSeed.seeded) process.stdout.write(`Loaded ${projectSeed.projects} projects and ${projectSeed.media} images.
`)
        process.stdout.write(result.seeded ? `Loaded ${result.services} services, ${result.packages} packages, ${result.extras} add-ons and ${result.faq} FAQ entries.\n` : 'The catalogue is not empty: nothing was changed.\n')
        return
      }
      case 'admin': {
        const [action, email, extra] = args
        if (action === 'list') {
          for (const user of listUsers(db)) process.stdout.write(`${user.email}\t${user.role}\t${user.status}\tlast sign-in: ${user.last_login_at ?? 'never'}\n`)
          return
        }
        if (!email) throw new Error('Give the administrator\'s e-mail address.')
        if (action === 'create') {
          const role = (extra ?? 'admin') as Role
          if (role !== 'admin' && role !== 'editor') throw new Error('The role must be admin or editor.')
          const user = await createUser(db, systemClock, { email, password: await askPassword(email), role })
          process.stdout.write(`Created ${role} ${user.email}.\n`)
          return
        }
        const user = findUserByEmail(db, email)
        if (!user) throw new Error(`There is no administrator ${normalizeEmail(email)}.`)
        if (action === 'password') {
          await setPassword(db, systemClock, user.id, await askPassword(email))
          const closed = destroyUserSessions(app.context, user.id)
          process.stdout.write(`Password changed for ${user.email}; ${closed} session(s) closed.\n`)
          return
        }
        if (action === 'disable' || action === 'enable') {
          setUserStatus(db, systemClock, user.id, action === 'disable' ? 'disabled' : 'active')
          if (action === 'disable') destroyUserSessions(app.context, user.id)
          process.stdout.write(`${user.email} is now ${action === 'disable' ? 'disabled' : 'active'}.\n`)
          return
        }
        throw new Error('Use: admin create|password|disable|enable <email>, or admin list.')
      }
      case 'backup': {
        const [file] = args
        if (!file) throw new Error('Give the file to write the backup to.')
        const target = resolve(file)
        if (existsSync(target)) throw new Error(`${target} already exists; choose a new file name.`)
        mkdirSync(dirname(target), { recursive: true })
        // A consistent copy of the live database in one file (WAL included), made while the server runs.
        db.run('VACUUM INTO ?', [target])
        process.stdout.write(`Backup written to ${target} (${statSync(target).size} bytes).
`)
        return
      }
      case 'maintenance': {
        process.stdout.write(`${JSON.stringify(runMaintenance(app.context), null, 2)}\n`)
        return
      }
      case 'erase': {
        const [email] = args
        if (!email) throw new Error('Give the e-mail address to erase.')
        const confirm = await prompt(`Delete every message, request and delivery record held for ${normalizeEmail(email)}? Type yes: `, false)
        if (confirm.trim().toLowerCase() !== 'yes') throw new Error('Cancelled.')
        process.stdout.write(`${JSON.stringify(eraseByEmail(app.context, email), null, 2)}\n`)
        return
      }
      default:
        process.stdout.write('Commands: migrate, seed, check, admin create|password|disable|enable|list, backup, maintenance, erase. See server/src/cli.ts.\n')
        process.exitCode = command ? 2 : 0
    }
  } finally {
    db.close()
  }
}

run().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
