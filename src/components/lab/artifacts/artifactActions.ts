import type { LabId } from '../../../content/lab'
import { artifacts, type Artifact, type ArtifactType, type SaveOutcome } from './artifactDb'

/**
 * What the experiments and the saved-works panel ask of the store: keep this work, and open that one
 * again. Opening puts the work into the experiment's own handoff slot, after checking it with the same
 * reader the experiment uses for a file, so a damaged work cannot get further than here.
 */
export async function saveArtifact(input: {
  id?: string
  type: ArtifactType
  name: string
  payload: Record<string, unknown>
  thumbnail?: string
}): Promise<SaveOutcome> {
  const service = await artifacts()
  return service.save(input)
}

/** The experiment a type of work belongs to. */
export const HOME: Record<ArtifactType, LabId> = {
  creation: 'generative-objects',
  typography: 'type-in-motion',
  material: 'liquid-matter',
}

/** Puts a work into its experiment's handoff slot and says which experiment to open; null if the work is damaged. */
export async function openArtifact(artifact: Artifact): Promise<LabId | null> {
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
  const { sanitizeCreation, creationHandoff } = await import('../experiments/generative/creation')
  const creation = sanitizeCreation(artifact.payload)
  if (!creation) return null
  creationHandoff.put(creation)
  return HOME.creation
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
