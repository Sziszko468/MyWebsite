import { Box3, Color, Group, MeshStandardMaterial, OctahedronGeometry, Vector3, type Mesh } from 'three'
import { createRandom } from './ideas'
import { isVehicle, type Build, type ConceptId, type Look, type ObjectSpec } from './spec'
import { avocado, banana, burger, cactus, cat, cheese, croissant, dinosaur, donut, duck, egg, frog, penguin, pizza, shark, type BodyBuilder } from './parts/bodiesFoodAnimals'
import { alien, coffeemachine, fridge, ghost, person, pumpkin, robot, sneaker, snowman, teapot, toaster, tv, washer } from './parts/bodiesThings'
import { addAccessory, buildProp, type GearContext } from './parts/gear'
import { Painter, addFace, createBuilt, glow, type Built, type Skin } from './parts/kit'
import { buildKit, buildVehicle } from './parts/vehicles'

const BODY_BUILDERS: Partial<Record<ConceptId, BodyBuilder>> = {
  banana, croissant, pizza, donut, burger, egg, avocado, cheese,
  frog, dinosaur, cat, duck, penguin, shark, cactus,
  robot, fridge, coffeemachine, toaster, washer, tv, teapot, sneaker,
  alien, ghost, snowman, pumpkin, person,
}

/** The colours a thing has before anyone changes them. */
export const SKINS: Record<ConceptId, Skin> = {
  banana: { main: 0xf7d046, accent: 0x8a6a22 },
  croissant: { main: 0xe0a24a, accent: 0xbf7a2b },
  pizza: { main: 0xf4c542, accent: 0xc98a3d },
  donut: { main: 0xd9a066, accent: 0xff7bac },
  burger: { main: 0xe0a050, accent: 0x5a3322 },
  egg: { main: 0xf6efe0, accent: 0xffd34d },
  avocado: { main: 0xb9d96a, accent: 0x2f5d2a },
  cheese: { main: 0xffd23f, accent: 0xe0a800 },
  frog: { main: 0x5fb04a, accent: 0xcfe8a0 },
  dinosaur: { main: 0x58b368, accent: 0xf0d684 },
  cat: { main: 0xe89a3c, accent: 0xb86a1f },
  duck: { main: 0xffd93b, accent: 0xf4b72a },
  penguin: { main: 0x222833, accent: 0xf2f2ee },
  shark: { main: 0x6f8fae, accent: 0xe9eef3 },
  cactus: { main: 0x4fa04a, accent: 0xf4f0d8 },
  robot: { main: 0xc3cad6, accent: 0x4a505c, metal: 0.85, rough: 0.3 },
  fridge: { main: 0xeef1f4, accent: 0x2a2e36, metal: 0.25, rough: 0.3 },
  coffeemachine: { main: 0x2b2f38, accent: 0xe0202c, metal: 0.5, rough: 0.35 },
  toaster: { main: 0xcfd4dc, accent: 0xd9a05a, metal: 0.8, rough: 0.3 },
  washer: { main: 0xf2f4f7, accent: 0x3a5fd0, metal: 0.2, rough: 0.3 },
  tv: { main: 0x6a6f7a, accent: 0x9a6a3a, metal: 0.3, rough: 0.5 },
  teapot: { main: 0xf2f0e8, accent: 0x3a5fd0, rough: 0.2 },
  sneaker: { main: 0xe0202c, accent: 0xf2f2ee },
  alien: { main: 0x8ddf6a, accent: 0x5fb04a },
  ghost: { main: 0xf4f6ff, accent: 0xdce3ff, rough: 0.4 },
  snowman: { main: 0xf4f7fb, accent: 0xdce6f2 },
  pumpkin: { main: 0xf28a1d, accent: 0xc96a10 },
  person: { main: 0xe0202c, accent: 0x2b3a67 },
  sportscar: { main: 0xe0202c, accent: 0xf4f0e8, metal: 0.6, rough: 0.25 },
  racecar: { main: 0xe0202c, accent: 0x1b1b1f, metal: 0.5, rough: 0.3 },
  spaceship: { main: 0xdfe3ea, accent: 0xe0202c, metal: 0.7, rough: 0.25 },
  rocket: { main: 0xe0202c, accent: 0xdfe3ea, metal: 0.4, rough: 0.35 },
  ufo: { main: 0xb9c0cc, accent: 0x4a505c, metal: 0.9, rough: 0.2 },
  bicycle: { main: 0xe0202c, accent: 0x1b1b1f },
}

/** One creation, built. */
export interface Composed {
  /** Base at y = 0, centred over the origin. The scene turns and scales it. */
  root: Group
  /** The middle of it and the radius of a sphere that holds it, before any scaling. */
  centre: Vector3
  radius: number
  /** Things asked for that had no place to go. */
  skipped: string[]
  update(time: number, motion: number): void
  applyLook(look: Look): void
  dispose(): void
}

const BUILD_SCALE: Record<Build, readonly [number, number, number]> = {
  thin: [0.82, 1.02, 0.86],
  normal: [1, 1, 1],
  muscular: [1.14, 1, 1.1],
  round: [1.22, 0.96, 1.22],
}

function varied(skin: Skin, random: () => number): Skin {
  const shift = (hex: number) => {
    const colour = new Color(hex)
    const hsl = { h: 0, s: 0, l: 0 }
    colour.getHSL(hsl)
    colour.setHSL((hsl.h + (random() - 0.5) * 0.03 + 1) % 1, hsl.s, Math.min(0.95, Math.max(0.04, hsl.l + (random() - 0.5) * 0.06)))
    return colour.getHex()
  }
  return { ...skin, main: shift(skin.main), accent: shift(skin.accent) }
}

const hue = (hex: string, factor: number) => {
  const colour = new Color(hex)
  const hsl = { h: 0, s: 0, l: 0 }
  colour.getHSL(hsl)
  return colour.setHSL(hsl.h, hsl.s, Math.min(0.95, Math.max(0.03, hsl.l * factor)))
}

/** Dresses every recolourable mesh of a painter for a look. Fixed colours (eyes, tyres, gold trim) are left alone. */
function dress(painter: Painter, look: Look): void {
  for (const mesh of painter.meshes) {
    const kind = mesh.userData.paint as 'main' | 'accent' | 'fixed'
    if (kind === 'fixed') continue
    const material = mesh.material as MeshStandardMaterial
    const main = kind === 'main'
    const natural = new Color(main ? painter.skin.main : painter.skin.accent)
    const chosen = look.colour ? (main ? new Color(look.colour) : hue(look.colour, 0.7)) : null
    const wasTransparent = material.transparent
    material.emissive.setHex(0x000000)
    material.emissiveIntensity = 0
    material.transparent = false
    material.opacity = 1
    switch (look.material) {
      case 'gold':
        material.color.copy(chosen ?? new Color(main ? 0xe8b53a : 0xc9972a))
        material.metalness = 1
        material.roughness = 0.2
        break
      case 'chrome':
        material.color.copy(chosen ?? new Color(main ? 0xdfe3ea : 0xaeb4c0))
        material.metalness = 1
        material.roughness = 0.16
        break
      case 'glass':
        material.color.copy(chosen ?? new Color(main ? 0xa8dcff : 0x8cc4ee))
        material.metalness = 0
        material.roughness = 0.05
        material.transparent = true
        material.opacity = main ? 0.5 : 0.62
        break
      case 'matte':
        material.color.copy(chosen ?? natural)
        material.metalness = 0
        material.roughness = 0.95
        break
      case 'neon':
        material.color.setHex(0x0b0b12)
        material.emissive.copy(chosen ?? new Color(main ? 0x19e6ff : 0xff3df0))
        material.emissiveIntensity = main ? 1.7 : 1.2
        material.metalness = 0
        material.roughness = 0.5
        break
      case 'candy':
        material.color.copy(chosen ?? natural).offsetHSL(0, 0.12, 0.02)
        material.metalness = 0
        material.roughness = 0.18
        break
      case 'wood':
        material.color.copy(chosen ?? new Color(main ? 0xa9743a : 0x7d5328))
        material.metalness = 0
        material.roughness = 0.72
        break
      default:
        material.color.copy(chosen ?? natural)
        material.metalness = painter.skin.metal ?? 0.05
        material.roughness = painter.skin.rough ?? 0.5
    }
    if (wasTransparent !== material.transparent) material.needsUpdate = true
  }
}

/** Removes the arms and legs of a body, as when it has been turned into a vehicle. */
function stripLimbs(built: Built): void {
  const limbs = built.limbs
  if (!limbs) return
  for (const pivot of [limbs.armL, limbs.armR, limbs.legL, limbs.legR]) pivot?.parent?.remove(pivot)
  built.limbs = null
}

/**
 * Builds a creation from what was understood and a seed. The same spec and seed always give the same
 * object. Nothing here touches the renderer: it is plain three.js objects, so it can also be exported.
 */
export function composeObject(spec: ObjectSpec, seed: number): Composed {
  const random = createRandom(seed * 2654435761 + 12345)
  const painters: Painter[] = []
  const ticks: Array<(time: number, motion: number) => void> = []
  const skipped: string[] = []
  const root = new Group()
  const content = new Group()
  root.add(content)

  const paint = (id: ConceptId) => {
    const painter = new Painter(varied(SKINS[id], random), random)
    painters.push(painter)
    return painter
  }
  const body = (id: ConceptId, mood: ObjectSpec['mood'], build: Build): { built: Built; painter: Painter } => {
    const painter = paint(id)
    const built = (BODY_BUILDERS[id] ?? BODY_BUILDERS.egg!)({ p: painter, mood, build })
    built.core.scale.set(...BUILD_SCALE[build])
    return { built, painter }
  }

  let main: Built
  let mainPainter: Painter
  let mainHeight: number
  let mainWidth: number
  let pose = spec.pose
  const vehicleMain = isVehicle(spec.main)

  if (vehicleMain) {
    mainPainter = paint(spec.main)
    const vehicle = buildVehicle(spec.main, mainPainter, false)
    main = createBuilt()
    main.root.remove(main.core)
    main.root.add(vehicle.root)
    main.width = vehicle.width
    main.height = vehicle.height
    main.depth = vehicle.length
    ticks.push(...vehicle.tick)
    for (const item of spec.accessories) skipped.push(item)
    mainHeight = vehicle.height
    mainWidth = vehicle.width
    content.add(main.root)
    if (spec.kit) skipped.push(spec.kit)
    pose = 'stand'
  } else {
    const made = body(spec.main, spec.mood, spec.build)
    main = made.built
    mainPainter = made.painter
    ticks.push(...main.tick)

    // Another thing as its head.
    if (spec.headOf && !isVehicle(spec.headOf)) {
      const head = body(spec.headOf, spec.mood, 'normal')
      stripLimbs(head.built)
      if (head.built.anchors.eyes || head.built.anchors.mouth) addFace(head.painter, head.built.core, head.built.anchors, spec.mood)
      const old = main.anchors.head
      head.built.root.updateMatrixWorld(true)
      const headBox = new Box3().setFromObject(head.built.root)
      const headSize = headBox.getSize(new Vector3())
      const headCentre = headBox.getCenter(new Vector3())
      const reach = Math.max(headSize.x, headSize.z, headSize.y * 0.8)
      const scale = Math.max(0.5, old.r * 2 * (main.headParts ? 1.5 : 1.2)) / reach
      if (main.headParts) main.core.remove(main.headParts)
      const base = main.headParts ? old.pos.y - old.r * 1.6 : old.pos.y - old.r * 0.2
      head.built.root.scale.setScalar(scale)
      head.built.root.position.set(old.pos.x - headCentre.x * scale, base - headBox.min.y * scale, old.pos.z - headCentre.z * scale)
      main.core.add(head.built.root)
      main.anchors.eyes = null
      main.anchors.mouth = null
      const eyes = head.built.anchors.eyes
      const at = head.built.root.position
      if (eyes) {
        const place = (e: Vector3) => new Vector3(e.x * scale + at.x, e.y * scale + at.y, e.z * scale + at.z)
        main.anchors.eyes = { l: place(eyes.l), r: place(eyes.r), size: eyes.size * scale }
      }
      main.anchors.head = { pos: new Vector3(old.pos.x, base + headSize.y * scale, old.pos.z), r: (Math.max(headSize.x, headSize.z) * scale) / 2 }
      ticks.push(...head.built.tick)
    } else if (!spec.kit) {
      addFace(mainPainter, main.core, main.anchors, spec.mood)
    }
    if (spec.headOf && isVehicle(spec.headOf)) skipped.push(spec.headOf)

    mainHeight = main.height
    mainWidth = main.width

    // Turned into a vehicle: it loses its arms and legs and gains wheels, wings or fins.
    if (spec.kit) {
      stripLimbs(main)
      // A tall thing becomes a car, a racer or a spaceship lying on its back, its door up and its top at the tail.
      const upright = main.height > 1.3 * Math.max(main.width, main.depth)
      if (upright && (spec.kit === 'sportscar' || spec.kit === 'racecar' || spec.kit === 'spaceship')) main.core.rotation.x = -Math.PI / 2
      const kitPainter = paint(spec.kit)
      main.root.updateMatrixWorld(true)
      const bodyBox = new Box3().setFromObject(main.root)
      const bodySize = bodyBox.getSize(new Vector3())
      const kit = buildKit(spec.kit, kitPainter, bodySize.x, bodySize.y, bodySize.z)
      const rise = kit.lift - bodyBox.min.y
      main.root.position.y += rise
      main.root.add(kit.group)
      // The kit is built round the origin: it goes where the body is, which is not the origin once a tall thing has been laid down.
      const middle = bodyBox.getCenter(new Vector3())
      kit.group.position.set(middle.x, -rise, middle.z)
      ticks.push(...kit.tick)
      mainHeight = bodySize.y + kit.lift
    }

    // Accessories ride on the body, so they follow its build.
    const gear: GearContext = { p: mainPainter, built: main, parent: main.core, build: spec.build, tick: ticks }
    for (const item of spec.accessories) addAccessory(item, gear)

    if (spec.vehicle && !spec.kit) {
      const vPainter = paint(spec.vehicle)
      const vehicle = buildVehicle(spec.vehicle, vPainter, true)
      const holder = new Group()
      holder.add(vehicle.root)
      const scale = Math.min(1, Math.max(0.3, (vehicle.length * 0.5) / main.height))
      main.root.scale.setScalar(scale)
      main.root.position.set(vehicle.seat.x, vehicle.seat.y - main.seatDrop * main.height * scale, vehicle.seat.z)
      holder.add(main.root)
      ticks.push(...vehicle.tick)
      mainHeight = Math.max(vehicle.height, vehicle.seat.y + main.height * scale * (1 - main.seatDrop))
      mainWidth = vehicle.width
      content.add(holder)
      pose = 'drive'
    } else {
      content.add(main.root)
      if (spec.kit) pose = 'stand'
    }
  }

  // Smaller things standing beside it.
  const spread = Math.max(mainWidth, main.depth * 0.4)
  spec.companions.forEach((id, index) => {
    const side = index % 2 === 0 ? 1 : -1
    let group: Group
    let height: number
    let width: number
    if (isVehicle(id)) {
      const vPainter = paint(id)
      const vehicle = buildVehicle(id, vPainter, false)
      group = vehicle.root
      height = vehicle.height
      width = vehicle.width
      ticks.push(...vehicle.tick)
    } else {
      const made = body(id, 'happy', 'normal')
      addFace(made.painter, made.built.core, made.built.anchors, 'happy')
      group = made.built.root
      height = made.built.height
      width = made.built.width
      ticks.push(...made.built.tick)
      const limbs = made.built.limbs
      if (limbs) ticks.push((t, m) => limbs.pose('stand', t, m))
    }
    const scale = Math.min(1, (mainHeight * 0.55) / height)
    group.scale.setScalar(scale)
    group.position.set(side * (spread / 2 + (width * scale) / 2 + 0.35 + Math.floor(index / 2) * 1.2), 0, 0.5)
    group.rotation.y = -side * 0.5
    content.add(group)
  })

  // Things it holds or stands beside.
  const propScale = Math.min(1.3, Math.max(0.7, mainHeight / 2.4))
  spec.props.forEach((id, index) => {
    const prop = buildProp(id, paint(spec.main))
    const side = index % 2 === 0 ? 1 : -1
    prop.group.scale.setScalar(propScale)
    const x = side * (spread / 2 + prop.radius * propScale + 0.25 + Math.floor(index / 2) * 0.9)
    prop.group.position.set(x, 0, main.depth * 0.25)
    prop.group.rotation.y = -side * 0.4
    content.add(prop.group)
  })

  // Luxury glitters.
  if (spec.vibe === 'luxury') {
    const sparkles: Group[] = []
    const sparkPainter = paint(spec.main)
    for (let i = 0; i < 10; i++) {
      const group = new Group()
      const angle = random() * Math.PI * 2
      const distance = spread * 0.6 + 0.5 + random() * 0.7
      group.position.set(Math.cos(angle) * distance, 0.3 + random() * mainHeight * 0.95, Math.sin(angle) * distance * 0.7)
      const mesh = sparkPainter.mesh(new OctahedronGeometry(0.04 + random() * 0.05), glow(0xffe9a0, 1.8), group)
      mesh.scale.set(1, 1.7, 1)
      content.add(group)
      sparkles.push(group)
    }
    ticks.push((t, m) => {
      sparkles.forEach((group, index) => {
        const k = 0.6 + 0.4 * Math.sin(t * 3 + index * 1.7)
        group.scale.setScalar(1 + (k - 0.6) * m)
        group.rotation.y = t * m + index
      })
    })
  }

  // Put the middle of it over the origin and its feet on the floor.
  root.updateMatrixWorld(true)
  const box = new Box3().setFromObject(content)
  const centre = box.getCenter(new Vector3())
  content.position.set(-centre.x, -box.min.y, -centre.z)
  const size = box.getSize(new Vector3())
  const radius = Math.max(0.8, size.length() / 2)

  const limbs = main.limbs
  const core = main.core
  const rest = main.root.position.y
  const tilt = main.root.rotation.x

  return {
    root,
    centre: new Vector3(0, size.y / 2, 0),
    radius,
    skipped,
    update(time, motion) {
      for (const tick of ticks) tick(time, motion)
      limbs?.pose(pose, time, motion)
      // The whole body moves with the pose when it has no limbs to do it, and a little when it has.
      const bob = Math.abs(Math.sin(time * 5)) * 0.1 * motion
      switch (pose) {
        case 'dance':
          main.root.position.y = rest + bob
          core.rotation.z = Math.sin(time * 2.5) * 0.08 * motion + (limbs ? 0 : Math.sin(time * 5) * 0.12 * motion)
          break
        case 'fly':
          main.root.rotation.x = tilt + 1.05
          main.root.position.y = rest + 0.9 + Math.sin(time * 2) * 0.06 * motion
          break
        case 'run':
          main.root.position.y = rest + Math.abs(Math.sin(time * 8)) * 0.08 * motion
          break
        case 'box':
          main.root.position.y = rest + Math.abs(Math.sin(time * 6)) * 0.04 * motion
          break
        default:
          main.root.position.y = rest + Math.sin(time * 2) * 0.012 * motion
      }
      if (pose !== 'fly') main.root.rotation.x = tilt
    },
    applyLook(look) {
      for (const painter of painters) dress(painter, look)
      root.scale.setScalar(look.scale)
    },
    dispose() {
      for (const painter of painters) painter.dispose()
      painters.length = 0
      ticks.length = 0
      root.clear()
    },
  }
}

/** Meshes of a composed object, for tests and the exporter. */
export function meshesOf(root: Group): Mesh[] {
  const found: Mesh[] = []
  root.traverse((object) => {
    if ((object as Mesh).isMesh) found.push(object as Mesh)
  })
  return found
}

