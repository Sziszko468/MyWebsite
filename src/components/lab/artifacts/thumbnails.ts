import { SETUP_KEYS, SETUP_RANGES, type CarSetup } from '../experiences/racing/carSetup'
import type { TrackSamples } from '../experiences/racing/trackModel'

/**
 * Small preview pictures for the artifacts, drawn on a canvas with no WebGL and no download: the
 * track's outline, the setup as a row of bars. They are PNG data URLs of a few kilobytes.
 */
const WIDTH = 240
const HEIGHT = 160

function canvas(): [HTMLCanvasElement, CanvasRenderingContext2D] | null {
  const element = document.createElement('canvas')
  element.width = WIDTH
  element.height = HEIGHT
  const g = element.getContext('2d')
  if (!g) return null
  g.fillStyle = '#0d1020'
  g.fillRect(0, 0, WIDTH, HEIGHT)
  g.strokeStyle = 'rgba(68, 92, 255, 0.25)'
  g.lineWidth = 1
  for (let x = 20; x < WIDTH; x += 20) {
    g.beginPath()
    g.moveTo(x, 0)
    g.lineTo(x, HEIGHT)
    g.stroke()
  }
  for (let y = 20; y < HEIGHT; y += 20) {
    g.beginPath()
    g.moveTo(0, y)
    g.lineTo(WIDTH, y)
    g.stroke()
  }
  return [element, g]
}

export function trackThumbnail(samples: TrackSamples): string | undefined {
  const made = canvas()
  if (!made) return undefined
  const [element, g] = made
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (let i = 0; i < samples.count; i++) {
    minX = Math.min(minX, samples.x[i])
    maxX = Math.max(maxX, samples.x[i])
    minZ = Math.min(minZ, samples.z[i])
    maxZ = Math.max(maxZ, samples.z[i])
  }
  const pad = 16
  const scale = Math.min((WIDTH - pad * 2) / Math.max(maxX - minX, 1), (HEIGHT - pad * 2) / Math.max(maxZ - minZ, 1))
  const ox = (WIDTH - (maxX - minX) * scale) / 2
  const oz = (HEIGHT - (maxZ - minZ) * scale) / 2
  const step = Math.max(1, Math.floor(samples.count / 200))
  g.lineJoin = 'round'
  g.lineCap = 'round'
  g.strokeStyle = '#f4f0e8'
  g.lineWidth = 5
  g.beginPath()
  for (let i = 0; i < samples.count; i += step) {
    const x = ox + (samples.x[i] - minX) * scale
    const z = oz + (samples.z[i] - minZ) * scale
    if (i === 0) g.moveTo(x, z)
    else g.lineTo(x, z)
  }
  if (samples.closed) g.closePath()
  g.stroke()
  g.fillStyle = '#ff161f'
  g.beginPath()
  g.arc(ox + (samples.x[0] - minX) * scale, oz + (samples.z[0] - minZ) * scale, 5, 0, Math.PI * 2)
  g.fill()
  return element.toDataURL('image/png')
}

export function setupThumbnail(setup: CarSetup): string | undefined {
  const made = canvas()
  if (!made) return undefined
  const [element, g] = made
  const bar = (WIDTH - 24) / SETUP_KEYS.length
  SETUP_KEYS.forEach((key, i) => {
    const { min, max } = SETUP_RANGES[key]
    const level = (setup[key] - min) / (max - min)
    const height = 12 + level * (HEIGHT - 40)
    g.fillStyle = i % 3 === 0 ? '#ff161f' : i % 3 === 1 ? '#445cff' : '#f4f0e8'
    g.fillRect(12 + i * bar + 3, HEIGHT - 14 - height, bar - 6, height)
  })
  return element.toDataURL('image/png')
}
