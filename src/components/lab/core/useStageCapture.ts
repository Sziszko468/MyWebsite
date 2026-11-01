import { useFrame, useThree } from '@react-three/fiber'
import { useCallback, useRef } from 'react'

/**
 * What a page can ask of the picture a stage is drawing: the picture itself, as a PNG, at full size
 * for a download or small for a preview. Only the renderer can do this, so a scene hands the page
 * this function; the page keeps working (without a picture) when there is no scene.
 */
export type CaptureKind = 'full' | 'thumb'
export interface StageCapture {
  capture(kind: CaptureKind): Promise<string | null>
}

/** A preview is made smaller until it is light enough to keep with a work. */
const THUMB_LIMIT = 120_000

type Request = { kind: CaptureKind; resolve: (url: string | null) => void }

/**
 * Returns `capture`, to be called from the page. The picture is taken inside a frame, after the
 * scene has been drawn into it again: a WebGL canvas is emptied once the browser has shown it, and
 * a frame the pacer skipped (a fast screen) or a calm canvas that did not draw would give a blank
 * image if it were read as it stands.
 */
export function useStageCapture(): StageCapture['capture'] {
  const gl = useThree((state) => state.gl)
  const invalidate = useThree((state) => state.invalidate)
  const waiting = useRef<Request[]>([])

  const capture = useCallback(
    (kind: CaptureKind) =>
      new Promise<string | null>((resolve) => {
        waiting.current.push({ kind, resolve })
        invalidate()
      }),
    [invalidate],
  )

  useFrame((state) => {
    if (waiting.current.length === 0) return
    const requests = waiting.current.splice(0)
    try {
      state.gl.render(state.scene, state.camera)
    } catch {
      for (const { resolve } of requests) resolve(null)
      return
    }
    for (const { kind, resolve } of requests) {
      try {
        if (kind === 'full') {
          resolve(gl.domElement.toDataURL('image/png'))
          continue
        }
        let width = 200
        let url = ''
        for (let attempt = 0; attempt < 4; attempt++) {
          const canvas = document.createElement('canvas')
          canvas.width = width
          canvas.height = Math.round(width * 0.6)
          const g = canvas.getContext('2d')
          if (!g) break
          g.fillStyle = '#0b0b0d'
          g.fillRect(0, 0, canvas.width, canvas.height)
          const source = gl.domElement
          // The middle of the picture, in the preview's proportions.
          const ratio = Math.min(source.width / canvas.width, source.height / canvas.height)
          const w = canvas.width * ratio
          const h = canvas.height * ratio
          g.drawImage(source, (source.width - w) / 2, (source.height - h) / 2, w, h, 0, 0, canvas.width, canvas.height)
          url = canvas.toDataURL('image/png')
          if (url.length < THUMB_LIMIT) break
          width = Math.round(width * 0.7)
        }
        resolve(url || null)
      } catch {
        resolve(null)
      }
    }
  }, 2)

  return capture
}
