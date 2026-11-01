import { MathUtils, Vector3, type Camera, type OrthographicCamera, type PerspectiveCamera } from 'three'

/**
 * The camera of every 3D tool: orbit, pan and zoom, with a mouse, a finger or a keyboard, and
 * smooth damping. It is a controller, not a component: it listens to one element, keeps its own
 * goal (target, distance, angles), eases the real camera towards it and says whether it is still
 * moving, so an on-demand canvas knows when it may stop drawing.
 *
 *   one pointer (left button or one finger)    orbit
 *   right or middle button, or Shift           pan
 *   two fingers                                pinch to zoom, drag to pan
 *   wheel                                      zoom (the cursor stays over the same point only roughly; this is a tool, not a map)
 *   arrow keys, + and − on the focused element orbit and zoom
 *
 * `shouldStart` lets a tool claim a press first (a gizmo handle, an object): when it returns
 * false the controller ignores that press entirely.
 */
export interface OrbitOptions {
  minRadius?: number
  maxRadius?: number
  /** Lowest polar angle allowed (radians from straight up). */
  minPhi?: number
  /** Highest polar angle allowed; below π/2 keeps the camera above the ground. */
  maxPhi?: number
}

const ORBIT_SPEED = 0.006
const KEY_ORBIT = 0.12
const DAMPING_SECONDS = 0.09

export class OrbitController {
  readonly target = new Vector3(0, 0.6, 0)
  radius = 9
  theta = 0.75
  phi = 1.12

  minRadius: number
  maxRadius: number
  minPhi: number
  maxPhi: number
  enabled = true
  /** When true one pointer pans instead of orbiting (a phone has no right button or Shift). */
  primaryPans = false
  /** Called whenever the goal changes, so an on-demand canvas can ask for a frame. */
  onChange: (() => void) | null = null
  /** Return false to refuse a press (something else, like a gizmo handle, has it). */
  shouldStart: ((event: PointerEvent) => boolean) | null = null

  private goalTarget = new Vector3(0, 0.6, 0)
  private goalRadius = 9
  private goalTheta = 0.75
  private goalPhi = 1.12
  private readonly pointers = new Map<number, { x: number; y: number }>()
  private mode: 'none' | 'orbit' | 'pan' | 'pinch' = 'none'
  private pinchDistance = 0
  private pinchCentre = { x: 0, y: 0 }
  private readonly right = new Vector3()
  private readonly up = new Vector3()
  private readonly offset = new Vector3()

  constructor(options: OrbitOptions = {}) {
    this.minRadius = options.minRadius ?? 1.5
    this.maxRadius = options.maxRadius ?? 60
    this.minPhi = options.minPhi ?? 0.08
    this.maxPhi = options.maxPhi ?? Math.PI * 0.495
  }

  /** Jumps to a view without easing. */
  set(target: Vector3, radius: number, theta: number, phi: number): void {
    this.target.copy(target)
    this.goalTarget.copy(target)
    this.radius = this.goalRadius = MathUtils.clamp(radius, this.minRadius, this.maxRadius)
    this.theta = this.goalTheta = theta
    this.phi = this.goalPhi = MathUtils.clamp(phi, this.minPhi, this.maxPhi)
    this.onChange?.()
  }

  /** Eases to a view. */
  goTo(target: Vector3, radius: number, theta: number, phi: number): void {
    this.goalTarget.copy(target)
    this.goalRadius = MathUtils.clamp(radius, this.minRadius, this.maxRadius)
    // Turn the short way round.
    const turn = ((((theta - this.theta) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2)) - Math.PI
    this.goalTheta = this.theta + turn
    this.goalPhi = MathUtils.clamp(phi, this.minPhi, this.maxPhi)
    this.onChange?.()
  }

  orbitBy(dTheta: number, dPhi: number): void {
    this.goalTheta += dTheta
    this.goalPhi = MathUtils.clamp(this.goalPhi + dPhi, this.minPhi, this.maxPhi)
    this.onChange?.()
  }

  zoomBy(factor: number): void {
    this.goalRadius = MathUtils.clamp(this.goalRadius * factor, this.minRadius, this.maxRadius)
    this.onChange?.()
  }

  panBy(screenDx: number, screenDy: number, camera: Camera, viewportHeight: number): void {
    const perspective = camera as PerspectiveCamera
    const ortho = camera as OrthographicCamera
    const worldPerPixel = perspective.isPerspectiveCamera
      ? (2 * this.goalRadius * Math.tan(MathUtils.degToRad(perspective.fov) / 2)) / Math.max(viewportHeight, 1)
      : (ortho.top - ortho.bottom) / ortho.zoom / Math.max(viewportHeight, 1)
    this.right.setFromMatrixColumn(camera.matrixWorld, 0)
    this.up.setFromMatrixColumn(camera.matrixWorld, 1)
    this.goalTarget.addScaledVector(this.right, -screenDx * worldPerPixel)
    this.goalTarget.addScaledVector(this.up, screenDy * worldPerPixel)
    this.onChange?.()
  }

  attach(element: HTMLElement, getCamera: () => Camera): () => void {
    const rect = () => element.getBoundingClientRect()

    const onDown = (event: PointerEvent) => {
      if (!this.enabled) return
      // A button, link or field laid over the stage keeps its own press: capturing the pointer here would send the click to the stage instead.
      if (event.target instanceof Element && event.target.closest('button, a, input, select, textarea, label, summary, [role="button"]')) return
      if (this.shouldStart && !this.shouldStart(event)) return
      if (event.pointerType === 'mouse' && ![0, 1, 2].includes(event.button)) return
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
      try {
        element.setPointerCapture(event.pointerId)
      } catch {
        // The pointer may already be gone.
      }
      if (this.pointers.size === 1) {
        this.mode = event.button === 1 || event.button === 2 || event.shiftKey || this.primaryPans ? 'pan' : 'orbit'
      } else if (this.pointers.size === 2) {
        this.mode = 'pinch'
        const [a, b] = [...this.pointers.values()]
        this.pinchDistance = Math.hypot(a.x - b.x, a.y - b.y)
        this.pinchCentre = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      }
    }

    const onMove = (event: PointerEvent) => {
      const previous = this.pointers.get(event.pointerId)
      if (!previous) return
      const dx = event.clientX - previous.x
      const dy = event.clientY - previous.y
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })

      if (this.mode === 'orbit') {
        this.orbitBy(-dx * ORBIT_SPEED, -dy * ORBIT_SPEED)
      } else if (this.mode === 'pan') {
        this.panBy(dx, dy, getCamera(), rect().height)
      } else if (this.mode === 'pinch' && this.pointers.size >= 2) {
        const [a, b] = [...this.pointers.values()]
        const distance = Math.hypot(a.x - b.x, a.y - b.y)
        const centre = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
        if (this.pinchDistance > 0 && distance > 0) this.zoomBy(this.pinchDistance / distance)
        this.panBy(centre.x - this.pinchCentre.x, centre.y - this.pinchCentre.y, getCamera(), rect().height)
        this.pinchDistance = distance
        this.pinchCentre = centre
      }
    }

    const onUp = (event: PointerEvent) => {
      this.pointers.delete(event.pointerId)
      try {
        element.releasePointerCapture(event.pointerId)
      } catch {
        // Nothing to release.
      }
      if (this.pointers.size === 0) this.mode = 'none'
      else if (this.pointers.size === 1) {
        // One finger is left after a pinch: carry on orbiting with it, from where it is.
        this.mode = 'orbit'
      }
    }

    const onWheel = (event: WheelEvent) => {
      if (!this.enabled) return
      event.preventDefault()
      this.zoomBy(Math.exp(event.deltaY * (event.deltaMode === 1 ? 0.04 : 0.0012)))
    }

    const onKey = (event: KeyboardEvent) => {
      if (!this.enabled || event.target !== element) return
      switch (event.key) {
        case 'ArrowLeft':
          this.orbitBy(KEY_ORBIT, 0)
          break
        case 'ArrowRight':
          this.orbitBy(-KEY_ORBIT, 0)
          break
        case 'ArrowUp':
          this.orbitBy(0, KEY_ORBIT)
          break
        case 'ArrowDown':
          this.orbitBy(0, -KEY_ORBIT)
          break
        case '+':
        case '=':
          this.zoomBy(0.85)
          break
        case '-':
        case '_':
          this.zoomBy(1 / 0.85)
          break
        default:
          return
      }
      event.preventDefault()
    }

    const onContextMenu = (event: Event) => event.preventDefault()

    element.addEventListener('pointerdown', onDown)
    element.addEventListener('pointermove', onMove)
    element.addEventListener('pointerup', onUp)
    element.addEventListener('pointercancel', onUp)
    element.addEventListener('wheel', onWheel, { passive: false })
    element.addEventListener('keydown', onKey)
    element.addEventListener('contextmenu', onContextMenu)
    return () => {
      element.removeEventListener('pointerdown', onDown)
      element.removeEventListener('pointermove', onMove)
      element.removeEventListener('pointerup', onUp)
      element.removeEventListener('pointercancel', onUp)
      element.removeEventListener('wheel', onWheel)
      element.removeEventListener('keydown', onKey)
      element.removeEventListener('contextmenu', onContextMenu)
      this.pointers.clear()
      this.mode = 'none'
    }
  }

  /** Eases the camera towards the goal. Returns true while it is still moving. */
  update(dt: number, camera: Camera, viewportHeight = 800): boolean {
    const k = 1 - Math.exp(-dt / DAMPING_SECONDS)
    this.target.lerp(this.goalTarget, k)
    this.radius += (this.goalRadius - this.radius) * k
    this.theta += (this.goalTheta - this.theta) * k
    this.phi += (this.goalPhi - this.phi) * k

    const sinPhi = Math.sin(this.phi)
    this.offset
      .set(sinPhi * Math.sin(this.theta), Math.cos(this.phi), sinPhi * Math.cos(this.theta))
      .multiplyScalar(this.radius)
    camera.position.copy(this.target).add(this.offset)
    camera.lookAt(this.target)

    const ortho = camera as OrthographicCamera
    if (ortho.isOrthographicCamera) {
      // The orthographic frustum is in pixels, so the zoom is how many pixels one unit of the scene is.
      const zoom = viewportHeight / (this.radius * 1.15)
      if (Math.abs(ortho.zoom - zoom) > 1e-4) {
        ortho.zoom = zoom
        ortho.updateProjectionMatrix()
      }
    }

    return (
      this.target.distanceToSquared(this.goalTarget) > 1e-6 ||
      Math.abs(this.goalRadius - this.radius) > 1e-3 ||
      Math.abs(this.goalTheta - this.theta) > 1e-3 ||
      Math.abs(this.goalPhi - this.phi) > 1e-3 ||
      this.mode !== 'none'
    )
  }
}
