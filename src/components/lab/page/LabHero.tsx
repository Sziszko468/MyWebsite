import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { experimentPath } from '../../../content/lab'
import { Button } from '../../Button/Button'
import { Container } from '../../Container/Container'
import { labText } from '../../../content/labText'
import { useLocalized } from '../core/useLabText'
import { eggText } from '../easter/eggText'
import { pageText } from './pageText'
import styles from './LabHero.module.scss'
import { useCanvasLoop, type DrawFrame } from './useCanvasLoop'

const noise = (i: number, salt = 0) => {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453
  return x - Math.floor(x)
}

/** Racing-red speed lines that lean towards the pointer and quicken when it is near. */
function fieldDraw(): DrawFrame {
  const lines = Array.from({ length: 70 }, (_, i) => ({
    x: noise(i),
    y: noise(i, 1),
    length: 0.06 + noise(i, 2) * 0.24,
    speed: 0.03 + noise(i, 3) * 0.1,
    width: 0.6 + noise(i, 4) * 1.8,
    alpha: 0.12 + noise(i, 5) * 0.4,
  }))
  return (ctx, w, h, t, dt, pointer) => {
    ctx.clearRect(0, 0, w, h)
    const lean = pointer.inside ? (pointer.y / h - 0.5) * 0.7 : Math.sin(t * 0.25) * 0.08
    const angle = -0.32 + lean
    const dx = Math.cos(angle)
    const dy = Math.sin(angle)
    for (const line of lines) {
      let near = 0
      if (pointer.inside) {
        const d = Math.hypot(line.x * w - pointer.x, line.y * h - pointer.y)
        near = Math.max(0, 1 - d / (w * 0.28))
      }
      line.x += line.speed * dt * (1 + near * 5) * dx
      line.y += line.speed * dt * (1 + near * 5) * dy * (w / h) * 0.5
      if (line.x > 1.15) line.x = -0.15
      if (line.x < -0.2) line.x = 1.1
      if (line.y > 1.1) line.y = -0.1
      if (line.y < -0.1) line.y = 1.1
      const length = line.length * w * (1 + near * 1.4)
      const x = line.x * w
      const y = line.y * h
      const gradient = ctx.createLinearGradient(x - dx * length, y - dy * length, x, y)
      gradient.addColorStop(0, 'rgba(255, 22, 31, 0)')
      gradient.addColorStop(1, `rgba(255, 22, 31, ${Math.min(0.95, line.alpha + near * 0.5)})`)
      ctx.strokeStyle = gradient
      ctx.lineWidth = line.width * (1 + near)
      ctx.beginPath()
      ctx.moveTo(x - dx * length, y - dy * length)
      ctx.lineTo(x, y)
      ctx.stroke()
    }
  }
}

/** The headline in letters that stretch and lift towards the pointer (a mouse or a pen; a finger sees it still). */
function KineticHeadline({ id, text, onFind, dotLabel }: { id: string; text: string; onFind(): void; dotLabel: string }) {
  const root = useRef<HTMLHeadingElement>(null)
  const nameId = useId()
  const words = text.split(' ')

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
        letter.style.setProperty('--k', Math.max(0, 1 - d / 180).toFixed(3))
      }
    }
    const move = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return
      pointer = { x: event.clientX, y: event.clientY }
      if (!frame) frame = requestAnimationFrame(paint)
    }
    const leave = () => {
      pointer = null
      if (!frame) frame = requestAnimationFrame(paint)
    }
    window.addEventListener('pointermove', move, { passive: true })
    document.addEventListener('pointerleave', leave)
    return () => {
      window.removeEventListener('pointermove', move)
      document.removeEventListener('pointerleave', leave)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <h1 ref={root} id={id} className={styles.headline} aria-labelledby={nameId}>
      <span id={nameId} className="visually-hidden">
        {text}.
      </span>
      {words.map((word, w) => (
        <span key={`${word}-${w}`} className={styles.word}>
          <span className={styles.letters} aria-hidden="true">
            {[...word].map((letter, i) => (
              <span key={i} data-letter className={styles.letter} style={{ '--k': 0 } as CSSProperties}>
                {letter}
              </span>
            ))}
          </span>
          {w === words.length - 1 && (
            <button type="button" className={styles.dot} aria-label={dotLabel} onClick={onFind} data-egg-dot>
              .
            </button>
          )}
        </span>
      ))}
    </h1>
  )
}

/**
 * The Lab's first screen: carbon black, a field of Racing Red lines that lean towards the pointer, the
 * headline in letters that stretch under it, one line of promise and the way into the experiments. It
 * is plain markup and a small 2D canvas: nothing here waits for WebGL, so the way into the five
 * experiments is there at once.
 */
export function LabHero({ onFind }: { onFind(): void }) {
  const t = useLocalized(pageText)
  const egg = useLocalized(eggText)
  const [draw] = useState(fieldDraw)
  const canvas = useCanvasLoop(draw)

  return (
    <section className={styles.hero} aria-labelledby="lab-hero-title" data-theme="dark">
      <canvas ref={canvas} className={styles.field} aria-label={t.hero.fieldLabel} role="img" />
      <Container size="wide" className={styles.inner}>
        <p className={styles.eyebrow}>{t.hero.eyebrow}</p>
        <KineticHeadline id="lab-hero-title" text={t.hero.headline} onFind={onFind} dotLabel={egg.dotLabel} />
        <p className={styles.lead}>{t.hero.lead}</p>
        <div className={styles.actions}>
          <Button to={experimentPath('particle-universe')} size="lg" arrow magnetic>
            {t.hero.create}
          </Button>
          <Button href="#experiments" variant="secondary" size="lg">
            {t.hero.explore}
          </Button>
        </div>
        {/* The signature line is English on every page; saying so lets a screen reader pronounce it as English (WCAG 3.1.2). */}
        <p className={styles.signature} lang="en">
          {labText.signature}
        </p>
      </Container>
    </section>
  )
}
