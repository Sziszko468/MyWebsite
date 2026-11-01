import { useState, type RefObject } from 'react'
import type { StageCapture } from '../core/useStageCapture'
import { useLocalized } from '../core/useLabText'
import { downloadBlob, safeFilename } from '../experience/persist'
import { LabAction, LabActions, LabGroup, LabNote } from '../ui/LabControls'
import type { ArtifactType } from './artifactDb'
import { saveArtifact } from './artifactActions'
import { artifactText } from './artifactText'

interface KeepWorkProps {
  /** What the work is: a typography artwork or a material preset. */
  type: Extract<ArtifactType, 'typography' | 'material'>
  /** A name for a new work, e.g. with the time, so each keeping is its own work. */
  name: () => string
  /** The experience's own settings, as they are now. */
  payload: () => Record<string, unknown>
  /** The stage's picture, if there is a stage running. */
  stage: RefObject<StageCapture | null>
}

/**
 * "Keep" for the two experiments that have no panels of their own: save the picture as a PNG, or
 * keep the work (its settings and a preview) among the saved works. In the still view, where nothing
 * is drawn, the settings are still kept: a work does not need a picture to be a work.
 */
export function KeepWork({ type, name, payload, stage }: KeepWorkProps) {
  const a = useLocalized(artifactText)
  const [message, setMessage] = useState('')

  const savePng = async () => {
    const url = (await stage.current?.capture('full')) ?? null
    if (!url) return setMessage(a.keep.imageFailed)
    downloadBlob(await (await fetch(url)).blob(), safeFilename(name(), 'png'))
    setMessage(a.keep.imageReady)
  }

  const keep = async () => {
    const thumbnail = (await stage.current?.capture('thumb')) ?? undefined
    const result = await saveArtifact({ type, name: name(), payload: payload(), thumbnail })
    if (!result.ok) return setMessage(a.failed[result.reason])
    setMessage(!stage.current ? a.keep.noPicture : result.persistent ? a.saved : a.savedSession)
  }

  return (
    <LabGroup title={a.keep.title}>
      <LabNote>{a.keep[type]}</LabNote>
      <LabActions>
        <LabAction onClick={() => void savePng()}>{a.keep.png}</LabAction>
        <LabAction variant="primary" onClick={() => void keep()}>
          {a.save}
        </LabAction>
      </LabActions>
      <LabNote live>{message}</LabNote>
    </LabGroup>
  )
}
