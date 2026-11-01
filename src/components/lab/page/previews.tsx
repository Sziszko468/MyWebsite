import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { LabId } from '../../../content/lab'
import { useLocalized } from '../core/useLabText'
import { pageText } from './pageText'
import styles from './Previews.module.scss'
import { useCanvasLoop, type DrawFrame, type PreviewPointer } from './useCanvasLoop'

/**
 * A live miniature of each experiment, for the overview page. They are not the experiments: they are
 * 2D canvases (or plain markup) a few dozen lines long that behave in the same spirit, cost nothing while
 * out of view and answer a mouse, a pen or a finger. The real thing is one click further.
 */
const RED = '#ff161f'
const PAPER = '#f4f0e8'

/** A pseudo-random number between 0 and 1 from an index: the same every time, so a preview never jumps on a re-render. */
const noise = (i: number, salt = 0) => {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453
  return x - Math.floor(x)
}

function particleDraw(): DrawFrame {
  const count = 150
  const home = Array.from({ length: count }, (_, i) => ({ a: noise(i) * Math.PI * 2, r: 0.18 + Math.sqrt(noise(i, 1)) * 0.42, s: 0.8 + noise(i, 2) * 1.6 }))
  const x = new Float32Array(count)
  const y = new Float32Array(count)
  let ready = false
  return (ctx, w, h, t, dt, pointer) => {
    const cx = w / 2
    const cy = h / 2
    const scale = Math.min(w, h)
    if (!ready) {
      for (let i = 0; i < count; i++) {
        x[i] = cx + Math.cos(home[i].a) * home[i].r * scale
        y[i] = cy + Math.sin(home[i].a) * home[i].r * scale
      }
      ready = true
    }
    ctx.fillStyle = '#0b0b0d'
    ctx.fillRect(0, 0, w, h)
    const radius = scale * 0.32
    for (let i = 0; i < count; i++) {
      const a = home[i].a + t * 0.12 * home[i].s
      const hx = cx + Math.cos(a) * home[i].r * scale
      const hy = cy + Math.sin(a) * home[i].r * scale * 0.86
      let fx = (hx - x[i]) * 6
      let fy = (hy - y[i]) * 6
      if (pointer.inside) {
        const dx = x[i] - pointer.x
        const dy = y[i] - pointer.y
        const d = Math.hypot(dx, dy) + 0.001
        if (d < radius) {
          const k = (1 - d / radius) * (pointer.down ? -1400 : 1000)
          fx += (dx / d) * k * 0.05 * radius * 0.02 * 10
          fy += (dy / d) * k * 0.05 * radius * 0.02 * 10
        }
      }
      x[i] += fx * dt * 4
      y[i] += fy * dt * 4
      const speed = Math.hypot(fx, fy)
      ctx.fillStyle = speed > 40 ? RED : PAPER
      ctx.globalAlpha = 0.55 + Math.min(0.45, speed / 200)
      ctx.beginPath()
      ctx.arc(x[i], y[i], 1.4 + home[i].s * 0.5, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }
}

function liquidDraw(): DrawFrame {
  return (ctx, w, h, t, _dt, pointer) => {
    ctx.fillStyle = '#0b0b0d'
    ctx.fillRect(0, 0, w, h)
    ctx.globalCompositeOperation = 'lighter'
    const base = Math.min(w, h)
    const blob = (x: number, y: number, r: number, strength: number) => {
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, r)
      gradient.addColorStop(0, `rgba(255, 60, 40, ${strength})`)
      gradient.addColorStop(1, 'rgba(255, 22, 31, 0)')
      ctx.fillStyle = gradient
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
    }
    for (let i = 0; i < 6; i++) {
      const a = t * (0.35 + i * 0.07) + i * 1.9
      blob(w / 2 + Math.cos(a) * base * 0.26 * (0.6 + noise(i) * 0.6), h / 2 + Math.sin(a * 1.3) * base * 0.2, base * (0.15 + noise(i, 3) * 0.08), 0.95)
    }
    blob(pointer.x, pointer.y, base * (pointer.down ? 0.3 : 0.2), pointer.inside ? 1 : 0)
    ctx.globalCompositeOperation = 'source-over'
  }
}

function spaceDraw(): DrawFrame {
  const rings = 26
  let depth = 0
  return (ctx, w, h, t, dt, pointer) => {
    ctx.fillStyle = '#05060f'
    ctx.fillRect(0, 0, w, h)
    const steer = pointer.inside ? { x: (pointer.x / w - 0.5) * 0.5, y: (pointer.y / h - 0.5) * 0.5 } : { x: Math.sin(t * 0.4) * 0.12, y: Math.cos(t * 0.3) * 0.08 }
    depth = (depth + dt * (pointer.down ? 1.4 : 0.35)) % 1
    const vx = w / 2 + steer.x * w * 0.6
    const vy = h / 2 + steer.y * h * 0.6
    for (let i = rings; i >= 0; i--) {
      const z = (i + depth) / rings
      const k = Math.pow(z, 2.4)
      const size = k * Math.max(w, h) * 1.1
      ctx.lineWidth = 1 + k * 2.2
      ctx.strokeStyle = i % 5 === 0 ? RED : `rgba(244, 240, 232, ${0.12 + k * 0.5})`
      ctx.globalAlpha = Math.min(1, k * 2.2)
      const x = vx + (w / 2 - vx) * k * 0.4
      const y = vy + (h / 2 - vy) * k * 0.4
      ctx.strokeRect(x - size / 2, y - size * 0.32, size, size * 0.64)
    }
    ctx.globalAlpha = 1
  }
}

function chromaticDraw(): DrawFrame {
  let split = 6
  return (ctx, w, h, t, dt, pointer) => {
    ctx.fillStyle = '#0b0b0d'
    ctx.fillRect(0, 0, w, h)
    const target = pointer.inside ? 6 + Math.hypot(pointer.x - w / 2, pointer.y - h / 2) * 0.12 + Math.hypot(pointer.vx, pointer.vy) * 0.5 : 6 + Math.sin(t * 1.4) * 4
    split += (target - split) * Math.min(1, dt * 8)
    const angle = pointer.inside ? Math.atan2(pointer.y - h / 2, pointer.x - w / 2) : t * 0.5
    const dx = Math.cos(angle) * split
    const dy = Math.sin(angle) * split
    ctx.globalCompositeOperation = 'lighter'
    ctx.font = `800 ${Math.min(w * 0.3, h * 0.55)}px Archivo Variable, system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const draw = (colour: string, ox: number, oy: number) => {
      ctx.fillStyle = colour
      ctx.fillText('RGB', w / 2 + ox, h / 2 + oy)
      ctx.beginPath()
      ctx.arc(w * 0.82 + ox, h * 0.25 + oy, Math.min(w, h) * 0.09, 0, Math.PI * 2)
      ctx.fill()
    }
    draw('#ff1a1a', -dx, -dy)
    draw('#16ff4a', 0, 0)
    draw('#2a5cff', dx, dy)
    ctx.globalCompositeOperation = 'source-over'
  }
}

const DRAWS: Partial<Record<LabId, () => DrawFrame>> = {
  'particle-universe': particleDraw,
  'liquid-matter': liquidDraw,
  'infinite-space': spaceDraw,
  'chromatic-distortion': chromaticDraw,
}

function CanvasPreview({ id }: { id: LabId }) {
  const [draw] = useState(() => (DRAWS[id] ?? particleDraw)())
  const ref = useCanvasLoop(draw)
  return <canvas ref={ref} className={styles.canvas} aria-hidden="true" />
}

/** Letters that stretch and lift towards the pointer. Plain markup: the pointer writes one number per letter. */
function TypePreview() {
  const root = useRef<HTMLDivElement>(null)
  const words = ['BREAK', 'THE', 'PATTERN']

  useEffect(() => {
    const element = root.current
    if (!element || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const letters = [...element.querySelectorAll<HTMLElement>('[data-letter]')]
    let frame = 0
    let pointer: { x: number; y: number } | null = null
    const paint = () => {
      frame = 0
      for (const letter of letters) {
        const box = letter.getBoundingClientRect()
        const d = pointer ? Math.hypot(box.left + box.width / 2 - pointer.x, box.top + box.height / 2 - pointer.y) : 999
        const k = Math.max(0, 1 - d / 150)
        letter.style.setProperty('--k', k.toFixed(3))
      }
    }
    const move = (event: PointerEvent) => {
      pointer = { x: event.clientX, y: event.clientY }
      if (!frame) frame = requestAnimationFrame(paint)
    }
    const leave = () => {
      pointer = null
      if (!frame) frame = requestAnimationFrame(paint)
    }
    element.addEventListener('pointermove', move)
    element.addEventListener('pointerleave', leave)
    return () => {
      element.removeEventListener('pointermove', move)
      element.removeEventListener('pointerleave', leave)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <div ref={root} className={styles.type} aria-hidden="true">
      {words.map((word) => (
        <span key={word} className={styles.typeWord}>
          {[...word].map((letter, index) => (
            <span key={index} data-letter className={styles.typeLetter} style={{ '--i': index } as CSSProperties}>
              {letter}
            </span>
          ))}
        </span>
      ))}
    </div>
  )
}

export function Preview({ id }: { id: LabId }) {
  if (id === 'type-in-motion') return <TypePreview />
  return <CanvasPreview id={id} />
}

export function PreviewHint({ id }: { id: LabId }) {
  const t = useLocalized(pageText)
  return <>{t.discovery.previewHint[id]}</>
}

export type { PreviewPointer }
