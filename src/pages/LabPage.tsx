import { ExperimentGallery } from '../components/lab/gallery/ExperimentGallery'
import { LabHero } from '../components/lab/hero/LabHero'
import { useLabText } from '../components/lab/core/useLabText'
import { FinalCta } from '../components/home/FinalCta'

/**
 * The Lab: an interactive first screen, then the experiments as a magazine spread, then the way
 * back to the portfolio. The words are in content/labText.ts; the experiments in content/lab.ts.
 */
export function LabPage() {
  const { text } = useLabText()

  return (
    <>
      <LabHero />
      <ExperimentGallery />
      <FinalCta
        id="exit"
        tone="dark"
        copy={{ title: text.exit.title, text: text.exit.text, cta: text.exit.contact }}
        action={{ to: '/contact' }}
      />
    </>
  )
}
