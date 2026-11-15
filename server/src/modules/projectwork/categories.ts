import type { Language } from '../../config.ts'
import type { AppContext } from '../../context.ts'
import { notFound, validationFailed } from '../../http/errors.ts'
import { newId } from '../../lib/crypto.ts'
import { iso } from '../../lib/time.ts'
import { refuse } from '../customers/projects.ts'
import { LANGUAGE_LIST } from './model.ts'

/**
 * The categories of a task are DATA the owner manages (a code and a name in each language), never a list in a screen's code. A category in use is disabled, not
 * deleted, so the tasks that carry it keep their word; one nobody uses can go. "Add the suggested set" puts the usual ones in, once, and never changes one that exists.
 */

export interface CategoryRow {
  id: string
  code: string
  enabled: 0 | 1
  sort_order: number
  created_at: string
  updated_at: string
}

export interface CategoryView {
  id: string
  code: string
  enabled: boolean
  sortOrder: number
  names: Record<Language, string>
  /** How many tasks carry it. */
  used: number
}

export const CODE = /^[a-z0-9]+(-[a-z0-9]+)*$/

/** What "add the suggested set" adds: the work a small web studio does. The owner renames, disables or removes any of it. */
export const SUGGESTED_CATEGORIES: ReadonlyArray<{ code: string; names: Record<Language, string> }> = [
  { code: 'design', names: { hu: 'Dizájn', en: 'Design', nl: 'Ontwerp' } },
  { code: 'development', names: { hu: 'Fejlesztés', en: 'Development', nl: 'Ontwikkeling' } },
  { code: 'content', names: { hu: 'Tartalom', en: 'Content', nl: 'Inhoud' } },
  { code: 'review', names: { hu: 'Átnézés', en: 'Review', nl: 'Beoordeling' } },
  { code: 'feedback', names: { hu: 'Visszajelzés', en: 'Feedback', nl: 'Feedback' } },
  { code: 'hosting', names: { hu: 'Tárhely és domain', en: 'Hosting and domain', nl: 'Hosting en domein' } },
  { code: 'administration', names: { hu: 'Ügyintézés', en: 'Administration', nl: 'Administratie' } },
]

export function listCategories(app: Pick<AppContext, 'db'>, options: { onlyEnabled?: boolean } = {}): CategoryView[] {
  const rows = app.db.all<CategoryRow & { used: number }>(
    `SELECT c.*, (SELECT COUNT(*) FROM project_tasks t WHERE t.category_id = c.id) AS used FROM task_categories c ${options.onlyEnabled ? 'WHERE c.enabled = 1' : ''} ORDER BY c.sort_order, c.code`,
  )
  const names = app.db.all<{ category_id: string; language: Language; name: string }>('SELECT category_id, language, name FROM task_category_names')
  return rows.map((row) => {
    const own = names.filter((entry) => entry.category_id === row.id)
    const pick = (lang: Language): string => own.find((entry) => entry.language === lang)?.name ?? own.find((entry) => entry.language === 'en')?.name ?? row.code
    return { id: row.id, code: row.code, enabled: row.enabled === 1, sortOrder: row.sort_order, names: { hu: pick('hu'), en: pick('en'), nl: pick('nl') }, used: row.used }
  })
}

export const getCategory = (app: Pick<AppContext, 'db'>, id: string): CategoryRow | undefined => app.db.get<CategoryRow>('SELECT * FROM task_categories WHERE id = ?', [id])

function writeNames(app: Pick<AppContext, 'db'>, id: string, names: Record<Language, string>): void {
  app.db.run('DELETE FROM task_category_names WHERE category_id = ?', [id])
  for (const lang of LANGUAGE_LIST) app.db.run('INSERT INTO task_category_names (category_id, language, name) VALUES (?, ?, ?)', [id, lang, names[lang]])
}

export function createCategory(app: AppContext, input: { code: string; names: Record<Language, string>; sortOrder?: number }): string {
  return app.db.transaction(() => {
    if (!CODE.test(input.code) || input.code.length < 2 || input.code.length > 40) throw validationFailed({ code: 'invalid' })
    if (app.db.get('SELECT 1 FROM task_categories WHERE code = ?', [input.code])) throw validationFailed({ code: 'duplicate' })
    const id = newId()
    const now = iso(app.clock.now())
    const order = input.sortOrder ?? (app.db.get<{ n: number }>('SELECT COALESCE(MAX(sort_order), 0) + 10 AS n FROM task_categories')?.n ?? 10)
    app.db.run('INSERT INTO task_categories (id, code, enabled, sort_order, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?)', [id, input.code, order, now, now])
    writeNames(app, id, input.names)
    return id
  })
}

export function updateCategory(app: AppContext, id: string, changes: { names?: Record<Language, string>; enabled?: boolean; sortOrder?: number }): void {
  app.db.transaction(() => {
    if (!getCategory(app, id)) throw notFound('The category')
    const now = iso(app.clock.now())
    if (changes.enabled !== undefined) app.db.run('UPDATE task_categories SET enabled = ?, updated_at = ? WHERE id = ?', [changes.enabled ? 1 : 0, now, id])
    if (changes.sortOrder !== undefined) app.db.run('UPDATE task_categories SET sort_order = ?, updated_at = ? WHERE id = ?', [changes.sortOrder, now, id])
    if (changes.names) {
      writeNames(app, id, changes.names)
      app.db.run('UPDATE task_categories SET updated_at = ? WHERE id = ?', [now, id])
    }
  })
}

export function deleteCategory(app: AppContext, id: string): void {
  app.db.transaction(() => {
    if (!getCategory(app, id)) throw notFound('The category')
    const used = app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM project_tasks WHERE category_id = ?', [id])?.n ?? 0
    if (used > 0) throw refuse('A category that tasks carry cannot be deleted; switch it off instead.', 'category_in_use')
    app.db.run('DELETE FROM task_categories WHERE id = ?', [id])
  })
}

/** Adds the suggested categories that do not exist yet (by code) and touches nothing that does. Returns how many were added. */
export function addSuggestedCategories(app: AppContext): number {
  return app.db.transaction(() => {
    let added = 0
    for (const entry of SUGGESTED_CATEGORIES) {
      if (app.db.get('SELECT 1 FROM task_categories WHERE code = ?', [entry.code])) continue
      createCategory(app, { code: entry.code, names: entry.names })
      added += 1
    }
    return added
  })
}
