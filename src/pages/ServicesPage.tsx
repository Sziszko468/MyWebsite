import { useCatalogGate } from '../content/liveCatalog'
import { useState } from 'react'
import { useLocation } from 'react-router'
import { isPackageId, packages, type PackageId } from '../content/packages'
import { FinalCta } from '../components/home/FinalCta'
import { ConfigureBand, FaqBand, ProcessBand, SupportBand, WorkBand } from '../components/shop/Bands'
import { Discovery } from '../components/shop/Discovery'
import { FullExperienceBand } from '../components/shop/experience/FullExperienceBand'
import { Tiers } from '../components/shop/tiers/Tiers'
import { shopTone } from '../components/shop/rhythm'
import { ShopHero } from '../components/shop/ShopHero'
import { SHOP_PATHS } from '../shop/paths'
import { useShopText } from '../shop/useShopText'

/** The package named in the address (`?package=build`), if it is one of ours. */
function packageFromSearch(search: string): PackageId | null {
  const wanted = new URLSearchParams(search).get('package')
  return isPackageId(wanted) ? wanted : null
}

/**
 * The shop's front page: a hero that says what is offered, the four services (with a search over
 * the whole catalogue), the four packages as products with an optional comparison, the way into
 * the request builder, how a project runs and what follows an inquiry, the support options, real
 * work, the questions and a closing call to action. A package named in the address
 * (`/services?package=build#packages`) arrives chosen.
 */
export function ServicesPage() {
  useCatalogGate()
  const { landing } = useShopText()
  const { search } = useLocation()
  // The visitor's own choice holds for the address it was made at; a different `?package=` in the address wins again.
  const [picked, setPicked] = useState<{ address: string; id: PackageId } | null>(null)
  const selected = picked?.address === search ? picked.id : (packageFromSearch(search) ?? packages[0].id)

  return (
    <>
      <ShopHero />
      <Discovery />
      <Tiers value={selected} onChange={(id) => setPicked({ address: search, id })} />
      <FullExperienceBand />
      <ConfigureBand />
      <ProcessBand />
      <SupportBand />
      <WorkBand />
      <FaqBand />
      <FinalCta id="start" tone={shopTone('start')} copy={landing.final} action={{ to: SHOP_PATHS.configure }} />
    </>
  )
}
