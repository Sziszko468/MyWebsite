import type { MotionId } from './typeControls'

export interface Offset {
  x: number
  y: number
  z: number
  rx: number
  ry: number
  rz: number
  scale: number
}
const NO_OFFSET: Offset = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1 }
const offset: Offset = { ...NO_OFFSET }

const hash = (n: number) => {
  const x = Math.sin(n * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

/**
 * What a motion preset adds to a letter's pose, on top of the springs and the pointer: a function of the
 * letter, its place along the line and the animation's own time. One object is reused, so it allocates nothing.
 */
export function presetOffset(motion: MotionId, i: number, homeX: number, t: number, amount: number): Offset {
  Object.assign(offset, NO_OFFSET)
  if (motion === 'none' || amount <= 0) return offset
  switch (motion) {
    case 'drift':
      offset.y = Math.sin(t * 0.9 + i * 0.7) * 0.2 * amount
      offset.z = Math.sin(t * 0.6 + i) * 0.3 * amount
      offset.rz = Math.sin(t * 0.5 + i * 0.4) * 0.035 * amount
      break
    case 'wave':
      offset.y = Math.sin(t * 2.4 - homeX * 0.5) * 0.4 * amount
      offset.rx = Math.cos(t * 2.4 - homeX * 0.5) * 0.14 * amount
      break
    case 'pulse':
      offset.scale = 1 + Math.sin(t * 3 + i * 0.35) * 0.07 * amount
      offset.z = (0.5 + 0.5 * Math.sin(t * 3 + i * 0.35)) * 0.4 * amount
      break
    case 'orbit':
      offset.x = Math.cos(t * 1.3 + i * 0.9) * 0.22 * amount
      offset.y = Math.sin(t * 1.3 + i * 0.9) * 0.22 * amount
      offset.ry = Math.sin(t * 1.3 + i) * 0.3 * amount
      break
    case 'glitch': {
      // Three times a second at most a few letters jump aside, and at the next step they are back; nothing flashes.
      const step = Math.floor(t * 3)
      if (hash(step * 31.7 + i) > 0.86) {
        offset.x = (hash(step + i * 3.1) - 0.5) * 0.9 * amount
        offset.y = (hash(step * 1.7 + i) - 0.5) * 0.45 * amount
        offset.rz = (hash(step + i * 7.3) - 0.5) * 0.45 * amount
      }
      break
    }
  }
  return offset
}
