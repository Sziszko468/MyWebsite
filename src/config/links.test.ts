import { describe, expect, it } from 'vitest'
import { contactLinks } from './links'
import { siteConfig } from './site'

describe('the contact links', () => {
  it('show nothing for what is not configured', () => {
    expect(contactLinks({ contact: { email: null }, social: [{ id: 'github', label: 'GitHub', url: null }] })).toEqual([])
  })

  it('put the e-mail address first, then each profile that has an address, in the order of the configuration', () => {
    const links = contactLinks({
      contact: { email: 'hello@example.com' },
      social: [
        { id: 'github', label: 'GitHub', url: 'https://github.com/example' },
        { id: 'linkedin', label: 'LinkedIn', url: null },
        { id: 'community', label: 'A community', url: 'https://community.example.com/people/example' },
      ],
    })
    expect(links.map((link) => link.id)).toEqual(['email', 'github', 'community'])
    expect(links[0]).toEqual({ id: 'email', label: 'hello@example.com', href: 'mailto:hello@example.com', external: false })
    expect(links[1]).toEqual({ id: 'github', label: 'GitHub', href: 'https://github.com/example', external: true })
  })

  it('open another site as an external link and an e-mail as a mailto: link, nothing else', () => {
    const links = contactLinks({
      contact: { email: 'hello@example.com' },
      social: [{ id: 'github', label: 'GitHub', url: 'https://github.com/example' }],
    })
    for (const link of links) {
      if (link.external) expect(link.href).toMatch(/^https:\/\//)
      else expect(link.href).toMatch(/^mailto:/)
    }
  })

  it('make up nothing from the real configuration', () => {
    for (const link of contactLinks(siteConfig)) {
      expect(link.href).toMatch(/^(https:\/\/|mailto:)/)
      expect(link.href).not.toMatch(/example\.|localhost|your-?name|username/i)
    }
  })
})
