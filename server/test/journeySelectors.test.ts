import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * PROMPT 25: the browser journeys must not quote the wording of the pages. A journey that waits for "The settings are saved." fails when somebody rewords
 * or translates it, for a reason that is not a defect (tools/e2e/selectors.cjs says what to use instead). This keeps that from coming back:
 *
 *   1. a RATCHET: the number of text assertions (`getByText('...')`, `getByText(/.../)`) per journey may only go down. New ones are refused, and when
 *      one is converted the baseline below is lowered with it, so the progress cannot be lost;
 *   2. every `data-testid` a journey asks for exists in the website's own source, so a removed or renamed hook fails here and not only when somebody
 *      next runs a journey by hand;
 *   3. the journey that was converted completely has no text assertion left except the ones that are about a language or about its own data.
 *
 * The accessible-name assertions (`getByRole(..., { name })`, `getByLabel`) are deliberately NOT counted: they are the accessibility contract.
 */

const root = join(import.meta.dirname, '..', '..')
const read = (path: string): string => readFileSync(join(root, path), 'utf8').replace(/\r\n/g, '\n')
const journeyDir = join(root, 'tools', 'e2e')
const journeys = readdirSync(journeyDir).filter((name) => name.endsWith('-journey.cjs') || name === 'journeys.cjs')

/** Text assertions whose argument is a literal: a quoted string or a regular expression. A variable or a template with `${}` is data, not wording. */
export function literalTextAssertions(source: string): string[] {
  const found: string[] = []
  const pattern = /getByText\(\s*(?:'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\$]|\\.|\$(?!\{))*)`|\/((?:[^/\\\n]|\\.)+)\/[a-z]*)/g
  for (const match of source.matchAll(pattern)) found.push(match[1] ?? match[2] ?? `/${match[3]}/`)
  return found
}

/**
 * How many literal text assertions each journey still has. Lower a number when a journey is converted; never raise one. The remaining ones are
 * mostly the other journeys' toasts and notices: they need the same hooks (selectors.cjs lists the ones that exist) and a run of the journey to prove
 * the conversion, which is why they are counted here and not guessed at.
 */
const BASELINE: Record<string, number> = {
  'ai-journey.cjs': 37,
  'booking-journey.cjs': 0,
  'cms-journey.cjs': 11,
  'cms22-journey.cjs': 4,
  'journeys.cjs': 2,
  'l10n-journey.cjs': 0,
  'localization-journey.cjs': 0,
  'quote-journey.cjs': 9,
  'quote-languages-journey.cjs': 0,
  'quote-lifecycle-journey.cjs': 21,
  'shop-journey.cjs': 3,
  'shop4-journey.cjs': 0,
}

describe('the text-assertion ratchet', () => {
  it('finds the journeys, and every one of them has a baseline', () => {
    expect(journeys.length).toBeGreaterThanOrEqual(10)
    expect(Object.keys(BASELINE).sort()).toEqual([...journeys].sort())
  })

  it('counts a literal and not a variable (the counter itself is held to account)', () => {
    const source = [
      "await page.getByText('The draft was saved.').first().waitFor()",
      'await page.getByText(/is published/).first().waitFor()',
      'await page.getByText(`Quote note ${stamp}`).first().waitFor()',
      'await page.getByText(`a plain template`).first().waitFor()',
      'await page.getByText(marker).first().waitFor()',
      'await page.getByText(W[lang].required).first().waitFor()',
      "await page.getByRole('button', { name: 'Save' }).click()",
    ].join('\n')
    expect(literalTextAssertions(source)).toEqual(['The draft was saved.', '/is published/', 'a plain template'])
  })

  for (const name of journeys) {
    it(`${name} does not quote more wording than it did`, () => {
      const count = literalTextAssertions(read(`tools/e2e/${name}`)).length
      const allowed = BASELINE[name] ?? 0
      expect(count, `${name} has more literal getByText assertions than before: use a data-testid hook (tools/e2e/selectors.cjs), not the page's wording.`).toBeLessThanOrEqual(allowed)
      expect(count, `${name} has fewer literal getByText assertions than the baseline says: lower BASELINE['${name}'] to ${count} so the progress is kept.`).toBe(allowed)
    })
  }
})

describe('the hooks the journeys use exist in the website', () => {
  const walk = (dir: string): string[] =>
    readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) => {
      const path = `${dir}/${entry.name}`
      if (entry.isDirectory()) return walk(path)
      return /\.(tsx|ts)$/.test(entry.name) && !/\.test\./.test(entry.name) ? [path] : []
    })
  const sourceText = walk('src').map(read).join('\n')
  const declared = new Set([...sourceText.matchAll(/data-testid="([a-z0-9-]+)"/g)].map((match) => match[1]))

  it('knows the hooks of the website', () => {
    for (const hook of ['toast', 'status-badge', 'field-error', 'booking-status', 'booking-change', 'booking-notice', 'booking-link-problem', 'booking-open-state', 'booking-open-change', 'type-readiness']) {
      expect(declared.has(hook), `the website no longer has data-testid="${hook}"`).toBe(true)
    }
  })

  for (const name of [...journeys, 'selectors.cjs']) {
    it(`${name} asks only for hooks that exist`, () => {
      const source = read(`tools/e2e/${name}`)
      const asked = new Set([...source.matchAll(/data-testid=\\?"([a-z0-9-]+)\\?"/g), ...source.matchAll(/getByTestId\('([a-z0-9-]+)'\)/g)].map((match) => match[1]))
      const missing = [...asked].filter((hook) => !declared.has(hook))
      expect(missing, `${name} asks for data-testid values that no component renders`).toEqual([])
    })
  }

  it('is used by the converted journey: it takes its toasts from the helper, not from sentences', () => {
    const source = read('tools/e2e/booking-journey.cjs')
    expect(source).toContain("require('./selectors.cjs')")
    expect(source).toContain('toastAfter(')
  })
})
