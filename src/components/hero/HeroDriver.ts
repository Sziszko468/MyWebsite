import { CursorController } from './CursorController'
import { clamp, clockSeconds } from './heroMath'
import { ScrollTransition } from './ScrollTransition'

const INTERACTIVE = 'a, button, input, select, textarea, [role="button"]'
const TAP_MS = 350
const TAP_PX = 12
/** CSS variables are rewritten only when a value has moved by at least this much. */
const CSS_STEP = 0.0015

interface TouchStart {
  id: number
  x: number
  y: number
  at: number
}

/**
 * Connects the page to the generative scene. It listens (passively) for the pointer, scroll and
 * clicks, feeds them to the cursor and scroll controllers, and runs one small loop that eases
 * both and mirrors them into CSS variables for the typography and the fallback. The loop sleeps
 * as soon as everything has settled, and nothing here ever calls preventDefault: scrolling and
 * the page's links and buttons work exactly as without it.
 *
 * The scene reads `cursor` and `scroll` straight from this object every frame, so none of this
 * reaches React state.
 *
 * Variables written on the root element:
 *   --hero-cx, --hero-cy   eased pointer position, -1..1
 *   --hero-energy          0..1
 *   --hero-progress        eased scroll-out progress of the hero, 0..1
 */
export class HeroDriver {
  readonly cursor = new CursorController()
  readonly scroll = new ScrollTransition()

  private section: HTMLElement | null = null
  private stage: HTMLElement | null = null
  private root: HTMLElement | null = null
  private motion = false
  private visible = true
  private frame = 0
  private last = 0
  private touch: TouchStart | null = null
  private readonly written = { cx: NaN, cy: NaN, energy: NaN, progress: NaN }
  private readonly listeners = new Set<() => void>()

  /** Starts listening. Returns the function that stops everything and clears the CSS variables. */
  attach(section: HTMLElement, stage: HTMLElement, root: HTMLElement, motion: boolean): () => void {
    this.section = section
    this.stage = stage
    this.root = root
    this.motion = motion

    if (!motion) {
      // Reduced motion: no listeners, no loop, no variables. Everything stays at rest.
      this.cursor.rest()
      this.scroll.rest()
      return () => undefined
    }

    window.addEventListener('pointermove', this.onPointerMove, { passive: true })
    window.addEventListener('scroll', this.onScroll, { passive: true })
    section.addEventListener('pointerdown', this.onPointerDown, { passive: true })
    section.addEventListener('pointerup', this.onPointerUp, { passive: true })
    section.addEventListener('pointercancel', this.onPointerCancel, { passive: true })
    document.addEventListener('visibilitychange', this.onVisibility)

    this.onScroll()
    this.wake()

    return () => {
      window.removeEventListener('pointermove', this.onPointerMove)
      window.removeEventListener('scroll', this.onScroll)
      section.removeEventListener('pointerdown', this.onPointerDown)
      section.removeEventListener('pointerup', this.onPointerUp)
      section.removeEventListener('pointercancel', this.onPointerCancel)
      document.removeEventListener('visibilitychange', this.onVisibility)
      this.sleep()
      this.clearVariables()
      this.cursor.rest()
      this.scroll.rest()
    }
  }

  /**
   * Calls `listener` whenever input arrives that may need a new frame. A scene that renders only
   * on demand uses this to wake up. Returns the function that unsubscribes.
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Sends a click wave from a client position, as if the visitor had clicked there. Ignored outside the stage. */
  wave(clientX: number, clientY: number, strength = 1): void {
    const point = this.toStage(clientX, clientY)
    if (!point?.inside) return
    this.cursor.ripple(point.x, point.y, clockSeconds(), strength)
    this.wake()
  }

  /** Whether the hero is on screen. Off screen the loop sleeps. */
  setVisible(visible: boolean): void {
    this.visible = visible
    if (visible) this.wake()
    else this.sleep()
  }

  private wake(): void {
    for (const listener of this.listeners) listener()
    if (!this.motion || !this.visible || document.hidden || this.frame !== 0) return
    this.last = performance.now()
    this.frame = requestAnimationFrame(this.tick)
  }

  private sleep(): void {
    if (this.frame !== 0) cancelAnimationFrame(this.frame)
    this.frame = 0
  }

  private readonly tick = (now: number): void => {
    this.frame = 0
    const dt = Math.min((now - this.last) / 1000, 0.05)
    this.last = now

    this.cursor.update(dt)
    this.scroll.update(dt)
    this.writeVariables()

    if (!this.cursor.settled || !this.scroll.settled) this.frame = requestAnimationFrame(this.tick)
  }

  /** Pointer position in the scene's own screen space: -1..1 across the stage, y up. */
  private toStage(clientX: number, clientY: number): { x: number; y: number; inside: boolean } | null {
    const rect = this.stage?.getBoundingClientRect()
    if (!rect || rect.width === 0 || rect.height === 0) return null
    const x = ((clientX - rect.left) / rect.width) * 2 - 1
    const y = 1 - ((clientY - rect.top) / rect.height) * 2
    return { x, y, inside: Math.abs(x) <= 1 && Math.abs(y) <= 1 }
  }

  private readonly onPointerMove = (event: PointerEvent): void => {
    const point = this.toStage(event.clientX, event.clientY)
    if (!point) return
    this.cursor.setTarget(point.x, point.y)
    this.wake()
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (event.target instanceof Element && event.target.closest(INTERACTIVE)) return

    if (event.pointerType === 'touch') {
      // A touch might be the start of a scroll; it only becomes a wave if it ends as a tap.
      this.touch = { id: event.pointerId, x: event.clientX, y: event.clientY, at: performance.now() }
      return
    }
    this.wave(event.clientX, event.clientY)
  }

  private readonly onPointerUp = (event: PointerEvent): void => {
    const start = this.touch
    this.touch = null
    if (!start || start.id !== event.pointerId) return
    const quick = performance.now() - start.at < TAP_MS
    const still = Math.hypot(event.clientX - start.x, event.clientY - start.y) < TAP_PX
    if (quick && still) this.wave(event.clientX, event.clientY)
  }

  private readonly onPointerCancel = (): void => {
    this.touch = null
  }

  private readonly onScroll = (): void => {
    const rect = this.section?.getBoundingClientRect()
    if (!rect) return
    this.scroll.setTarget(-rect.top / Math.max(rect.height, 1))
    this.wake()
  }

  private readonly onVisibility = (): void => {
    if (document.hidden) this.sleep()
    else this.wake()
  }

  private writeVariables(): void {
    const root = this.root
    if (!root) return
    this.put(root, '--hero-cx', 'cx', this.cursor.x)
    this.put(root, '--hero-cy', 'cy', this.cursor.y)
    this.put(root, '--hero-energy', 'energy', clamp(this.cursor.energy))
    this.put(root, '--hero-progress', 'progress', this.scroll.progress)
  }

  private put(root: HTMLElement, name: string, key: keyof HeroDriver['written'], value: number): void {
    const previous = this.written[key]
    if (!Number.isNaN(previous) && Math.abs(value - previous) < CSS_STEP) return
    this.written[key] = value
    root.style.setProperty(name, value.toFixed(3))
  }

  private clearVariables(): void {
    const root = this.root
    if (!root) return
    for (const name of ['--hero-cx', '--hero-cy', '--hero-energy', '--hero-progress']) root.style.removeProperty(name)
    this.written.cx = this.written.cy = this.written.energy = this.written.progress = Number.NaN
  }
}
