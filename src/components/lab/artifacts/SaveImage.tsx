import { useState, type RefObject } from 'react'
import type { StageCapture } from '../core/useStageCapture'
import { useLocalized } from '../core/useLabText'
import { downloadBlob, safeFilename } from '../experience/persist'
import { LabAction, LabNote } from '../ui/LabControls'
import { artifactText } from './artifactText'

/**
 * "Save image (PNG)": the stage's picture as it is now, drawn again inside a frame so it is never blank.
 * It says when it could not make one (the still view has no picture).
 */
export function SaveImage({ name, stage }: { name: () => string; stage: RefObject<StageCapture | null> }) {
  const a = useLocalized(artifactText)
  const [message, setMessage] = useState('')
  const save = async () => {
    const url = (await stage.current?.capture('full')) ?? null
    if (!url) return setMessage(a.keep.imageFailed)
    downloadBlob(await (await fetch(url)).blob(), safeFilename(name(), 'png'))
    setMessage(a.keep.imageReady)
  }
  return (
    <>
      <LabAction onClick={() => void save()}>{a.keep.png}</LabAction>
      <LabNote live>{message}</LabNote>
    </>
  )
}
