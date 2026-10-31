import type { LabId } from '../../../content/lab'
import { createStore } from '../experience/store'

/**
 * The Lab's space: four zones, each the front door of one of the four applications. This file is
 * the logic of that space and nothing else (no React, no WebGL), so it can be tested: which zone is
 * awake and why, where the zones stand on the stage, which one a pointer is over, and what a click
 * or a tap does. The 3D objects (zoneRigs.ts), the scene (LabZonesScene.tsx) and the bar of links
 * under it (LabZoneBar.tsx) all read and write the same store, so hovering an object lights its
 * link and focusing a link wakes its object.
 */

export const ZONE_IDS = [
  'model-studio',
  'racing',
  'track-architect',
  'performance-lab',
] as const satisfies readonly LabId[]
export type ZoneId = (typeof ZONE_IDS)[number]

export function isZone(id: string): id is ZoneId {
  return (ZONE_IDS as readonly string[]).includes(id)
}

/**
 * What made a zone the active one. A source can only give up what it set itself: a pointer leaving
 * an object never clears the zone a keyboard has focused, and the other way round.
 */
export type ZoneSource = 'hover' | 'link' | 'focus' | 'tap'

export interface ZoneState {
  active: ZoneId | null
  source: ZoneSource | null
  /** The zone being entered: the camera is flying into it and the page is about to change. */
  opening: ZoneId | null
}

const IDLE: ZoneState = { active: null, source: null, opening: null }

export const zoneStore = createStore<ZoneState>(IDLE)

export function activate(zone: ZoneId, source: ZoneSource): void {
  zoneStore.set((state) => {
    if (state.opening) return state
    if (state.active === zone && state.source === source) return state
    return { ...state, active: zone, source }
  })
}

export function release(source: ZoneSource): void {
  zoneStore.set((state) => (state.opening || state.source !== source ? state : IDLE))
}

export function beginOpening(zone: ZoneId): void {
  zoneStore.set((state) => (state.opening ? state : { active: zone, source: state.source, opening: zone }))
}

export function resetZones(): void {
  zoneStore.set(IDLE)
}

// ── What a click or a tap does ──────────────────────────────────────────────────────────

export type TapOutcome =
  { kind: 'open'; zone: ZoneId } | { kind: 'select'; zone: ZoneId } | { kind: 'clear' } | { kind: 'none' }

/**
 * A click enters the zone under the pointer. A finger has no hover to say "this one" first, so
 * the first tap on a zone selects it (it wakes, its words show) and a tap on the selected zone
 * enters it. A tap on empty space gives up a selection made by tapping.
 */
export function resolveTap(
  state: Pick<ZoneState, 'active' | 'source'>,
  hit: ZoneId | null,
  touch: boolean,
): TapOutcome {
  if (!hit) return state.source === 'tap' ? { kind: 'clear' } : { kind: 'none' }
  if (!touch) return { kind: 'open', zone: hit }
  return state.active === hit ? { kind: 'open', zone: hit } : { kind: 'select', zone: hit }
}

// ── Where the zones stand ─────────────────────────────────────────────────────────────

/**
 * Positions are in view units: 1 is half the stage's height, x runs right and y up from the
 * stage's centre. The scene turns them into world units at the zones' depth, so a zone stands
 * exactly where the page's layout says it should whatever the stage's shape.
 */
export interface ZonePlace {
  x: number
  y: number
  r: number
}

export interface Box {
  left: number
  top: number
  width: number
  height: number
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/**
 * Four zones in a row over the four links of the bar: each stands above its link, and the row
 * fills the free band between the headline and the bar. Null when there is no usable band or the
 * links stand too close for the objects to be told apart.
 */
export function rowPlacement(
  stage: Box,
  itemCentres: readonly number[],
  bandTop: number,
  bandBottom: number,
): ZonePlace[] | null {
  if (itemCentres.length !== ZONE_IDS.length || stage.height <= 0) return null
  const half = stage.height / 2
  const bandHalf = (bandBottom - bandTop) / 2 / half
  if (!(bandHalf > 0.08)) return null
  const centreX = stage.left + stage.width / 2
  const centreY = stage.top + half
  const xs = itemCentres.map((x) => (x - centreX) / half)
  let spacing = Infinity
  for (let i = 1; i < xs.length; i++) spacing = Math.min(spacing, Math.abs(xs[i] - xs[i - 1]))
  const y = (centreY - (bandTop + bandBottom) / 2) / half
  // Too little room for four readable, separate objects: let the caller use the grid instead.
  const r = Math.min(bandHalf * 0.94, spacing * 0.44, 0.9)
  if (r < 0.14) return null
  return xs.map((x) => ({ x, y, r }))
}

/**
 * Where the zones stand when nothing in the page lines them up: a 2 × 2 grid, or one row when the
 * stage is a very wide, short strip (a phone on its side).
 */
export function autoPlacement(aspect: number): ZonePlace[] {
  const a = clamp(aspect, 0.3, 6)
  if (a >= 2.4) {
    const spacing = Math.min(a / 2.3, 1.5)
    const r = Math.min(spacing * 0.42, 0.62)
    return ZONE_IDS.map((_, i) => ({ x: (i - 1.5) * spacing, y: 0, r }))
  }
  const r = Math.min(a / 2, 0.5) * 0.76
  const x = a / 2
  return [
    { x: -x, y: 0.5, r },
    { x, y: 0.5, r },
    { x: -x, y: -0.5, r },
    { x, y: -0.5, r },
  ]
}

// ── Which zone a point is over ────────────────────────────────────────────────────────

/** A zone as the screen sees it: its centre and radius in view units. */
export interface Anchor {
  id: ZoneId
  x: number
  y: number
  r: number
}

/**
 * The zone under a point in stage space (-1..1 on both axes, y up), or null. The zones are
 * circles on screen; a point counts as over one a little outside its edge, and never closer than
 * `minRadius` (a fingertip is not a pixel). When circles overlap the one the point is nearest
 * the centre of, in proportion to its size, wins.
 */
export function hitZone(
  anchors: readonly Anchor[],
  px: number,
  py: number,
  aspect: number,
  minRadius = 0,
): ZoneId | null {
  const x = px * aspect
  let best: ZoneId | null = null
  let bestScore = Infinity
  for (const anchor of anchors) {
    const reach = Math.max(anchor.r * 1.15, minRadius)
    const score = Math.hypot(x - anchor.x, py - anchor.y) / reach
    if (score <= 1 && score < bestScore) {
      best = anchor.id
      bestScore = score
    }
  }
  return best
}

// ── The way in ────────────────────────────────────────────────────────────────────────

/** The stage's camera at rest: the page's layout and the scene both place the zones from it. */
export const ZONE_CAMERA = { fov: 40, position: [0, 0, 6.4] as [number, number, number] }

/** How far in front of the core (which stands at the origin) the zones stand. */
export const ZONE_DEPTH = 1.2

/** Seconds the camera takes to fly into a zone before the page changes. */
export const OPEN_SECONDS = 0.62

/** 0..1, eased: how far into the entry flight `now` is. */
export function openingProgress(now: number, since: number, seconds: number = OPEN_SECONDS): number {
  const t = clamp((now - since) / seconds, 0, 1)
  return 1 - Math.pow(1 - t, 3)
}

/** A plain left click, with no modifier: the only kind a page may take over from the browser. */
export function isPlainClick(event: {
  button: number
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
  defaultPrevented: boolean
}): boolean {
  return (
    !event.defaultPrevented &&
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  )
}
