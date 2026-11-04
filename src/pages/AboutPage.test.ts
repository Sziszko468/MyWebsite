import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { ABOUT_RHYTHM } from '../components/about/rhythm'
import { activeFocusTopics, approachSteps, skillGroups, storyParagraphs, storyThought, storyTitle, transferableSkills } from '../content/about'
import { LANGUAGES, type Language } from '../i18n/config'
import { I18nContext } from '../i18n/context'
import { dictionaries } from '../i18n/dictionaries'
import { ThemeContext } from '../theme/context'
import { AboutPage } from './AboutPage'
import { flattenKinetic } from '../test/markup'

/** The About page rendered on the server, with the real providers: a crash, a missing word or a leaked template shows here. */
function render(lang: Language, theme: 'dark' | 'light' = 'dark'): string {
  return flattenKinetic(renderToStaticMarkup(
    createElement(
      ThemeContext.Provider,
      { value: { theme, setTheme: () => undefined, toggleTheme: () => undefined, followSystem: () => undefined } },
      createElement(
        MemoryRouter,
        { initialEntries: [`/${lang}/about`] },
        createElement(I18nContext.Provider, { value: { lang, t: dictionaries[lang] } }, createElement(AboutPage)),
      ),
    ),
  ))
}

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;')

describe.each(LANGUAGES)('the About page in %s', (lang) => {
  const html = render(lang)
  const t = dictionaries[lang]

  it('renders one h1, with the statement of the brief', () => {
    expect(html.match(/<h1\b/g)).toHaveLength(1)
    expect(html).toContain(escape(t.aboutPage.hero.titleLine1))
    expect(html).toContain(escape(t.aboutPage.hero.titleLine2))
    expect(html).toContain(escape(t.aboutPage.hero.lead))
  })

  it('has every band, each one named by a heading', () => {
    for (const { id } of ABOUT_RHYTHM) expect(html, id).toMatch(new RegExp(`<section[^>]*id="${id}"[^>]*aria-labelledby="[^"]+"`))
  })

  it('tells the story: the working title, the paragraphs, the thought and the seven skills', () => {
    expect(html).toContain(escape(storyTitle[lang]))
    for (const paragraph of storyParagraphs) expect(html).toContain(escape(paragraph[lang]))
    expect(html).toContain(escape(storyThought[lang]))
    for (const skill of transferableSkills) {
      expect(html).toContain(escape(skill.name[lang]))
      expect(html).toContain(escape(skill.text[lang]))
    }
  })

  it('shows the four principles as an ordered chain, with the loop back', () => {
    for (const step of approachSteps) {
      expect(html).toContain(`>${step.name}<`)
      expect(html).toContain(escape(step.text[lang]))
    }
    expect(html).toMatch(/data-step="understand"[\s\S]*data-step="design"[\s\S]*data-step="build"[\s\S]*data-step="refine"/)
  })

  it('lists every technology by name, in its group, with no level, bar or figure', () => {
    for (const group of skillGroups) {
      expect(html).toContain(escape(group.label[lang]))
      for (const skill of group.skills) expect(html).toContain(`>${escape(skill.name)}<`)
    }
    const { levels } = t.aboutPage.skills
    for (const word of [levels.learning, levels.working, levels.confident]) expect(html).not.toContain(escape(word))
    expect(html).not.toMatch(/%|<progress|role="progressbar"|<meter/)
  })

  it('shows only the active focus topics', () => {
    for (const topic of activeFocusTopics) expect(html).toContain(escape(topic.title[lang]))
    expect(html).not.toContain(escape(t.aboutPage.focus.title + 'x'))
  })

  it('closes with the call to action, which leads to the contact page', () => {
    expect(html).toContain(escape(t.aboutPage.final.title))
    expect(html).toMatch(new RegExp(`<a[^>]*href="/${lang}/contact"[^>]*>(?:(?!</a>).)*${escape(t.aboutPage.final.cta)}`))
  })

  it('leads the hero to the work on the home page', () => {
    expect(html).toMatch(new RegExp(`<a[^>]*href="/${lang}/#work"[^>]*>(?:(?!</a>).)*${escape(t.aboutPage.hero.ctaPrimary)}`))
  })

  it('leaks no template, no undefined and no object into the text', () => {
    const text = html.replace(/<[^>]+>/g, ' ')
    expect(text).not.toMatch(/\{\w+\}|undefined|\[object|NaN/)
  })
})

describe('the About page', () => {
  it('renders the same bands in the light theme', () => {
    const html = render('en', 'light')
    for (const { id } of ABOUT_RHYTHM) expect(html, id).toContain(`id="${id}"`)
    expect(html).toContain('data-theme="dark"')
    expect(html).toContain('data-theme="light"')
  })
})
