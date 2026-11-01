/**
 * The server's own look at a model file before it keeps or passes one on. The browser checks it again
 * (and in more detail) before loading it; this is the first gate, so a service that sends something
 * else than a binary glTF never gets its answer stored or shown.
 */
export type FileProblem = 'empty' | 'too-large' | 'not-glb' | 'version' | 'truncated' | 'bad-json' | 'no-mesh' | 'external-uri'

const MAGIC = 0x46546c67 // "glTF"
const CHUNK_JSON = 0x4e4f534a // "JSON"

export function inspectGlb(bytes: Uint8Array, maxBytes: number): { ok: true } | { ok: false; reason: FileProblem } {
  if (bytes.byteLength === 0) return { ok: false, reason: 'empty' }
  if (bytes.byteLength > maxBytes) return { ok: false, reason: 'too-large' }
  if (bytes.byteLength < 28) return { ok: false, reason: 'not-glb' }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint32(0, true) !== MAGIC) return { ok: false, reason: 'not-glb' }
  if (view.getUint32(4, true) !== 2) return { ok: false, reason: 'version' }
  const declared = view.getUint32(8, true)
  if (declared > bytes.byteLength || declared < 28) return { ok: false, reason: 'truncated' }
  const jsonLength = view.getUint32(12, true)
  if (view.getUint32(16, true) !== CHUNK_JSON || 20 + jsonLength > declared) return { ok: false, reason: 'truncated' }
  let json: Record<string, unknown>
  try {
    const parsed: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(20, 20 + jsonLength)))
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return { ok: false, reason: 'bad-json' }
    json = parsed as Record<string, unknown>
  } catch {
    return { ok: false, reason: 'bad-json' }
  }
  const list = (key: string): unknown[] => (Array.isArray(json[key]) ? (json[key] as unknown[]) : [])
  if (list('meshes').length === 0) return { ok: false, reason: 'no-mesh' }
  for (const entry of [...list('buffers'), ...list('images')]) {
    const uri = (entry as { uri?: unknown } | null)?.uri
    if (uri !== undefined && !(typeof uri === 'string' && uri.startsWith('data:'))) return { ok: false, reason: 'external-uri' }
  }
  return { ok: true }
}
