import { useEffect } from 'react'
import { useLocation } from 'react-router'
import { isPackageId } from '../content/packages'
import { FinalCta } from '../components/home/FinalCta'
import { Faq } from '../components/services/Faq'
import { PackagePicker } from '../components/services/PackagePicker'
import { Process } from '../components/services/Process'
import { QuoteSection } from '../components/services/QuoteSection'
import { servicesTone } from '../components/services/rhythm'
import { ServiceAreas } from '../components/services/ServiceAreas'
import { ServicesHero } from '../components/services/ServicesHero'
import { useI18n } from '../i18n/useI18n'
import type { QuoteDraft } from '../quote/types'
import { useQuoteDraft } from '../quote/useQuoteDraft'

/** The package named in the address (`?package=build`), if it is one of ours. */
function packageFromSearch(search: string): Partial<QuoteDraft> {
  const wanted = new URLSearchParams(search).get('package')
  return isPackageId(wanted) ? { package: wanted } : {}
}

/**
 * The services page: a hero, the four areas of work, the four packages, the quote request, how we
 * work, the questions and a closing call to action. One draft ties the page together: choosing a
 * package or a kind of project above fills in the form below, and a link from another page can
 * arrive with a package already chosen (`/services?package=build#quote`).
 */
export function ServicesPage() {
  const { t } = useI18n()
  const { search } = useLocation()
  const quote = useQuoteDraft(packageFromSearch(search))
  const { set } = quote

  // The same page can be reached again with another package in the address.
  useEffect(() => {
    const { package: wanted } = packageFromSearch(search)
    if (wanted) set('package', wanted)
  }, [search, set])

  return (
    <>
      <ServicesHero />
      <ServiceAreas onChoose={(type) => set('projectType', type)} />
      <PackagePicker value={quote.draft.package} onChange={(id) => set('package', id)} />
      <QuoteSection quote={quote} />
      <Process />
      <Faq />
      <FinalCta id="start" tone={servicesTone('start')} copy={t.servicesPage.final} action={{ href: '#quote' }} />
    </>
  )
}
