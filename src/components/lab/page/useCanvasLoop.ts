import { useEffect, useRef, type RefObject } from 'react'

export interface PreviewPointer {
  /** Position in CSS pixels inside the canvas (the middle until the pointer has been there). */
  x: number
  y: number
  vx: number
  vy: number
  inside: boolean
  down: boolean
}

export type DrawFrame = (ctx: CanvasRenderingContext2D, width: number, height: number, time: number, dt: number, pointer: PreviewPointer) => void

/**
 * A small 2D canvas that draws only while it is on screen and the tab is visible, answers a mouse, a
 * pen or a finger, and under "reduce motion" draws one still picture and redraws it only when the
 * visitor moves over it. It is for the Lab's previews, which must cost almost nothing next to the
 * experiments they stand for: no WebGL, a capped pixel ratio, no loop while out of view.
 */
export function useCanvasLoop(draw: DrawFrame): RefObject<HTMLCanvasElement | null> {
  const ref = useRef<HTMLCanvasElement | null>(null)
  const latest = useRef(draw)
  useEffect(() => {
    latest.current = draw
  })

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const pointer: PreviewPointer = { x: 0, y: 0, vx: 0, vy: 0, inside: false, down: false }
    let width = 0
    let height = 0
    let dpr = 1
    let visible = true
    let frame = 0
    let last = 0
    let time = 0

    const resize = () => {
      const box = canvas.getBoundingClientRect()
      dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      width = Math.max(1, Math.round(box.width))
      height = Math.max(1, Math.round(box.height))
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      if (!pointer.inside) {
        pointer.x = width / 2
        pointer.y = height / 2
      }
      paint(0)
    }

    const paint = (dt: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      latest.current(ctx, width, height, time, dt, pointer)
      pointer.vx *= 0.85
      pointer.vy *= 0.85
    }

    const tick = (now: number) => {
      frame = 0
      if (!visible || document.hidden) return
      const dt = Math.min(0.05, (now - last) / 1000 || 0.016)
      last = now
      time += dt
      paint(dt)
      frame = requestAnimationFrame(tick)
    }
    const start = () => {
      if (reduced || frame || !visible || document.hidden) return
      last = performance.now()
      frame = requestAnimationFrame(tick)
    }

    const move = (event: PointerEvent) => {
      const box = canvas.getBoundingClientRect()
      const x = event.clientX - box.left
      const y = event.clientY - box.top
      pointer.vx += x - pointer.x
      pointer.vy += y - pointer.y
      pointer.x = x
      pointer.y = y
      pointer.inside = true
      if (reduced) {
        time += 0.05
        paint(0.016)
      }
    }
    const enter = (event: PointerEvent) => {
      pointer.inside = true
      move(event)
      start()
    }
    const leave = () => {
      pointer.inside = false
      pointer.down = false
    }
    const down = (event: PointerEvent) => {
      pointer.down = true
      move(event)
    }
    const up = () => {
      pointer.down = false
    }

    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      if (visible) start()
    })
    observer.observe(canvas)
    const sizes = new ResizeObserver(resize)
    sizes.observe(canvas)
    const onVisibility = () => start()
    document.addEventListener('visibilitychange', onVisibility)
    canvas.addEventListener('pointerenter', enter)
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerleave', leave)
    canvas.addEventListener('pointerdown', down)
    canvas.addEventListener('pointerup', up)
    canvas.addEventListener('pointercancel', leave)
    resize()
    if (reduced) {
      time = 2
      paint(0)
    } else start()
    return () => {
      if (frame) cancelAnimationFrame(frame)
      observer.disconnect()
      sizes.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      canvas.removeEventListener('pointerenter', enter)
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerleave', leave)
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointerup', up)
      canvas.removeEventListener('pointercancel', leave)
    }
  }, [])

  return ref
}
