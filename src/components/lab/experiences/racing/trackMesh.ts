import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  LinearMipmapLinearFilter,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  RepeatWrapping,
  SRGBColorSpace,
  Vector3,
  BoxGeometry,
  type Material,
  type Texture,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { TRACK, type TrackSamples } from './trackModel'

/**
 * The track as geometry, built once from its samples: the road with its edge lines, kerbs, run-off
 * (grass and gravel), barriers, the embankment under a raised road, the start/finish gantry with its
 * lights, the sector gates, a ground plane, and trees, grandstands and hills round about. Strips
 * share vertices along the track; all colour is vertex colour or one small canvas texture, so there
 * is nothing to download. `dispose()` releases everything it made.
 */
export interface BuiltTrack {
  root: Group
  groundY: number
  /** Lights the five start lights, 0 to 5, and turns them green when `go`. */
  setLights(count: number, go: boolean): void
  /** A wet road: darker and shinier, so it reflects the sky. */
  setWet(wet: boolean): void
  dispose(): void
}

export interface TrackLook {
  /** 'high' builds more scenery than 'low'. */
  tier: 'high' | 'medium' | 'low'
  /** A sunset palette; otherwise a clear afternoon. */
  dusk: boolean
  /** Same seed, same trees: the shape's signature. */
  seed: string
  /** Scenery and the gantry are left out of a plain preview. */
  scenery?: boolean
}

class MeshData {
  positions: number[] = []
  colors: number[] = []
  uvs: number[] = []
  indices: number[] = []

  vertex(x: number, y: number, z: number, colour: Color, u = 0, v = 0): number {
    this.positions.push(x, y, z)
    this.colors.push(colour.r, colour.g, colour.b)
    this.uvs.push(u, v)
    return this.positions.length / 3 - 1
  }

  tri(a: number, b: number, c: number): void {
    this.indices.push(a, b, c)
  }

  quad(a: number, b: number, c: number, d: number): void {
    this.indices.push(a, b, c, b, d, c)
  }

  get empty(): boolean {
    return this.indices.length === 0
  }

  toGeometry(): BufferGeometry {
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(this.positions), 3))
    geometry.setAttribute('color', new BufferAttribute(new Float32Array(this.colors), 3))
    geometry.setAttribute('uv', new BufferAttribute(new Float32Array(this.uvs), 2))
    geometry.setIndex(this.indices)
    geometry.computeVertexNormals()
    geometry.computeBoundingSphere()
    return geometry
  }
}

/** A small deterministic random number generator (mulberry32), seeded from text. */
export function seeded(seed: string): () => number {
  let h = 1779033703
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  let a = h >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function canvasTexture(width: number, height: number, draw: (g: CanvasRenderingContext2D) => void): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const g = canvas.getContext('2d')
  if (g) draw(g)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.minFilter = LinearMipmapLinearFilter
  texture.anisotropy = 4
  return texture
}

function noise(g: CanvasRenderingContext2D, width: number, height: number, amount: number): void {
  const image = g.getImageData(0, 0, width, height)
  let s = 12345
  for (let i = 0; i < image.data.length; i += 4) {
    s = (s * 1664525 + 1013904223) >>> 0
    const n = ((s >>> 24) / 255 - 0.5) * amount
    image.data[i] = Math.max(0, Math.min(255, image.data[i] + n))
    image.data[i + 1] = Math.max(0, Math.min(255, image.data[i + 1] + n))
    image.data[i + 2] = Math.max(0, Math.min(255, image.data[i + 2] + n))
  }
  g.putImageData(image, 0, 0)
}

/** Asphalt across the road with an edge line each side and two darker lanes where the tyres run. */
function roadTexture(): CanvasTexture {
  return canvasTexture(256, 256, (g) => {
    g.fillStyle = '#44444b'
    g.fillRect(0, 0, 256, 256)
    noise(g, 256, 256, 26)
    g.fillStyle = 'rgba(10,10,14,0.2)'
    g.fillRect(70, 0, 34, 256)
    g.fillRect(152, 0, 34, 256)
    g.fillStyle = '#f4f0e8'
    g.fillRect(4, 0, 4, 256)
    g.fillRect(248, 0, 4, 256)
  })
}

function grainTexture(): CanvasTexture {
  return canvasTexture(128, 128, (g) => {
    g.fillStyle = '#bdbdbd'
    g.fillRect(0, 0, 128, 128)
    noise(g, 128, 128, 70)
  })
}

function finishTexture(): CanvasTexture {
  return canvasTexture(64, 512, (g) => {
    for (let row = 0; row < 32; row++)
      for (let column = 0; column < 4; column++) {
        g.fillStyle = (row + column) % 2 === 0 ? '#f4f0e8' : '#0b0b0d'
        g.fillRect(column * 16, row * 16, 16, 16)
      }
  })
}

const KERB_RED = new Color(0xff161f)
const KERB_WHITE = new Color(0xf4f0e8)
const WALL_A = new Color(0xf4f0e8)
const WALL_B = new Color(0xff161f)
const WHITE = new Color(1, 1, 1)

export function buildTrack(track: TrackSamples, look: TrackLook): BuiltTrack {
  const { count, closed } = track
  const links = closed ? count : count - 1
  const next = (i: number) => (i + 1) % count
  const group = new Group()
  group.name = 'LabTrack'
  const geometries: BufferGeometry[] = []
  const materials: Material[] = []
  const textures: Texture[] = []
  const own = <T extends BufferGeometry | Material | Texture>(item: T): T => {
    if ('isBufferGeometry' in item) geometries.push(item as BufferGeometry)
    else if ('isMaterial' in item) materials.push(item as Material)
    else textures.push(item as Texture)
    return item
  }

  let lowest = Infinity
  for (let i = 0; i < count; i++) lowest = Math.min(lowest, track.y[i])
  const groundY = Math.min(0, lowest) - 0.6

  const colours = look.dusk
    ? { grass: new Color(0x3d4f35), gravel: new Color(0x9a8d78), skirt: new Color(0x2e3a2b), ground: 0x3d4f35 }
    : { grass: new Color(0x4f7a3d), gravel: new Color(0xc2b293), skirt: new Color(0x3e5c31), ground: 0x4f7a3d }

  // Where a sample's cross-section is at sideways distance `d` (positive is the right-hand side).
  const px = (i: number, d: number) => track.x[i] - track.tz[i] * d
  const pz = (i: number, d: number) => track.z[i] + track.tx[i] * d

  // The road.
  const road = new MeshData()
  for (let i = 0; i < count; i++) {
    const half = track.half[i]
    const v = (i * track.spacing) / 16
    road.vertex(px(i, -half), track.y[i], pz(i, -half), WHITE, 0, v)
    road.vertex(px(i, half), track.y[i], pz(i, half), WHITE, 1, v)
  }
  for (let i = 0; i < links; i++) {
    const j = next(i)
    road.tri(2 * i, 2 * i + 1, 2 * j)
    road.tri(2 * i + 1, 2 * j + 1, 2 * j)
  }
  // Closing the loop: the texture would run backwards over the last link, so give it its own vertices.
  if (closed) {
    const last = count - 1
    const v1 = (count * track.spacing) / 16
    const a = road.vertex(px(0, -track.half[0]), track.y[0], pz(0, -track.half[0]), WHITE, 0, v1)
    const b = road.vertex(px(0, track.half[0]), track.y[0], pz(0, track.half[0]), WHITE, 1, v1)
    road.indices.length -= 6
    road.tri(2 * last, 2 * last + 1, a)
    road.tri(2 * last + 1, b, a)
  }
  const roadTex = own(roadTexture())
  const roadMaterial = own(new MeshStandardMaterial({ map: roadTex, roughness: 0.9, metalness: 0, vertexColors: true }))
  const roadMesh = new Mesh(own(road.toGeometry()), roadMaterial)
  roadMesh.receiveShadow = true
  roadMesh.name = 'road'
  group.add(roadMesh)

  // Kerbs: red and white blocks, only where a corner has them.
  const kerbs = new MeshData()
  for (let i = 0; i < links; i++) {
    const j = next(i)
    if (!track.kerb[i] || !track.kerb[j]) continue
    const colour = Math.floor(i / 2) % 2 === 0 ? KERB_RED : KERB_WHITE
    for (const side of [-1, 1]) {
      const inner = (k: number) => side * track.half[k]
      const outer = (k: number) => side * (track.half[k] + TRACK.kerbWidth)
      const [d1a, d2a, d1b, d2b] =
        side < 0 ? [outer(i), inner(i), outer(j), inner(j)] : [inner(i), outer(i), inner(j), outer(j)]
      const a = kerbs.vertex(px(i, d1a), track.y[i] + 0.035, pz(i, d1a), colour)
      const b = kerbs.vertex(px(i, d2a), track.y[i] + 0.035, pz(i, d2a), colour)
      const c = kerbs.vertex(px(j, d1b), track.y[j] + 0.035, pz(j, d1b), colour)
      const d = kerbs.vertex(px(j, d2b), track.y[j] + 0.035, pz(j, d2b), colour)
      kerbs.tri(a, b, c)
      kerbs.tri(b, d, c)
    }
  }
  if (!kerbs.empty) {
    const mesh = new Mesh(
      own(kerbs.toGeometry()),
      own(new MeshStandardMaterial({ vertexColors: true, roughness: 0.65 })),
    )
    mesh.receiveShadow = true
    mesh.name = 'kerbs'
    group.add(mesh)
  }

  // Run-off: grass or gravel from the road's edge (and its kerb) out to the barrier.
  const grain = own(grainTexture())
  const runoff = new MeshData()
  for (let i = 0; i < count; i++) {
    const colour = track.gravel[i] ? colours.gravel : colours.grass
    const inside = track.half[i] + (track.kerb[i] ? TRACK.kerbWidth : 0)
    const y = track.y[i] - 0.03
    const v = (i * track.spacing) / 8
    // Left: barrier, then the inside edge. Right: inside edge, then the barrier. Same winding as the road.
    runoff.vertex(px(i, -track.left[i]), y, pz(i, -track.left[i]), colour, 0, v)
    runoff.vertex(px(i, -inside), y, pz(i, -inside), colour, 1, v)
    runoff.vertex(px(i, inside), y, pz(i, inside), colour, 0, v)
    runoff.vertex(px(i, track.right[i]), y, pz(i, track.right[i]), colour, 1, v)
  }
  for (let i = 0; i < links; i++) {
    const j = next(i)
    runoff.tri(4 * i, 4 * i + 1, 4 * j)
    runoff.tri(4 * i + 1, 4 * j + 1, 4 * j)
    runoff.tri(4 * i + 2, 4 * i + 3, 4 * j + 2)
    runoff.tri(4 * i + 3, 4 * j + 3, 4 * j + 2)
  }
  const runoffMaterial = own(new MeshStandardMaterial({ vertexColors: true, map: grain, roughness: 1, metalness: 0 }))
  const runoffMesh = new Mesh(own(runoff.toGeometry()), runoffMaterial)
  runoffMesh.receiveShadow = true
  runoffMesh.name = 'runoff'
  group.add(runoffMesh)

  // Barriers: a wall of red and white blocks, and the embankment under it down to the ground.
  const walls = new MeshData()
  const skirts = new MeshData()
  const height = 1.15
  for (let i = 0; i < links; i++) {
    const j = next(i)
    const colour = Math.floor(i / 4) % 2 === 0 ? WALL_A : WALL_B
    for (const side of [-1, 1]) {
      const dI = side * (side < 0 ? track.left[i] : track.right[i])
      const dJ = side * (side < 0 ? track.left[j] : track.right[j])
      const a = walls.vertex(px(i, dI), track.y[i] - 0.03, pz(i, dI), colour)
      const b = walls.vertex(px(i, dI), track.y[i] - 0.03 + height, pz(i, dI), colour)
      const c = walls.vertex(px(j, dJ), track.y[j] - 0.03, pz(j, dJ), colour)
      const d = walls.vertex(px(j, dJ), track.y[j] - 0.03 + height, pz(j, dJ), colour)
      walls.tri(a, b, c)
      walls.tri(b, d, c)
      const e = skirts.vertex(px(i, dI), track.y[i] - 0.03, pz(i, dI), colours.skirt)
      const f = skirts.vertex(px(i, dI), groundY, pz(i, dI), colours.skirt)
      const g = skirts.vertex(px(j, dJ), track.y[j] - 0.03, pz(j, dJ), colours.skirt)
      const h = skirts.vertex(px(j, dJ), groundY, pz(j, dJ), colours.skirt)
      skirts.tri(e, f, g)
      skirts.tri(f, h, g)
    }
  }
  const wallMesh = new Mesh(
    own(walls.toGeometry()),
    own(new MeshStandardMaterial({ vertexColors: true, roughness: 0.55, side: DoubleSide })),
  )
  wallMesh.castShadow = look.tier !== 'low'
  wallMesh.receiveShadow = true
  wallMesh.name = 'barriers'
  group.add(wallMesh)
  const skirtMesh = new Mesh(
    own(skirts.toGeometry()),
    own(new MeshStandardMaterial({ vertexColors: true, roughness: 1, side: DoubleSide })),
  )
  skirtMesh.name = 'embankment'
  group.add(skirtMesh)

  // The ground.
  const groundTexture = own(grainTexture())
  groundTexture.repeat.set(500, 500)
  const ground = new Mesh(
    own(new PlaneGeometry(6000, 6000)),
    own(new MeshStandardMaterial({ color: colours.ground, map: groundTexture, roughness: 1 })),
  )
  ground.rotation.x = -Math.PI / 2
  ground.position.set(0, groundY - 0.02, 0)
  ground.receiveShadow = true
  ground.name = 'ground'
  group.add(ground)

  // The start/finish line and its gantry.
  const lights: MeshStandardMaterial[] = []
  if (look.scenery !== false) {
    const half0 = track.half[0]
    const finishTex = own(finishTexture())
    // A plane 3.2 m along the road and the road's width across it, lying flat just above the surface.
    const heading0 = Math.atan2(track.tz[0], track.tx[0])
    const line = new Mesh(
      own(new PlaneGeometry(3.2, 2 * half0)),
      own(new MeshStandardMaterial({ map: finishTex, roughness: 0.8 })),
    )
    line.rotation.x = -Math.PI / 2
    line.receiveShadow = true
    line.name = 'finish-line'
    const lineHolder = new Group()
    lineHolder.position.set(track.x[0], track.y[0] + 0.045, track.z[0])
    lineHolder.rotation.y = -heading0
    lineHolder.add(line)
    group.add(lineHolder)

    const dark = own(new MeshStandardMaterial({ color: 0x1a1a20, roughness: 0.5, metalness: 0.4 }))
    const post = own(new BoxGeometry(0.5, 7.2, 0.5))
    const beam = own(new BoxGeometry(0.7, 0.9, 2 * half0 + 4.4))
    const gantry = new Group()
    gantry.position.set(track.x[0], track.y[0], track.z[0])
    gantry.rotation.y = -heading0
    for (const side of [-1, 1]) {
      const p = new Mesh(post, dark)
      p.position.set(0, 3.6, side * (half0 + 1.8))
      p.castShadow = true
      gantry.add(p)
    }
    const b = new Mesh(beam, dark)
    b.position.set(0, 7.4, 0)
    b.castShadow = true
    gantry.add(b)
    const lamp = own(new CylinderGeometry(0.28, 0.28, 0.3, 14))
    for (let k = 0; k < 5; k++) {
      const material = own(
        new MeshStandardMaterial({ color: 0x300000, emissive: 0xff161f, emissiveIntensity: 0, roughness: 0.4 }),
      )
      lights.push(material)
      const l = new Mesh(lamp, material)
      l.rotation.z = Math.PI / 2
      l.position.set(-0.4, 7.4, (k - 2) * 1.1)
      gantry.add(l)
    }
    group.add(gantry)

    // Sector gates: a blue frame across the road.
    const blue = own(
      new MeshStandardMaterial({ color: 0x445cff, roughness: 0.5, emissive: 0x445cff, emissiveIntensity: 0.25 }),
    )
    const gatePost = own(new BoxGeometry(0.35, 5, 0.35))
    const gateBeam = own(new BoxGeometry(0.4, 0.5, 1))
    for (const fraction of [1 / 3, 2 / 3]) {
      const i = Math.round(count * fraction) % count
      const gate = new Group()
      gate.position.set(track.x[i], track.y[i], track.z[i])
      gate.rotation.y = -Math.atan2(track.tz[i], track.tx[i])
      for (const side of [-1, 1]) {
        const p = new Mesh(gatePost, blue)
        p.position.set(0, 2.5, side * (track.half[i] + 1.4))
        gate.add(p)
      }
      const bar = new Mesh(gateBeam, blue)
      bar.scale.z = 2 * track.half[i] + 2.8
      bar.position.set(0, 5.1, 0)
      gate.add(bar)
      group.add(gate)
    }
  }

  // Scenery.
  if (look.scenery !== false) addScenery(group, track, look, own, groundY)

  return {
    root: group,
    groundY,
    setWet(wet) {
      roadMaterial.roughness = wet ? 0.28 : 0.9
      roadMaterial.metalness = wet ? 0.18 : 0
      roadMaterial.color.setScalar(wet ? 0.6 : 1)
      runoffMaterial.color.setScalar(wet ? 0.72 : 1)
    },
    setLights(n, go) {
      for (let k = 0; k < lights.length; k++) {
        const on = go || k < n
        lights[k].emissive.set(go ? 0x23ff6a : 0xff161f)
        lights[k].emissiveIntensity = on ? 3 : 0
      }
    },
    dispose() {
      for (const geometry of geometries) geometry.dispose()
      for (const material of materials) material.dispose()
      for (const texture of textures) texture.dispose()
    },
  }
}

// ── Scenery ─────────────────────────────────────────────────────────────────────────────

const SCENERY_CELL = 30

/** A hash of the track's sample positions, to ask "is anything of the track within this far of here?". */
function nearnessGrid(track: TrackSamples) {
  const cells = new Map<string, number[]>()
  const key = (cx: number, cz: number) => `${cx},${cz}`
  for (let i = 0; i < track.count; i++) {
    const k = key(Math.floor(track.x[i] / SCENERY_CELL), Math.floor(track.z[i] / SCENERY_CELL))
    const list = cells.get(k)
    if (list) list.push(i)
    else cells.set(k, [i])
  }
  return (x: number, z: number, distance: number): boolean => {
    const reach = Math.ceil(distance / SCENERY_CELL)
    const cx = Math.floor(x / SCENERY_CELL)
    const cz = Math.floor(z / SCENERY_CELL)
    for (let a = -reach; a <= reach; a++) {
      for (let b = -reach; b <= reach; b++) {
        const list = cells.get(key(cx + a, cz + b))
        if (!list) continue
        for (const i of list) {
          const limit = distance + Math.max(track.left[i], track.right[i])
          if ((track.x[i] - x) ** 2 + (track.z[i] - z) ** 2 < limit * limit) return true
        }
      }
    }
    return false
  }
}

function addScenery(
  group: Group,
  track: TrackSamples,
  look: TrackLook,
  own: <T extends BufferGeometry | Material | Texture>(item: T) => T,
  groundY: number,
): void {
  const random = seeded(look.seed)
  const near = nearnessGrid(track)
  const trees = look.tier === 'high' ? 260 : look.tier === 'medium' ? 140 : 60

  // A tree: a trunk and two stacked cones, as one geometry with its colours in the vertices.
  const trunk = new CylinderGeometry(0.28, 0.4, 2.2, 6)
  trunk.translate(0, 1.1, 0)
  const lower = new ConeGeometry(2.3, 4.6, 7)
  lower.translate(0, 4.2, 0)
  const upper = new ConeGeometry(1.7, 3.6, 7)
  upper.translate(0, 6.6, 0)
  const paint = (geometry: BufferGeometry, colour: Color) => {
    const n = geometry.getAttribute('position').count
    const data = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) data.set([colour.r, colour.g, colour.b], i * 3)
    geometry.setAttribute('color', new BufferAttribute(data, 3))
    return geometry
  }
  const leaf = look.dusk ? new Color(0x2f4a2c) : new Color(0x3f7a35)
  const merged = mergeGeometries(
    [paint(trunk, new Color(0x4a3426)), paint(lower, leaf), paint(upper, leaf.clone().offsetHSL(0, 0, 0.04))].map((g) =>
      g.toNonIndexed(),
    ),
  )
  trunk.dispose()
  lower.dispose()
  upper.dispose()
  if (merged) {
    merged.computeVertexNormals()
    const treeMesh = new InstancedMesh(
      own(merged),
      own(new MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true })),
      trees,
    )
    treeMesh.castShadow = look.tier === 'high'
    treeMesh.name = 'trees'
    const matrix = new Matrix4()
    const quaternion = new Quaternion()
    const up = new Vector3(0, 1, 0)
    let placed = 0
    for (let attempt = 0; attempt < trees * 8 && placed < trees; attempt++) {
      const i = Math.floor(random() * track.count)
      const side = random() < 0.5 ? -1 : 1
      const clear = side < 0 ? track.left[i] : track.right[i]
      const d = side * (clear + 8 + random() * 70)
      const x = track.x[i] - track.tz[i] * d
      const z = track.z[i] + track.tx[i] * d
      if (near(x, z, 10)) continue
      const scale = 0.8 + random() * 1.1
      quaternion.setFromAxisAngle(up, random() * Math.PI * 2)
      matrix.compose(new Vector3(x, groundY, z), quaternion, new Vector3(scale, scale * (0.9 + random() * 0.5), scale))
      treeMesh.setMatrixAt(placed++, matrix)
    }
    treeMesh.count = placed
    group.add(treeMesh)
  }

  // Hills far off, so the horizon is not a flat line.
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (let i = 0; i < track.count; i++) {
    minX = Math.min(minX, track.x[i])
    maxX = Math.max(maxX, track.x[i])
    minZ = Math.min(minZ, track.z[i])
    maxZ = Math.max(maxZ, track.z[i])
  }
  const cx = (minX + maxX) / 2
  const cz = (minZ + maxZ) / 2
  const radius = Math.hypot(maxX - minX, maxZ - minZ) / 2 + 380
  const hills = look.tier === 'low' ? 10 : 18
  const hill = new ConeGeometry(1, 1, 9)
  hill.translate(0, 0.5, 0)
  const hillMesh = new InstancedMesh(
    own(hill),
    own(new MeshStandardMaterial({ color: look.dusk ? 0x2a3350 : 0x6f86a8, roughness: 1, flatShading: true })),
    hills,
  )
  const m = new Matrix4()
  for (let k = 0; k < hills; k++) {
    const angle = (k / hills) * Math.PI * 2 + random() * 0.3
    const distance = radius + random() * 260
    const base = 260 + random() * 320
    const tall = 70 + random() * 130
    m.compose(
      new Vector3(cx + Math.cos(angle) * distance, groundY - 2, cz + Math.sin(angle) * distance),
      new Quaternion(),
      new Vector3(base, tall, base),
    )
    hillMesh.setMatrixAt(k, m)
  }
  hillMesh.name = 'hills'
  group.add(hillMesh)

  // Grandstands facing the start line, on the right-hand side of the straight behind the barrier.
  const stand = new BoxGeometry(70, 7, 9)
  stand.translate(0, 3.5, 0)
  const roof = new BoxGeometry(72, 0.5, 11)
  roof.translate(0, 8.4, 0)
  const standMesh = new Mesh(
    own(stand),
    own(new MeshStandardMaterial({ color: look.dusk ? 0x4a4a56 : 0x8a8a96, roughness: 0.9 })),
  )
  const roofMesh = new Mesh(own(roof), own(new MeshStandardMaterial({ color: 0xff161f, roughness: 0.6 })))
  const at = Math.round(10 / track.spacing)
  const standGroup = new Group()
  const d = track.right[at] + 14
  standGroup.position.set(track.x[at] - track.tz[at] * d, groundY, track.z[at] + track.tx[at] * d)
  standGroup.rotation.y = -Math.atan2(track.tz[at], track.tx[at])
  standGroup.add(standMesh, roofMesh)
  group.add(standGroup)
}
