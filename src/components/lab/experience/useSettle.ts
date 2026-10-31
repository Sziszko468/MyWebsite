import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'

/**
 * Asks an on-demand canvas for a few more frames just after it appears. The first frame can be drawn
 * before the shader programs have finished compiling or the lazy parts have arrived, and a canvas that
 * only draws when asked would then show nothing until the visitor touched it.
 */
export function useSettle(): void {
  const invalidate = useThree((state) => state.invalidate)
  useEffect(() => {
    const timers = [120, 450, 1200, 2600].map((delay) => window.setTimeout(invalidate, delay))
    return () => timers.forEach((id) => window.clearTimeout(id))
  }, [invalidate])
}
