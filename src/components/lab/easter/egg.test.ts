import { describe, expect, it } from 'vitest'
import { LANGUAGES } from '../../../i18n/config'
import { advanceSequence, ignoresKey, leaveFor, NFSU2, SECRET_KEYS, TRANSITION_MS, TRANSITION_REDUCED_MS } from './eggConfig'
import { eggText } from './eggText'

describe('the hidden racing experience: where it goes', () => {
  it('points at nfsu2.xyz over https, and nothing else', () => {
    expect(NFSU2.url).toBe('https://nfsu2.xyz/')
    expect(new URL(NFSU2.url).protocol).toBe('https:')
    expect(new URL(NFSU2.url).host).toBe(NFSU2.host)
  })

  it('plays a transition first, a short one under reduced motion', () => {
    expect(TRANSITION_MS).toBeGreaterThan(800)
    expect(TRANSITION_MS).toBeLessThan(2500)
    expect(TRANSITION_REDUCED_MS).toBeLessThan(TRANSITION_MS)
  })

  it('leaves through a clicked link that sends no referrer and gives the other page no handle on this one', () => {
    const made: Array<{ href: string; rel: string; clicked: boolean; removed: boolean; hidden: boolean }> = []
    const doc = {
      createElement: () => {
        const link = {
          href: '',
          rel: '',
          style: { display: '' },
          clicked: false,
          removed: false,
          click() {
            link.clicked = true
          },
          remove() {
            link.removed = true
          },
        }
        made.push(link as never)
        return link
      },
      body: { appendChild: () => undefined },
    }
    leaveFor(NFSU2.url, doc as never)
    expect(made).toHaveLength(1)
    expect(made[0]).toMatchObject({ href: 'https://nfsu2.xyz/', rel: 'noreferrer noopener', clicked: true, removed: true })
    expect(made[0].rel).not.toMatch(/_blank/)
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
  })
})
