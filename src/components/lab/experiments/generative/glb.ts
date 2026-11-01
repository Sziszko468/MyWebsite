import type { Object3D } from 'three'

/**
 * A model file from outside is checked before anything loads it: it must be a binary glTF 2.0 of a
 * sane size whose declared length matches, with a readable JSON description, at least one mesh, no
 * reference to anything on the network and no more geometry than a phone can draw. This is a
 * structural check, not a security scanner: the parser (three's GLTFLoader) still decides whether the
 * file can be read, and a failure there is reported the same way.
 */
export const MAX_GLB_BYTES = 50 * 1024 * 1024
const MAX_VERTICES = 1_500_000
const MAX_NODES = 5000
const MAX_MESHES = 400
const MAX_JSON_BYTES = 4 * 1024 * 1024

export type GlbProblem =
  | 'empty'
  | 'too-large'
  | 'not-glb'
  | 'version'
  | 'truncated'
  | 'bad-json'
  | 'no-mesh'
  | 'too-complex'
  | 'external-uri'

export type GlbCheck = { ok: true; bytes: number; meshes: number; nodes: number; vertices: number } | { ok: false; reason: GlbProblem }

const MAGIC = 0x46546c67 // "glTF"
const CHUNK_JSON = 0x4e4f534a // "JSON"

export function validateGlb(buffer: ArrayBuffer): GlbCheck {
  if (buffer.byteLength === 0) return { ok: false, reason: 'empty' }
  if (buffer.byteLength > MAX_GLB_BYTES) return { ok: false, reason: 'too-large' }
  if (buffer.byteLength < 28) return { ok: false, reason: 'not-glb' }
  const view = new DataView(buffer)
  if (view.getUint32(0, true) !== MAGIC) return { ok: false, reason: 'not-glb' }
  if (view.getUint32(4, true) !== 2) return { ok: false, reason: 'version' }
  const declared = view.getUint32(8, true)
  if (declared > buffer.byteLength || declared < 28) return { ok: false, reason: 'truncated' }
  const jsonLength = view.getUint32(12, true)
  if (view.getUint32(16, true) !== CHUNK_JSON) return { ok: false, reason: 'not-glb' }
  if (jsonLength > MAX_JSON_BYTES || 20 + jsonLength > declared) return { ok: false, reason: 'truncated' }

  let json: Record<string, unknown>
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(buffer, 20, jsonLength))
    const parsed: unknown = JSON.parse(text)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return { ok: false, reason: 'bad-json' }
    json = parsed as Record<string, unknown>
  } catch {
    return { ok: false, reason: 'bad-json' }
  }
  const asset = json.asset as { version?: unknown } | undefined
  if (typeof asset?.version !== 'string' || !asset.version.startsWith('2')) return { ok: false, reason: 'version' }

  const list = (key: string): unknown[] => (Array.isArray(json[key]) ? (json[key] as unknown[]) : [])
  const meshes = list('meshes')
  const nodes = list('nodes')
  if (meshes.length === 0) return { ok: false, reason: 'no-mesh' }
  if (meshes.length > MAX_MESHES || nodes.length > MAX_NODES) return { ok: false, reason: 'too-complex' }

  // A GLB carries its data inside; a link to another address is not allowed (and would be a request the page did not make).
  for (const entry of [...list('buffers'), ...list('images')]) {
    const uri = (entry as { uri?: unknown } | null)?.uri
    if (uri !== undefined && !(typeof uri === 'string' && uri.startsWith('data:'))) return { ok: false, reason: 'external-uri' }
  }

  const accessors = list('accessors') as Array<{ count?: unknown }>
  let vertices = 0
  for (const mesh of meshes as Array<{ primitives?: Array<{ attributes?: { POSITION?: unknown } }> }>) {
    for (const primitive of mesh?.primitives ?? []) {
      const index = primitive?.attributes?.POSITION
      const count = typeof index === 'number' ? accessors[index]?.count : undefined
      if (typeof count === 'number' && Number.isFinite(count)) vertices += count
    }
  }
  if (vertices > MAX_VERTICES) return { ok: false, reason: 'too-complex' }

  return { ok: true, bytes: buffer.byteLength, meshes: meshes.length, nodes: nodes.length, vertices }
}

/** Exports a three.js object as a binary glTF. The exporter is its own chunk and loads only when asked. */
export async function exportGlb(root: Object3D): Promise<ArrayBuffer> {
  const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js')
  const result = await new GLTFExporter().parseAsync(root, { binary: true, onlyVisible: true, maxTextureSize: 256 })
  return result as ArrayBuffer
}
