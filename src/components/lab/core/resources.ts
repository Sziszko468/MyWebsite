import { useEffect, useMemo, type DependencyList } from 'react'
import { BufferGeometry, Float32BufferAttribute, IcosahedronGeometry } from 'three'
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'

/**
 * Creates a GPU-backed object (geometry, material, texture, render target) once per `deps` and
 * disposes it when it is replaced or the component goes away, so leaving an experiment frees its
 * memory. Disposing only releases the GPU copy; if React re-uses the object (StrictMode runs
 * effects twice in development), three simply uploads it again.
 */
export function useDisposable<T extends { dispose(): void }>(create: () => T, deps: DependencyList): T {
  // The caller's list is the dependency list by design, so the linter cannot see through it.
  // oxlint-disable-next-line react/use-memo, react-hooks/exhaustive-deps
  const value = useMemo(create, deps)
  useEffect(() => () => value.dispose(), [value])
  return value
}

/**
 * A unit icosphere with shared vertices and no normals or UVs: just directions on a sphere, which
 * is all a shader needs when it displaces the surface and measures the normals itself. Merging
 * the vertices of the (unindexed) polyhedron makes it about six times lighter for the vertex
 * stage: detail 64 is 41,000 vertices instead of 250,000.
 */
export function createIcoSphere(detail: number): BufferGeometry {
  const base = new IcosahedronGeometry(1, Math.max(1, Math.round(detail)))
  base.deleteAttribute('normal')
  base.deleteAttribute('uv')
  const merged = mergeVertices(base, 1e-4)
  base.dispose()

  // The merged geometry keeps only `position`; make sure no stray attribute survives.
  for (const name of Object.keys(merged.attributes)) {
    if (name !== 'position') merged.deleteAttribute(name)
  }
  merged.computeBoundingSphere()
  return merged
}

/** Number of vertices a unit icosphere of this detail has, without building it: 10·(d+1)² + 2. */
export function icoSphereVertexCount(detail: number): number {
  const d = Math.max(1, Math.round(detail))
  return 10 * (d + 1) * (d + 1) + 2
}

/** A BufferGeometry made of one float attribute per entry, for point clouds and instanced quads. */
export function geometryFromArrays(attributes: Record<string, { array: Float32Array; size: number }>): BufferGeometry {
  const geometry = new BufferGeometry()
  for (const [name, { array, size }] of Object.entries(attributes)) {
    geometry.setAttribute(name, new Float32BufferAttribute(array, size))
  }
  return geometry
}
