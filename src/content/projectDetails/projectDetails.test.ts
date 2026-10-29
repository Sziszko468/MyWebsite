// This test reads the picture files, so it alone needs Node's types.
/// <reference types="node" />
import { readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { LANGUAGES } from '../../i18n/config'
import { projects } from '../projects'
import { getProjectDetail, neighbours, projectDetails, publishedProjects } from './index'
import { projectMeta } from './meta'
import type { ProjectDetail } from './types'

const details = Object.values(projectDetails) as ProjectDetail[]

/** Every `Trilingual` value in the data, with the path it was found at. */
function trilinguals(value: unknown, path = ''): Array<[string, Record<string, string>]> {
  if (Array.isArray(value)) return value.flatMap((item, index) => trilinguals(item, `${path}[${index}]`))
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    if (typeof record.hu === 'string' && typeof record.en === 'string' && typeof record.nl === 'string') {
      return [[path, record as Record<string, string>]]
    }
    return Object.entries(record).flatMap(([key, child]) => trilinguals(child, path ? `${path}.${key}` : key))
  }
  return []
}

/** Every plain string in the data, for the checks that apply to all text. */
function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(strings)
  if (value && typeof value === 'object') return Object.values(value).flatMap(strings)
  return []
}

/** The pixel size written in a WebP file's header (lossy, lossless and extended forms). */
function webpSize(file: Buffer): { width: number; height: number } {
  expect(file.toString('ascii', 0, 4)).toBe('RIFF')
  expect(file.toString('ascii', 8, 12)).toBe('WEBP')
  const kind = file.toString('ascii', 12, 16)
  if (kind === 'VP8 ') return { width: file.readUInt16LE(26) & 0x3fff, height: file.readUInt16LE(28) & 0x3fff }
  if (kind === 'VP8L') {
    const bits = file.readUInt32LE(21)
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }
  }
  if (kind === 'VP8X') return { width: file.readUIntLE(24, 3) + 1, height: file.readUIntLE(27, 3) + 1 }
  throw new Error(`unknown WebP chunk ${kind}`)
}

const publicFile = (src: string) => fileURLToPath(new URL(`../../../public${src}`, import.meta.url))

describe('which projects have a page', () => {
  it('has search meta for exactly the projects that have details', () => {
    expect(Object.keys(projectMeta).sort()).toEqual(Object.keys(projectDetails).sort())
  })

  it('has details for exactly the projects that have a details path, and none for the rest', () => {
    for (const project of projects) {
      expect(getProjectDetail(project.id) !== undefined, project.id).toBe(project.detailPath !== null)
    }
  })

  it('keeps Hollandia Kezdőknek off the map until a repository can back a page', () => {
    expect(projects.find((p) => p.id === 'hollandia')?.detailPath).toBeNull()
    expect(getProjectDetail('hollandia')).toBeUndefined()
  })

  it('gives each page a stable address under /work, from the project’s name in lower case', () => {
    for (const project of projects) {
      if (project.detailPath !== null) expect(project.detailPath, project.id).toMatch(/^\/work\/[a-z0-9-]+$/)
    }
    expect(projects.find((p) => p.id === 'spendly')?.detailPath).toBe('/work/spendly')
  })

  it('links previous and next only among published projects, wrapping round', () => {
    expect(publishedProjects().map((p) => p.id)).toEqual(['spendly', 'bookinghub', 'logistics'])
    expect(neighbours('spendly')).toMatchObject({ previous: { id: 'logistics' }, next: { id: 'bookinghub' } })
    expect(neighbours('bookinghub')).toMatchObject({ previous: { id: 'spendly' }, next: { id: 'logistics' } })
    expect(neighbours('logistics')).toMatchObject({ previous: { id: 'bookinghub' }, next: { id: 'spendly' } })
    expect(neighbours('hollandia')).toBeNull()
    for (const project of publishedProjects()) {
      const around = neighbours(project.id)
      for (const other of [around?.previous, around?.next]) expect(other?.id).not.toBe('hollandia')
    }
  })
})

describe.each(details)('the page of $id', (detail) => {
  const project = projects.find((p) => p.id === detail.id)!

  it('is written in all three languages, with no empty text', () => {
    const all = trilinguals(detail)
    expect(all.length).toBeGreaterThan(40)
    for (const [path, text] of all) {
      for (const lang of LANGUAGES) expect(text[lang].trim(), `${path}.${lang}`).not.toBe('')
    }
  })

  it('has real translations: a long text is not the same sentence in two languages', () => {
    for (const [path, text] of trilinguals(detail)) {
      if (text.hu.length < 70) continue
      expect(text.hu, path).not.toBe(text.en)
      expect(text.en, path).not.toBe(text.nl)
    }
  })

  it('has a title and a description that suit a search result', () => {
    const meta = projectMeta[detail.id]!
    expect(meta).toBeDefined()
    for (const lang of LANGUAGES) {
      expect(meta.title[lang].length, `title ${lang}`).toBeLessThanOrEqual(70)
      expect(meta.description[lang].length, `description ${lang}`).toBeGreaterThan(60)
      expect(meta.description[lang].length, `description ${lang}`).toBeLessThanOrEqual(190)
      expect(meta.title[lang], lang).toContain(project.name)
    }
    expect(new Set(LANGUAGES.map((lang) => meta.title[lang])).size).toBe(3)
    expect(new Set(LANGUAGES.map((lang) => meta.description[lang])).size).toBe(3)
  })

  it('lists the technologies the card promises, and more', () => {
    const items = detail.stack.flatMap((entry) => entry.items)
    for (const tag of project.tags) expect(items.some((item) => item.startsWith(tag)), tag).toBe(true)
    expect(new Set(items).size).toBe(items.length)
  })

  it('claims no more than the card does: no live demo unless there is an address, no source link without https', () => {
    if (project.status !== 'live') expect(project.demoUrl).toBeNull()
    if (detail.sourceUrl !== null) expect(detail.sourceUrl).toMatch(/^https:\/\//)
    expect(detail.reviewed).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('marks every feature built, partial or planned, and keeps the planned ones distinct from the built', () => {
    expect(detail.features.length).toBeGreaterThan(5)
    for (const feature of detail.features) expect(['done', 'partial', 'planned']).toContain(feature.status)
    expect(new Set(detail.features.map((f) => f.title.hu)).size).toBe(detail.features.length)
    expect(detail.features.some((f) => f.status === 'done')).toBe(true)
    expect(detail.features.some((f) => f.status === 'planned' || f.status === 'partial')).toBe(true)
    expect(detail.limits.length).toBeGreaterThan(0)
  })

  it('draws an architecture only from parts it lists, and says which parts are plans', () => {
    const architecture = detail.architecture
    expect(architecture).not.toBeNull()
    const ids = architecture!.tiers.flatMap((tier) => tier.nodes.map((node) => node.id))
    expect(new Set(ids).size).toBe(ids.length)
    for (const link of architecture!.links) {
      expect(ids, `${link.from} → ${link.to}`).toContain(link.from)
      expect(ids, `${link.from} → ${link.to}`).toContain(link.to)
      expect(link.from).not.toBe(link.to)
    }
    // Every part appears in at least one connection: nothing floats loose with an invented role.
    for (const id of ids) {
      expect(architecture!.links.some((l) => l.from === id || l.to === id), id).toBe(true)
    }
  })

  it('writes down where each challenge is documented', () => {
    expect(detail.challenges.length).toBeGreaterThan(0)
    for (const challenge of detail.challenges) expect(challenge.source.trim().length, challenge.title.en).toBeGreaterThan(8)
  })

  it('invents no personal lesson: they are the owner’s to write', () => {
    expect(detail.learned).toEqual([])
  })

  it('shows only pictures that exist, are the size they say and are light enough', () => {
    expect(detail.gallery.length).toBeGreaterThan(0)
    expect(new Set(detail.gallery.map((image) => image.id)).size).toBe(detail.gallery.length)
    expect(detail.gallery.filter((image) => image.hero).length).toBeLessThanOrEqual(1)

    let total = 0
    for (const image of detail.gallery) {
      expect(image.src, image.id).toMatch(new RegExp(`^/projects/${detail.id === 'logistics' ? 'logistics-platform' : detail.id}/[a-z0-9-]+\\.webp$`))
      const path = publicFile(image.src)
      const bytes = statSync(path).size
      total += bytes
      expect(bytes, `${image.id} is ${Math.round(bytes / 1024)} KB`).toBeLessThan(300 * 1024)
      expect(webpSize(readFileSync(path)), image.id).toEqual({ width: image.width, height: image.height })
    }
    expect(total, `${detail.id} gallery weighs ${Math.round(total / 1024)} KB`).toBeLessThan(1024 * 1024)
  })

  it('gives every picture a description and a caption, and every feature picture an existing one', () => {
    const ids = new Set(detail.gallery.map((image) => image.id))
    for (const image of detail.gallery) {
      for (const lang of LANGUAGES) {
        expect(image.alt[lang].length, `${image.id} alt ${lang}`).toBeGreaterThan(15)
        expect(image.caption[lang].length, `${image.id} caption ${lang}`).toBeGreaterThan(3)
      }
    }
    for (const feature of detail.features) if (feature.image) expect(ids.has(feature.image), feature.title.en).toBe(true)
  })

  it('says what the screenshots are when that matters', () => {
    expect(detail.galleryNote).not.toBeNull()
  })

  it('contains no secrets, demo passwords, invented metrics or placeholder text', () => {
    const text = strings(detail).join('\n')
    expect(text).not.toMatch(/admin@test\.com|123456|re_[A-Za-z0-9]{8,}|AIza[0-9A-Za-z_-]{10,}|sk-[A-Za-z0-9]{12,}/)
    expect(text).not.toMatch(/10,?000\+|10K\+|99\.9\s?%|4\.9\s?\/\s?5|lorem ipsum|TODO|XXX|\.\.\.\.$/im)
  })
})

describe('Spendly', () => {
  const detail = projectDetails.spendly!

  it('says it is called WALLEX in the repository and in its screenshots', () => {
    expect(detail.repoName).toBe('WALLEX')
    for (const lang of LANGUAGES) expect(detail.galleryNote![lang]).toContain('WALLEX')
  })

  it('does not claim to be hosted or in production', () => {
    expect(detail.limits.some((limit) => /nincs üzemeltetve|not hosted|nergens gehost/i.test(limit.hu + limit.en + limit.nl))).toBe(true)
  })
})

describe('BookingHub', () => {
  const detail = projectDetails.bookinghub!

  it('calls its sign-in a demo and its plans plans', () => {
    const signIn = detail.features.find((feature) => feature.title.en === 'Sign-in')
    expect(signIn?.status).toBe('partial')
    expect(detail.features.find((feature) => feature.status === 'planned')?.title.en).toMatch(/backend/i)
    const backend = detail.architecture!.tiers.flatMap((tier) => tier.nodes).find((node) => node.id === 'backend')
    expect(backend?.status).toBe('planned')
  })

  it('leaves the landing page out, whose figures are placeholder text', () => {
    expect(detail.gallery.some((image) => /landing/i.test(image.id + image.src))).toBe(false)
  })
})

describe('the Logistics Platform', () => {
  const detail = projectDetails.logistics!

  it('says it is a demonstration with fictional data, in the summary and the limits', () => {
    for (const lang of LANGUAGES) expect(detail.summary[lang].length).toBeGreaterThan(100)
    expect(detail.limits[0].en).toMatch(/not in production/i)
  })

  it('does not call the driver app finished', () => {
    expect(detail.features.find((feature) => feature.title.en === 'Driver app')?.status).toBe('partial')
    const node = detail.architecture!.tiers.flatMap((tier) => tier.nodes).find((n) => n.id === 'driver')
    expect(node?.status).toBe('partial')
  })
})
