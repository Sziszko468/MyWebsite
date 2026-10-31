/**
 * The Model Studio's document: everything a project is, as plain data. The scene draws it, the
 * panels edit it, a save writes it and a load reads it back. Nothing in here touches Three.js or
 * the DOM, so the rules (limits, validation, the operations) are tested on their own.
 *
 * A project is small on purpose: at most MAX_OBJECTS objects, every number clamped, every string
 * short. A file the visitor picks is untrusted, so `parseStudioDoc` accepts only what it knows and
 * quietly drops the rest: no URLs, no scripts, no geometry, nothing that could grow without bound.
 */

export const SHAPE_KINDS = ['cube', 'sphere', 'cylinder', 'cone', 'torus', 'plane', 'custom'] as const
export type ShapeKind = (typeof SHAPE_KINDS)[number]

export const MATERIAL_PRESETS = ['chrome', 'matte-black', 'racing-red', 'digital-glass', 'brushed-metal', 'ceramic', 'carbon-fiber'] as const
export type MaterialPreset = (typeof MATERIAL_PRESETS)[number]

export const LIGHT_RIGS = ['studio', 'dramatic-red', 'cold-blue', 'soft-white', 'high-contrast'] as const
export type LightRig = (typeof LIGHT_RIGS)[number]

export const MAX_OBJECTS = 60
export const MAX_NAME = 40
export const POSITION_LIMIT = 100
export const SCALE_MIN = 0.05
export const SCALE_MAX = 40

export type Vec3 = [number, number, number]

export interface MaterialDef {
  preset: MaterialPreset
  /** '#rrggbb' */
  color: string
  roughness: number
  metalness: number
  opacity: number
  /** 0..2: how much the surface glows in its own colour. */
  emissive: number
}

/** The parameters of the parametric custom shape: a prism that can taper and twist. */
export interface CustomParams {
  /** Corners of the cross-section, 3..12. */
  sides: number
  /** Degrees of twist from bottom to top, -360..360. */
  twist: number
  /** Width at the top as a share of the bottom, 0..1.5. */
  taper: number
  /** Slices along the height, 1..24 (the twist needs them to look smooth). */
  slices: number
}

export interface StudioObject {
  id: string
  name: string
  kind: ShapeKind
  position: Vec3
  /** Euler angles in radians, order XYZ. */
  rotation: Vec3
  scale: Vec3
  material: MaterialDef
  visible: boolean
  locked: boolean
  custom: CustomParams
}

export interface LightingDef {
  rig: LightRig
  /** 0.2..2 */
  intensity: number
  /** Degrees: where the key light comes from, round the object. */
  azimuth: number
  /** Degrees above the horizon. */
  elevation: number
}

export interface StudioDoc {
  version: 1
  objects: StudioObject[]
  selectedId: string | null
  lighting: LightingDef
}

export const DEFAULT_CUSTOM: CustomParams = { sides: 5, twist: 90, taper: 0.55, slices: 12 }
export const DEFAULT_LIGHTING: LightingDef = { rig: 'studio', intensity: 1, azimuth: 40, elevation: 48 }

export interface PresetDef {
  color: string
  roughness: number
  metalness: number
  opacity: number
  emissive: number
  /** Whether the opacity slider means something for this material. */
  supportsOpacity: boolean
}

/** What each material starts as. The visitor can then change colour, roughness, metalness, opacity and glow. */
export const PRESETS: Record<MaterialPreset, PresetDef> = {
  chrome: { color: '#e8eaf0', roughness: 0.04, metalness: 1, opacity: 1, emissive: 0, supportsOpacity: false },
  'matte-black': { color: '#121214', roughness: 0.82, metalness: 0, opacity: 1, emissive: 0, supportsOpacity: false },
  'racing-red': { color: '#ff161f', roughness: 0.3, metalness: 0.25, opacity: 1, emissive: 0, supportsOpacity: false },
  'digital-glass': { color: '#8aa0ff', roughness: 0.05, metalness: 0, opacity: 0.38, emissive: 0.15, supportsOpacity: true },
  'brushed-metal': { color: '#c9ccd4', roughness: 0.42, metalness: 1, opacity: 1, emissive: 0, supportsOpacity: false },
  ceramic: { color: '#f4f0e8', roughness: 0.22, metalness: 0, opacity: 1, emissive: 0, supportsOpacity: false },
  'carbon-fiber': { color: '#c4c4cc', roughness: 0.34, metalness: 0.5, opacity: 1, emissive: 0, supportsOpacity: false },
}

export function materialFromPreset(preset: MaterialPreset): MaterialDef {
  const { color, roughness, metalness, opacity, emissive } = PRESETS[preset]
  return { preset, color, roughness, metalness, opacity, emissive }
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const finite = (value: unknown, fallback: number) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback)

export function clampVec(value: Vec3, min: number, max: number): Vec3 {
  return [clamp(value[0], min, max), clamp(value[1], min, max), clamp(value[2], min, max)]
}

/** A hex colour or the fallback: nothing but `#rrggbb` ever reaches a material. */
export function safeColor(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : fallback
}

/** A name a person typed: trimmed, short, without control characters. */
export function safeName(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  // eslint-disable-next-line no-control-regex
  const cleaned = value.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, MAX_NAME)
  return cleaned || fallback
}

export function sanitizeCustom(custom: Partial<CustomParams> | undefined): CustomParams {
  return {
    sides: Math.round(clamp(finite(custom?.sides, DEFAULT_CUSTOM.sides), 3, 12)),
    twist: clamp(finite(custom?.twist, DEFAULT_CUSTOM.twist), -360, 360),
    taper: clamp(finite(custom?.taper, DEFAULT_CUSTOM.taper), 0, 1.5),
    slices: Math.round(clamp(finite(custom?.slices, DEFAULT_CUSTOM.slices), 1, 24)),
  }
}

export function sanitizeMaterial(material: Partial<MaterialDef> | undefined): MaterialDef {
  const preset = MATERIAL_PRESETS.includes(material?.preset as MaterialPreset) ? (material!.preset as MaterialPreset) : 'racing-red'
  const base = PRESETS[preset]
  return {
    preset,
    color: safeColor(material?.color, base.color),
    roughness: clamp(finite(material?.roughness, base.roughness), 0, 1),
    metalness: clamp(finite(material?.metalness, base.metalness), 0, 1),
    opacity: base.supportsOpacity ? clamp(finite(material?.opacity, base.opacity), 0.05, 1) : 1,
    emissive: clamp(finite(material?.emissive, base.emissive), 0, 2),
  }
}

export function sanitizeObject(raw: Partial<StudioObject>, fallbackId: string, fallbackName: string): StudioObject {
  const kind = SHAPE_KINDS.includes(raw.kind as ShapeKind) ? (raw.kind as ShapeKind) : 'cube'
  const vec = (value: unknown, fallback: Vec3, min: number, max: number): Vec3 => {
    const list = Array.isArray(value) ? value : []
    return [clamp(finite(list[0], fallback[0]), min, max), clamp(finite(list[1], fallback[1]), min, max), clamp(finite(list[2], fallback[2]), min, max)]
  }
  return {
    id: typeof raw.id === 'string' && /^[\w-]{1,24}$/.test(raw.id) ? raw.id : fallbackId,
    name: safeName(raw.name, fallbackName),
    kind,
    position: vec(raw.position, [0, 0, 0], -POSITION_LIMIT, POSITION_LIMIT),
    rotation: vec(raw.rotation, [0, 0, 0], -Math.PI * 4, Math.PI * 4),
    scale: vec(raw.scale, [1, 1, 1], SCALE_MIN, SCALE_MAX),
    material: sanitizeMaterial(raw.material),
    visible: raw.visible !== false,
    locked: raw.locked === true,
    custom: sanitizeCustom(raw.custom),
  }
}

export function emptyDoc(): StudioDoc {
  return { version: 1, objects: [], selectedId: null, lighting: { ...DEFAULT_LIGHTING } }
}

/** The scene a visitor arrives in: a small, deliberate arrangement rather than an empty void. */
export function starterDoc(): StudioDoc {
  const red = materialFromPreset('racing-red')
  const chrome = materialFromPreset('chrome')
  const base = (id: string, name: string, kind: ShapeKind, position: Vec3, scale: Vec3, material: MaterialDef): StudioObject => ({
    id,
    name,
    kind,
    position,
    rotation: [0, 0, 0],
    scale,
    material,
    visible: true,
    locked: false,
    custom: { ...DEFAULT_CUSTOM },
  })
  return {
    version: 1,
    objects: [
      base('o1', 'Plinth', 'cylinder', [0, 0.15, 0], [2.2, 0.3, 2.2], materialFromPreset('matte-black')),
      base('o2', 'Sphere', 'sphere', [0, 1.25, 0], [1.6, 1.6, 1.6], chrome),
      base('o3', 'Ring', 'torus', [0, 1.25, 0], [1.4, 1.4, 1.4], red),
    ],
    selectedId: 'o2',
    lighting: { ...DEFAULT_LIGHTING },
  }
}

/** Reads a project from anything. It returns null unless it is recognisably a project, and never more than the limits allow. */
export function parseStudioDoc(raw: unknown): StudioDoc | null {
  if (typeof raw !== 'object' || raw === null) return null
  const record = raw as Record<string, unknown>
  if (record.version !== 1 || !Array.isArray(record.objects)) return null

  const seen = new Set<string>()
  const objects: StudioObject[] = []
  for (const item of record.objects.slice(0, MAX_OBJECTS)) {
    if (typeof item !== 'object' || item === null) continue
    const object = sanitizeObject(item as Partial<StudioObject>, `o${objects.length + 1}`, `Object ${objects.length + 1}`)
    // Two objects must never share an id, whatever the file says.
    let id = object.id
    let n = objects.length + 1
    while (seen.has(id)) id = `o${++n}x`
    seen.add(id)
    objects.push({ ...object, id })
  }

  const lighting = (record.lighting ?? {}) as Partial<LightingDef>
  const selected = typeof record.selectedId === 'string' && seen.has(record.selectedId) ? record.selectedId : null
  return {
    version: 1,
    objects,
    selectedId: selected,
    lighting: {
      rig: LIGHT_RIGS.includes(lighting.rig as LightRig) ? (lighting.rig as LightRig) : DEFAULT_LIGHTING.rig,
      intensity: clamp(finite(lighting.intensity, DEFAULT_LIGHTING.intensity), 0.2, 2),
      azimuth: clamp(finite(lighting.azimuth, DEFAULT_LIGHTING.azimuth), 0, 360),
      elevation: clamp(finite(lighting.elevation, DEFAULT_LIGHTING.elevation), 5, 85),
    },
  }
}

// ── Operations: each returns a new document and never changes the one it was given ─────────────

const KIND_NAMES: Record<ShapeKind, string> = {
  cube: 'Cube',
  sphere: 'Sphere',
  cylinder: 'Cylinder',
  cone: 'Cone',
  torus: 'Torus',
  plane: 'Plane',
  custom: 'Custom',
}

export function uniqueName(doc: StudioDoc, base: string): string {
  const names = new Set(doc.objects.map((object) => object.name))
  if (!names.has(base)) return base
  let n = 2
  while (names.has(`${base} ${n}`)) n++
  return `${base} ${n}`.slice(0, MAX_NAME)
}

function nextId(doc: StudioDoc): string {
  const used = new Set(doc.objects.map((object) => object.id))
  let n = doc.objects.length + 1
  while (used.has(`o${n}`)) n++
  return `o${n}`
}

/** Adds a shape. New shapes stand on the grid, and each is set a little aside from the last so none hides another. */
export function addObject(doc: StudioDoc, kind: ShapeKind): StudioDoc {
  if (doc.objects.length >= MAX_OBJECTS) return doc
  const id = nextId(doc)
  const flat = kind === 'plane'
  const index = doc.objects.length
  const object: StudioObject = {
    id,
    name: uniqueName(doc, KIND_NAMES[kind]),
    kind,
    position: [((index % 5) - 2) * 1.6, flat ? 0.01 : 0.6, Math.floor(index / 5) * 1.6 - 1.6],
    rotation: kind === 'plane' ? [-Math.PI / 2, 0, 0] : [0, 0, 0],
    scale: flat ? [3, 3, 3] : kind === 'cone' || kind === 'cylinder' ? [1, 1.4, 1] : [1.2, 1.2, 1.2],
    material: materialFromPreset(kind === 'plane' ? 'matte-black' : 'racing-red'),
    visible: true,
    locked: false,
    custom: { ...DEFAULT_CUSTOM },
  }
  return { ...doc, objects: [...doc.objects, object], selectedId: id }
}

export function updateObject(doc: StudioDoc, id: string, patch: Partial<Omit<StudioObject, 'id'>>): StudioDoc {
  let changed = false
  const objects = doc.objects.map((object) => {
    if (object.id !== id) return object
    changed = true
    return sanitizeObject({ ...object, ...patch, id }, id, object.name)
  })
  return changed ? { ...doc, objects } : doc
}

export function updateMaterial(doc: StudioDoc, id: string, patch: Partial<MaterialDef>): StudioDoc {
  const object = doc.objects.find((item) => item.id === id)
  if (!object) return doc
  // Choosing another preset starts from that preset's values; anything else changes just what was touched.
  const material = patch.preset && patch.preset !== object.material.preset ? { ...materialFromPreset(patch.preset), ...patch } : { ...object.material, ...patch }
  return updateObject(doc, id, { material: sanitizeMaterial(material) })
}

export function removeObject(doc: StudioDoc, id: string): StudioDoc {
  if (!doc.objects.some((object) => object.id === id)) return doc
  const index = doc.objects.findIndex((object) => object.id === id)
  const objects = doc.objects.filter((object) => object.id !== id)
  const selectedId = doc.selectedId === id ? (objects[Math.min(index, objects.length - 1)]?.id ?? null) : doc.selectedId
  return { ...doc, objects, selectedId }
}

export function duplicateObject(doc: StudioDoc, id: string): StudioDoc {
  const source = doc.objects.find((object) => object.id === id)
  if (!source || doc.objects.length >= MAX_OBJECTS) return doc
  const copy: StudioObject = {
    ...source,
    id: nextId(doc),
    name: uniqueName(doc, source.name.replace(/ \d+$/, '')),
    position: clampVec([source.position[0] + 0.8, source.position[1], source.position[2] + 0.8], -POSITION_LIMIT, POSITION_LIMIT),
    material: { ...source.material },
    custom: { ...source.custom },
    locked: false,
  }
  return { ...doc, objects: [...doc.objects, copy], selectedId: copy.id }
}

export function selectObject(doc: StudioDoc, id: string | null): StudioDoc {
  if (id !== null && !doc.objects.some((object) => object.id === id)) return doc
  return doc.selectedId === id ? doc : { ...doc, selectedId: id }
}

export function selectedObject(doc: StudioDoc): StudioObject | null {
  return doc.objects.find((object) => object.id === doc.selectedId) ?? null
}

export function setLighting(doc: StudioDoc, patch: Partial<LightingDef>): StudioDoc {
  return parseStudioDoc({ ...doc, lighting: { ...doc.lighting, ...patch } }) ?? doc
}

/** Everything a project file may carry, and nothing else. */
export function serializeStudioDoc(doc: StudioDoc): StudioDoc {
  return parseStudioDoc(doc) ?? emptyDoc()
}
