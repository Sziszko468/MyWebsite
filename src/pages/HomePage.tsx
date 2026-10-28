import { AboutMindset } from '../components/home/AboutMindset'
import { FinalCta } from '../components/home/FinalCta'
import { LabSection } from '../components/home/LabSection'
import { PathChooser } from '../components/home/PathChooser'
import { SelectedWork } from '../components/home/SelectedWork'
import { ServicePackages } from '../components/home/ServicePackages'
import { WhatIBuild } from '../components/home/WhatIBuild'
import { VelocityHero } from '../components/hero/VelocityHero'

/**
 * The main page, top to bottom: the hero, two ways in, selected work, what I build, about, the
 * lab, ways to work together and the closing call to action. The bands alternate between the
 * page's theme and its opposite (see Section), and each has its own composition.
 */
export function HomePage() {
  return (
    <>
      <VelocityHero />
      <PathChooser />
      <SelectedWork />
      <WhatIBuild />
      <AboutMindset />
      <LabSection />
      <ServicePackages />
      <FinalCta />
    </>
  )
}
