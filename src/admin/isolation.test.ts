import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The administration and the website are two pages built from one project. The website must never load the
 * administration (its code, its texts, its endpoints), and the administration takes from the website only what is
 * shared on purpose, so the visitors' bundle stays what it was and the owner's tool stays small.
 */

const SRC = join(process.cwd(), 'src')
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return files(path)
    return /\.(ts|tsx|scss|css)$/.test(name) ? [path] : []
  })
const posix = (path: string) => relative(SRC, path).split(sep).join('/')

const importsOf = (text: string) => [...text.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]|@use\s+['"]([^'"]+)['"]/g)].map((m) => m[1] ?? m[2])

describe('the website does not load the administration', () => {
  const site = files(SRC).filter((file) => !posix(file).startsWith('admin/'))

  it('nothing outside src/admin imports from it', () => {
    const offenders = site.filter((file) => importsOf(readFileSync(file, 'utf8')).some((spec) => /(^|\/)admin(\/|$)/.test(spec) && spec.startsWith('.'))).map(posix)
    expect(offenders).toEqual([])
  })

  it('the website’s entry points never mention the administration’s address', () => {
    for (const entry of ['main.tsx', 'App.tsx']) {
      expect(readFileSync(join(SRC, entry), 'utf8')).not.toMatch(/\/admin\b|api\/admin/)
    }
  })
})

/** What the administration may take from the rest of the project (as paths below src): the shared design, the theme, small helpers, the language list. */
const SHARED = [/^utils\//, /^i18n\/config$/, /^theme\//, /^components\/Button\/Button$/, /^styles\/(mixins|tokens\.css|motion\.css|global\.scss)$/, /^test\/tokens$/]

/** Where an import points, as a path below src (`null` for a package). */
const target = (file: string, spec: string): string | null => (spec.startsWith('.') ? relative(SRC, resolve(dirname(file), spec)).split(sep).join('/') : null)

describe('the administration takes only the shared parts of the website', () => {
  const admin = files(join(SRC, 'admin'))
  const leaving = admin.flatMap((file) =>
    importsOf(readFileSync(file, 'utf8')).flatMap((spec) => {
      const path = target(file, spec)
      return path !== null && !path.startsWith('admin/') && path !== 'admin' ? [{ file: posix(file), spec, path }] : []
    }),
  )

  it('every import that leaves src/admin is one of the shared parts', () => {
    expect(leaving.filter(({ path }) => !SHARED.some((pattern) => pattern.test(path))).map(({ file, spec }) => `${file} → ${spec}`)).toEqual([])
  })

  it('so it never reaches the website’s pages, the lab, the shop, the analytics or three.js', () => {
    expect(leaving.filter(({ path }) => /^(pages|routes|shop|analytics|components\/(lab|shop|hero))(\/|$)/.test(path)).map(({ file, spec }) => `${file} → ${spec}`)).toEqual([])
    const packages = admin.flatMap((file) => importsOf(readFileSync(file, 'utf8')).filter((spec) => /^three$|@react-three/.test(spec)))
    expect(packages).toEqual([])
  })
})
