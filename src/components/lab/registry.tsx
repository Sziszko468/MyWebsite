import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import type { LabId } from '../../content/lab'

/**
 * The component behind each experiment's page. Every one is its own chunk, loaded when its page is
 * opened; its scene (Three.js, shaders) is a further chunk the page loads after its own words and
 * controls are on screen. To add an experiment: add it to content/lab.ts and its words to
 * content/labText.ts, write the component, and list it here.
 */
export const EXPERIMENT_COMPONENTS: Partial<Record<LabId, LazyExoticComponent<ComponentType>>> = {
  'particle-universe': lazy(() => import('./experiments/particles/ParticleUniverse')),
  'liquid-matter': lazy(() => import('./experiments/liquid/LiquidMatter')),
  'type-in-motion': lazy(() => import('./experiments/type/TypeInMotion')),
  'infinite-space': lazy(() => import('./experiments/space/InfiniteSpace')),
  'chromatic-distortion': lazy(() => import('./experiments/chromatic/ChromaticDistortion')),
  'generative-objects': lazy(() => import('./experiments/generative/GenerativeObjects')),
  'model-studio': lazy(() => import('./experiences/studio/ModelStudio')),
  racing: lazy(() => import('./experiences/racing/Racing')),
  'track-architect': lazy(() => import('./experiences/racing/TrackArchitect')),
  'performance-lab': lazy(() => import('./experiences/racing/PerformanceLab')),
  'generative-art': lazy(() => import('./experiences/art/GenerativeArt')),
  'sound-world': lazy(() => import('./experiences/sound/SoundWorld')),
}
