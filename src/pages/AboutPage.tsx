import { Approach } from '../components/about/Approach'
import { AboutHero } from '../components/about/AboutHero'
import { Focus } from '../components/about/Focus'
import { aboutTone } from '../components/about/rhythm'
import { Skills } from '../components/about/Skills'
import { Story } from '../components/about/Story'
import { FinalCta } from '../components/home/FinalCta'
import { useI18n } from '../i18n/useI18n'

/**
 * The About page: the statement, the personal story with what carried over from logistics, the four
 * principles of how the owner works, the technologies, the current focus and a closing call to action
 * that leads to the contact page. The personal words are in content/about/ and the page's own labels
 * in the dictionaries.
 */
export function AboutPage() {
  const { t } = useI18n()

  return (
    <>
      <AboutHero />
      <Story />
      <Approach />
      <Skills />
      <Focus />
      <FinalCta id="start" tone={aboutTone('start')} copy={t.aboutPage.final} action={{ to: '/contact' }} />
    </>
  )
}
