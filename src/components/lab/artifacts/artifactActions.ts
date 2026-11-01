import type { LabId } from '../../../content/lab'
import { award } from '../progress/progress'
import { artifacts, type Artifact, type ArtifactType, type SaveOutcome } from './artifactDb'

/**
 * What the experiences and the Artifacts panel ask of the store: keep this work, and open that one
 * again. Opening puts the work into the experience's own store, after checking it with the same
 * parser the experience uses for a file, so a damaged work cannot get further than here.
 */
export async function saveArtifact(input: {
  id?: string
  type: ArtifactType
  name: string
  payload: Record<string, unknown>
  thumbnail?: string
}): Promise<SaveOutcome> {
  const service = await artifacts()
  const result = await service.save(input)
  // The first work really kept is the First Creation; a failed save earns nothing.
  if (result.ok) award('artifact:first', 20, 'first-creation')
  return result
}

/** The experience a type of work belongs to. */
export const HOME: Record<ArtifactType, LabId> = {
  model: 'model-studio',
  track: 'track-architect',
  setup: 'performance-lab',
  artwork: 'generative-art',
  typography: 'type-in-motion',
  material: 'liquid-matter',
}

/** Puts a work into its experience's store and says which experience to open; null if the work is damaged. */
export async function openArtifact(artifact: Artifact): Promise<LabId | null> {
  if (artifact.type === 'track') {
    const { parseTrack } = await import('../experiences/racing/trackModel')
    const track = parseTrack(artifact.payload)
    if (!track) return null
    const { replace } = await import('../experiences/racing/architectStore')
    replace(track, '')
    return HOME.track
  }
  if (artifact.type === 'setup') {
    const { sanitizeSetup } = await import('../experiences/racing/carSetup')
    const { replaceCurrent } = await import('../experiences/racing/perfStore')
    const setup = (artifact.payload as { setup?: unknown }).setup ?? artifact.payload
    replaceCurrent(sanitizeSetup(setup), '')
    return HOME.setup
  }
  if (artifact.type === 'artwork') {
    const { sanitizeParams, setParams } = await import('../experiences/art/artParams')
    if ((artifact.payload as { version?: unknown }).version !== 1) return null
    setParams(sanitizeParams(artifact.payload), '')
    return HOME.artwork
  }
  if (artifact.type === 'typography') {
    const { sanitizeTypeWork, typeHandoff } = await import('../experiments/type/typeControls')
    const controls = sanitizeTypeWork(artifact.payload)
    if (!controls) return null
    typeHandoff.put(controls)
    return HOME.typography
  }
  if (artifact.type === 'material') {
    const { sanitizeMaterialWork, liquidHandoff } = await import('../experiments/liquid/liquidControls')
    const controls = sanitizeMaterialWork(artifact.payload)
    if (!controls) return null
    liquidHandoff.put(controls)
    return HOME.material
  }
  const { parseStudioDoc } = await import('../experiences/studio/studioDoc')
  const doc = parseStudioDoc(artifact.payload)
  if (!doc) return null
  const { replaceDoc } = await import('../experiences/studio/studioStore')
  replaceDoc(doc, '')
  return HOME.model
}

/** A stable id for a work of a type with a name, so keeping it again replaces it rather than piling up copies. */
export function artifactId(type: ArtifactType, name: string): string {
  const slug =
    name
      .normalize('NFKD')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 36) || 'work'
  return `${type}-${slug}`
}
