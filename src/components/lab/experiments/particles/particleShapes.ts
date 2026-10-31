import { seededRandom } from '../../../hero/heroMath'

/**
 * The shapes the particles can form. Each is a function from a random generator to one point, so
 * a shape of any size is a plain run of that function: the first N points of a shape of M points
 * are an evenly spread (if thinner) version of the same shape, which is what lets the density
 * slider show fewer particles without the shape falling apart. Everything is deterministic: a
 * shape of the same size is the same every time.
 *
 * Units are the scene's: the shapes fit inside a box about 9 wide, 5 high and 4 deep.
 */

export const SHAPES = ['sphere', 'ring', 'wave', 'spiral', 'mark'] as const
export type ShapeId = (typeof SHAPES)[number]

type Random = () => number
type Point = readonly [number, number, number]

const TAU = Math.PI * 2

/** A thick shell: most points near the surface, some inside, so the sphere has depth to look into. */
function sphere(random: Random): Point {
  const z = random() * 2 - 1
  const angle = random() * TAU
  const ring = Math.sqrt(1 - z * z)
  const radius = 2.45 * (0.78 + 0.22 * Math.pow(random(), 0.6))
  return [Math.cos(angle) * ring * radius, z * radius, Math.sin(angle) * ring * radius]
}

/** A wide ring seen slightly from above, thick across and a little in height. */
function ring(random: Random): Point {
  const angle = random() * TAU
  const spread = (random() + random() + random() - 1.5) / 1.5
  const radius = 3 + spread * 0.62
  const height = (random() - 0.5) * 0.7
  const tilt = 0.42
  const x = Math.cos(angle) * radius
  const z = Math.sin(angle) * radius
  return [x * 1.12, height + z * Math.sin(tilt), z * Math.cos(tilt)]
}

/** A rolling sheet of points: two crossing waves. */
function wave(random: Random): Point {
  const x = (random() * 2 - 1) * 4.4
  const z = (random() * 2 - 1) * 2.6
  const y = Math.sin(x * 1.25 + z * 0.8) * 0.62 + Math.cos(z * 1.7 - x * 0.35) * 0.4 - 0.2
  return [x, y + (random() - 0.5) * 0.08, z]
}

/** A two-armed galaxy: arms wind out from a dense core, with some scatter. */
function spiral(random: Random): Point {
  const arm = random() < 0.5 ? 0 : Math.PI
  const t = Math.pow(random(), 0.7)
  const radius = 0.15 + t * 3.7
  const angle = arm + t * 5.4 + (random() - 0.5) * (0.35 + 0.5 * t)
  const lift = (random() - 0.5) * (0.5 - 0.3 * t) * 1.4
  const tilt = 0.5
  const x = Math.cos(angle) * radius * 1.15
  const z = Math.sin(angle) * radius
  return [x, lift + z * Math.sin(tilt), z * Math.cos(tilt)]
}

/**
 * An abstract mark: a broken circle of three arcs, a solid inner disc and one diagonal slash that
 * crosses both, the way the brand's slanted edges do. Drawn in the plane of the screen with a little depth.
 */
function mark(random: Random): Point {
  const part = random()
  if (part < 0.46) {
    // Three arcs with gaps between them.
    const arc = Math.floor(random() * 3)
    const start = arc * (TAU / 3) + 0.18
    const angle = start + random() * (TAU / 3 - 0.55)
    const radius = 2.7 + (random() - 0.5) * 0.34
    return [Math.cos(angle) * radius, Math.sin(angle) * radius, (random() - 0.5) * 0.5]
  }
  if (part < 0.7) {
    // The inner disc, denser in the middle.
    const angle = random() * TAU
    const radius = 1.05 * Math.sqrt(random())
    return [Math.cos(angle) * radius - 0.3, Math.sin(angle) * radius + 0.2, (random() - 0.5) * 0.4]
  }
  // The slash: a slanted band running through the whole mark.
  const along = (random() * 2 - 1) * 4
  const across = (random() - 0.5) * 0.36
  const slant = 0.62
  return [
    along * Math.cos(slant) - across * Math.sin(slant),
    along * Math.sin(slant) * 0.72 + across * Math.cos(slant),
    0.35 + (random() - 0.5) * 0.3,
  ]
}

const GENERATORS: Record<ShapeId, (random: Random) => Point> = { sphere, ring, wave, spiral, mark }

/** `count` points of a shape, as x, y, z triples. Each shape has its own seed, so two shapes are never the same cloud. */
export function generateShape(shape: ShapeId, count: number): Float32Array {
  const random = seededRandom(1013 + SHAPES.indexOf(shape) * 7919)
  const generate = GENERATORS[shape]
  const out = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    const point = generate(random)
    out[i * 3] = point[0]
    out[i * 3 + 1] = point[1]
    out[i * 3 + 2] = point[2]
  }
  return out
}

/** The largest distance from the origin any shape reaches, for the scene to fit them all on screen. */
export const SHAPE_EXTENT = { x: 4.9, y: 3.2 }
