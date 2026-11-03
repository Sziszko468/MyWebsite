import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AppContext } from '../context.ts'
import { insertContent, insertExtra, insertPackage, insertService, parseContent, parseExtra, parsePackage, parseService } from '../modules/catalog/admin.ts'
import { isRecord } from '../lib/text.ts'

/**
 * Loads the website's catalogue (server/seed/catalog.seed.json, written from the static content by
 * `npm run catalog:seed-export`) into an **empty** catalogue. Every entry goes through the same validation as an
 * administrator's edit, so a seed that breaks a rule (a published price without a VAT mode, a missing translation)
 * fails loudly instead of loading half. It never overwrites: once the catalogue has rows, the database is the
 * master copy and the administrator's edits are not touched.
 */

export const SEED_FILE = join(import.meta.dirname, '..', '..', 'seed', 'catalog.seed.json')

export interface SeedResult {
  seeded: boolean
  extras: number
  packages: number
  services: number
  faq: number
}

const records = (value: unknown, what: string): Record<string, unknown>[] => {
  if (!Array.isArray(value) || !value.every(isRecord)) throw new Error(`The seed file has no valid "${what}" list.`)
  return value
}

export function seedCatalog(app: AppContext, file = SEED_FILE): SeedResult {
  const existing = app.db.get<{ n: number }>('SELECT (SELECT COUNT(*) FROM services) + (SELECT COUNT(*) FROM packages) + (SELECT COUNT(*) FROM extras) AS n')?.n ?? 0
  if (existing > 0) return { seeded: false, extras: 0, packages: 0, services: 0, faq: 0 }
  const data: unknown = JSON.parse(readFileSync(file, 'utf8'))
  if (!isRecord(data)) throw new Error('The seed file is not an object.')
  const extras = records(data.extras, 'extras')
  const packs = records(data.packages, 'packages')
  const services = records(data.services, 'services')
  const faq = records(data.faq, 'faq')
  // One transaction: the catalogue is loaded whole or not at all. Extras first, then packages (which point at them), then services.
  app.db.transaction(() => {
    for (const item of extras) insertExtra(app, parseExtra(item))
    for (const item of packs) insertPackage(app, parsePackage(item))
    for (const item of services) insertService(app, parseService(item))
    for (const item of faq) insertContent(app, parseContent(item))
  })
  return { seeded: true, extras: extras.length, packages: packs.length, services: services.length, faq: faq.length }
}
