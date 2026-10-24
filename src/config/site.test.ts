import { describe, expect, it } from 'vitest'
import { findPage } from '../routes/pages'
import { getMonogram, siteConfig } from './site'

describe('getMonogram', () => {
  it('uses the initials of the first two words', () => {
    expect(getMonogram({ brandName: 'Your Name', monogram: null })).toBe('YN')
    expect(getMonogram({ brandName: 'kovács péter jános', monogram: null })).toBe('KP')
    expect(getMonogram({ brandName: 'Studio', monogram: null })).toBe('S')
  })

  it('prefers an explicit monogram, capped at three characters', () => {
    expect(getMonogram({ brandName: 'Your Name', monogram: 'cc' })).toBe('CC')
    expect(getMonogram({ brandName: 'Your Name', monogram: 'abcd' })).toBe('ABC')
  })
})

describe('siteConfig', () => {
  it('only accepts https social profiles', () => {
    for (const profile of siteConfig.social) {
      if (profile.url !== null) expect(profile.url, profile.id).toMatch(/^https:\/\//)
    }
  })

  it('only links legal pages that exist', () => {
    for (const link of siteConfig.legal) {
      if (link.path !== null) expect(findPage(link.path), link.id).toBeDefined()
    }
  })

  it('only offers a plausible email address', () => {
    const { email } = siteConfig.contact
    if (email !== null) expect(email).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)
  })
})
