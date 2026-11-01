import { useState } from 'react'
import { FinalCta } from '../components/home/FinalCta'
import { ArtifactsPanel } from '../components/lab/artifacts/ArtifactsPanel'
import { useLocalized } from '../components/lab/core/useLabText'
import { RacingEggLayer } from '../components/lab/easter/RacingEgg'
import { useSecretSequence } from '../components/lab/easter/useSecretSequence'
import { Discovery } from '../components/lab/page/Discovery'
import { Feature } from '../components/lab/page/Feature'
import { LabHero } from '../components/lab/page/LabHero'
import { pageText } from '../components/lab/page/pageText'
import { Philosophy } from '../components/lab/page/Philosophy'
import { experimentPath } from '../content/lab'

/**
 * The Lab: a first screen in Racing Red and carbon, the six experiences as a spread with live
 * miniatures, the object generator as the featured one, why the Lab exists, what the visitor kept,
 * and a closing line. The hidden racing experience hangs off the red full stop of the headline (or
 * N F S U 2 on the keyboard); it is not in the navigation and not in the list.
 */
export function LabPage() {
  const t = useLocalized(pageText)
  const [egg, setEgg] = useState(false)
  useSecretSequence(() => setEgg(true), !egg)

  return (
    <>
      <LabHero onFind={() => setEgg(true)} />
      <Discovery />
      <Feature />
      <Philosophy />
      <ArtifactsPanel />
      <FinalCta
        id="start"
        copy={{ title: t.closing.title, text: t.closing.text, cta: t.closing.cta }}
        action={{ to: experimentPath('generative-objects') }}
      />
      <RacingEggLayer open={egg} onClose={() => setEgg(false)} />
    </>
  )
}
