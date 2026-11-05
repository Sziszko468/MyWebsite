import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildCsp } from '../../../security/headers'
import { LANGUAGES } from '../../../i18n/config'
import { advanceSequence, ignoresKey, NFSU2, SECRET_KEYS, TRANSITION_MS, TRANSITION_REDUCED_MS } from './eggConfig'
import { eggText } from './eggText'

describe('the hidden racing experience: where it goes', () => {
  it('points at nfsu2.xyz over https, and nothing else', () => {
    expect(NFSU2.url).toBe('https://nfsu2.xyz/')
    expect(new URL(NFSU2.url).protocol).toBe('https:')
    expect(new URL(NFSU2.url).host).toBe(NFSU2.host)
  })

  it('plays a transition first (the loading state), a short one under reduced motion', () => {
    expect(TRANSITION_MS).toBeGreaterThan(800)
    expect(TRANSITION_MS).toBeLessThan(2500)
    expect(TRANSITION_REDUCED_MS).toBeLessThan(TRANSITION_MS)
  })

  it('shows a screen with choices after the transition: it opens the site in a NEW tab and never frames or redirects', () => {
    const source = readFileSync(join(import.meta.dirname, 'RacingEgg.tsx'), 'utf8')
    // OPEN NFSU2 is a link to a new tab, with no referrer and no handle on this page.
    expect(source).toMatch(/target="_blank"/)
    expect(source).toMatch(/rel="noopener noreferrer"/)
    // The site forbids framing and this one does not try: no frame, no script into it, no automatic navigation away.
    expect(source).not.toMatch(/iframe/i)
    expect(source).not.toMatch(/location\.(href|assign|replace)|window\.open|\.click\(\)/)
    // A way back and Escape.
    expect(source).toMatch(/onClick=\{onClose\}/)
    expect(source).toMatch(/'Escape'/)
  })

  it('has no frame to bypass: this site refuses frames itself, and the destination answers with a header that forbids them', () => {
    expect(buildCsp({ scriptHashes: [], styleHashes: [], connectOrigins: [] })).toMatch(/frame-src 'none'/)
  })
})

describe('the hidden racing experience: the way in from the keyboard', () => {
  const type = (keys: string) => [...keys].reduce((progress, key) => advanceSequence(progress, key), 0)

  it('opens on N F S U 2, in any case', () => {
    expect(type('nfsu2')).toBe(SECRET_KEYS.length)
    expect(type('NFSU2')).toBe(SECRET_KEYS.length)
    expect(type('xxnfsu2')).toBe(SECRET_KEYS.length)
  })

  it('starts over on a wrong key, and a wrong key that is the first letter starts a new try', () => {
    expect(type('nfsx')).toBe(0)
    expect(type('nfnfsu2')).toBe(SECRET_KEYS.length)
    expect(type('nfsu')).toBe(4)
    expect(type('nfs2')).toBe(0)
  })

  it('ignores typing in a field and shortcuts', () => {
    expect(ignoresKey({ ctrlKey: true, metaKey: false, altKey: false, target: null })).toBe(true)
    expect(ignoresKey({ ctrlKey: false, metaKey: true, altKey: false, target: null })).toBe(true)
    expect(ignoresKey({ ctrlKey: false, metaKey: false, altKey: false, target: { tagName: 'TEXTAREA' } as unknown as EventTarget })).toBe(true)
    expect(ignoresKey({ ctrlKey: false, metaKey: false, altKey: false, target: { tagName: 'DIV', isContentEditable: true } as unknown as EventTarget })).toBe(true)
    expect(ignoresKey({ ctrlKey: false, metaKey: false, altKey: false, target: { tagName: 'BUTTON' } as unknown as EventTarget })).toBe(false)
  })
})

describe('the hidden racing experience: its words', () => {
  it('has every text in every language, none empty, and says the destination is external', () => {
    for (const [key, text] of Object.entries(eggText)) {
      for (const lang of LANGUAGES) expect(text[lang].trim(), `${key}.${lang}`).not.toBe('')
    }
    for (const lang of LANGUAGES) expect(eggText.leaving[lang]).toMatch(/nfsu2\.xyz/)
    for (const lang of LANGUAGES) expect(eggText.readyNote[lang]).toMatch(/nfsu2\.xyz/)
    expect(eggText.open.en).toBe('OPEN NFSU2')
  })
})
