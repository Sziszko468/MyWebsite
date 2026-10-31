import { Plane, Ray, Vector3 } from 'three'

/**
 * The geometry of dragging a handle, as pure functions. A drag always starts with a ray (the
 * pointer, seen from the camera) and a rule that turns the ray into one number: how far along
 * an axis, which angle round a ring. The editor takes the difference between that number now and
 * at the start of the drag, so a handle moves exactly as far as the pointer did, wherever on the
 * handle it was grabbed.
 */

const EPSILON = 1e-6

/**
 * The distance along an axis line (through `origin`, direction `axis`, unit length) of the point
 * on it that is nearest to the ray. Null when the ray is parallel to the axis (the axis is seen
 * end-on, so a drag along it means nothing).
 */
export function axisParameter(ray: Ray, origin: Vector3, axis: Vector3): number | null {
  const w = origin.clone().sub(ray.origin)
  const b = axis.dot(ray.direction)
  const d = axis.dot(w)
  const e = ray.direction.dot(w)
  const denominator = 1 - b * b
  if (Math.abs(denominator) < EPSILON) return null
  return (b * e - d) / denominator
}

/** Where the ray meets the plane through `origin` with `normal`, or null if it is parallel or behind. */
export function planeHit(ray: Ray, origin: Vector3, normal: Vector3): Vector3 | null {
  return ray.intersectPlane(new Plane().setFromNormalAndCoplanarPoint(normal, origin), new Vector3())
}

/** Two unit vectors perpendicular to an axis and to each other: a frame to measure angles in. */
export function perpendicularFrame(axis: Vector3): { u: Vector3; v: Vector3 } {
  const reference = Math.abs(axis.y) < 0.9 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0)
  const u = new Vector3().crossVectors(axis, reference).normalize()
  const v = new Vector3().crossVectors(axis, u).normalize()
  return { u, v }
}

/** The angle (radians) of the ray's hit on the ring's plane, measured round the axis in the frame (u, v). */
export function ringAngle(ray: Ray, origin: Vector3, axis: Vector3, frame: { u: Vector3; v: Vector3 }): number | null {
  const hit = planeHit(ray, origin, axis)
  if (!hit) return null
  const offset = hit.sub(origin)
  return Math.atan2(offset.dot(frame.v), offset.dot(frame.u))
}

/** The smallest signed difference between two angles, in (−π, π]. A drag that crosses ±π does not jump. */
export function angleDelta(from: number, to: number): number {
  let delta = to - from
  while (delta > Math.PI) delta -= Math.PI * 2
  while (delta <= -Math.PI) delta += Math.PI * 2
  return delta
}

/** Rounds to a step (0 or less means no snapping). */
export function snap(value: number, step: number): number {
  return step > 0 ? Math.round(value / step) * step : value
}

/** A scale after dragging a handle: proportional to how far the handle was pulled out, never through zero. */
export function scaledByDrag(start: number, grabbed: number, now: number, minimum: number, maximum: number): number {
  // Grabbed close to the centre, a proportional rule would explode; the offset keeps it gentle.
  const reference = Math.max(Math.abs(grabbed), 0.6)
  const next = start * (1 + (now - grabbed) / reference)
  return Math.min(maximum, Math.max(minimum, next))
}
