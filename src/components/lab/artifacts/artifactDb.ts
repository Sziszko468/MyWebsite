/**
 * Saved works: the one place the visitor's work from the experiences is kept. A work is a
 * small record (a type, a name, a preview picture and the experience's own JSON) in the browser's
 * IndexedDB. There is no account and no server: it is private to this browser, and the visitor can
 * download any work as a file. Everything that comes back out of the store is checked again, because
 * the store is writable by anything running on this origin and by older versions of this code.
 *
 * Where IndexedDB is missing or blocked (some private windows), a memory store takes its place for
 * the visit and the service says so, so the page can tell the visitor their work will not survive a reload.
 */
export type ArtifactType = 'creation' | 'typography' | 'material'
export const ARTIFACT_TYPES: readonly ArtifactType[] = ['creation', 'typography', 'material']

export interface Artifact {
  id: string
  type: ArtifactType
  name: string
  createdAt: number
  updatedAt: number
  /** The experience's own project data (a creation's description, a typography or material setting), checked again on opening. */
  payload: Record<string, unknown>
  /** A small PNG as a data URL, if the experience can draw one. */
  thumbnail?: string
}

export const LIMITS = {
  artifacts: 100,
  /** JSON characters of one payload. */
  payload: 1_500_000,
  /** Characters of one preview data URL. */
  thumbnail: 150_000,
  name: 60,
} as const

export function cleanName(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback
  let name = ''
  for (const char of raw) if (char.charCodeAt(0) >= 32 && !'<>"\'`&\\'.includes(char)) name += char
  return name.trim().slice(0, LIMITS.name) || fallback
}

const THUMB = /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/

/** Accepts only what an artifact is; anything else is dropped. */
export function parseArtifact(raw: unknown): Artifact | null {
  if (typeof raw !== 'object' || raw === null) return null
  const record = raw as Record<string, unknown>
  if (typeof record.id !== 'string' || !/^[\w-]{1,48}$/.test(record.id)) return null
  if (!ARTIFACT_TYPES.includes(record.type as ArtifactType)) return null
  if (typeof record.payload !== 'object' || record.payload === null || Array.isArray(record.payload)) return null
  let size = 0
  try {
    size = JSON.stringify(record.payload).length
  } catch {
    return null
  }
  if (size > LIMITS.payload) return null
  const time = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0)
  const thumbnail =
    typeof record.thumbnail === 'string' && record.thumbnail.length <= LIMITS.thumbnail && THUMB.test(record.thumbnail)
      ? record.thumbnail
      : undefined
  return {
    id: record.id,
    type: record.type as ArtifactType,
    name: cleanName(record.name, 'Untitled'),
    createdAt: time(record.createdAt),
    updatedAt: time(record.updatedAt),
    payload: record.payload as Record<string, unknown>,
    thumbnail,
  }
}

export type FailReason = 'too-large' | 'full' | 'quota' | 'blocked' | 'invalid'
export type SaveOutcome = { ok: true; artifact: Artifact; persistent: boolean } | { ok: false; reason: FailReason }

/**
 * Binary files that belong to a work (an AI model is several megabytes: far too big for the work's own
 * record). Kept under a key the work names; a full browser says so by rejecting with a QuotaExceededError.
 */
export interface BlobStore {
  put(key: string, data: ArrayBuffer): Promise<void>
  get(key: string): Promise<ArrayBuffer | null>
  remove(key: string): Promise<void>
}

/** Where artifacts physically live. */
export interface Backend {
  readonly persistent: boolean
  all(): Promise<unknown[]>
  put(artifact: Artifact): Promise<void>
  remove(id: string): Promise<void>
  /** Where binary files go; a backend without it keeps them in memory for the visit. */
  blobs?: BlobStore
}

const BLOB_KEY = /^[\w-]{1,80}$/

export function createMemoryBlobs(): BlobStore {
  const files = new Map<string, ArrayBuffer>()
  const checked = (key: string) => {
    if (!BLOB_KEY.test(key)) throw new Error('Not a file key.')
    return key
  }
  return {
    put: async (key, data) => void files.set(checked(key), data.slice(0)),
    get: async (key) => files.get(checked(key))?.slice(0) ?? null,
    remove: async (key) => void files.delete(checked(key)),
  }
}

export function createMemoryBackend(): Backend {
  const items = new Map<string, Artifact>()
  return {
    persistent: false,
    all: async () => [...items.values()].map((item) => structuredClone(item)),
    put: async (artifact) => void items.set(artifact.id, structuredClone(artifact)),
    remove: async (id) => void items.delete(id),
    blobs: createMemoryBlobs(),
  }
}

const DB_NAME = 'lab-artifacts'
const STORE = 'artifacts'
const BLOBS = 'models'

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error ?? new DOMException('aborted', 'AbortError'))
  })
}

/** The IndexedDB store, or null where the browser has none or will not open it. */
export async function openIndexedDb(): Promise<Backend | null> {
  if (typeof indexedDB === 'undefined') return null
  try {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open(DB_NAME, 2)
      open.onupgradeneeded = () => {
        if (!open.result.objectStoreNames.contains(STORE)) open.result.createObjectStore(STORE, { keyPath: 'id' })
        if (!open.result.objectStoreNames.contains(BLOBS)) open.result.createObjectStore(BLOBS)
      }
      open.onsuccess = () => resolve(open.result)
      open.onerror = () => reject(open.error)
      open.onblocked = () => reject(new Error('blocked'))
    })
    return {
      persistent: true,
      async all() {
        return request(db.transaction(STORE).objectStore(STORE).getAll())
      },
      async put(artifact) {
        const tx = db.transaction(STORE, 'readwrite')
        tx.objectStore(STORE).put(artifact)
        await done(tx)
      },
      async remove(id) {
        const tx = db.transaction(STORE, 'readwrite')
        tx.objectStore(STORE).delete(id)
        await done(tx)
      },
      blobs: {
        async put(key, data) {
          if (!BLOB_KEY.test(key)) throw new Error('Not a file key.')
          const tx = db.transaction(BLOBS, 'readwrite')
          tx.objectStore(BLOBS).put(data, key)
          await done(tx)
        },
        async get(key) {
          if (!BLOB_KEY.test(key)) return null
          const found: unknown = await request(db.transaction(BLOBS).objectStore(BLOBS).get(key))
          return found instanceof ArrayBuffer ? found : null
        },
        async remove(key) {
          if (!BLOB_KEY.test(key)) return
          const tx = db.transaction(BLOBS, 'readwrite')
          tx.objectStore(BLOBS).delete(key)
          await done(tx)
        },
      },
    }
  } catch {
    return null
  }
}

export interface ArtifactService {
  readonly persistent: boolean
  /** Binary files belonging to works. */
  readonly files: BlobStore
  list(): Promise<Artifact[]>
  save(input: {
    id?: string
    type: ArtifactType
    name: string
    payload: Record<string, unknown>
    thumbnail?: string
  }): Promise<SaveOutcome>
  rename(id: string, name: string): Promise<boolean>
  remove(id: string): Promise<boolean>
}

export function createService(backend: Backend, now: () => number = Date.now): ArtifactService {
  const list = async (): Promise<Artifact[]> => {
    const found = (await backend.all()).map(parseArtifact).filter((item): item is Artifact => item !== null)
    return found.sort((a, b) => b.updatedAt - a.updatedAt)
  }
  const files = backend.blobs ?? createMemoryBlobs()
  return {
    persistent: backend.persistent,
    files,
    list,
    async save(input) {
      const candidate = parseArtifact({
        id: input.id ?? `a${now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`,
        type: input.type,
        name: cleanName(input.name, 'Untitled'),
        createdAt: now(),
        updatedAt: now(),
        payload: input.payload,
        thumbnail: input.thumbnail,
      })
      if (!candidate) {
        // Say why: too big is the one case the visitor can do something about.
        let size = 0
        try {
          size = JSON.stringify(input.payload).length
        } catch {
          size = 0
        }
        return { ok: false, reason: size > LIMITS.payload ? 'too-large' : 'invalid' }
      }
      try {
        const existing = await list()
        const previous = existing.find((item) => item.id === candidate.id)
        if (!previous && existing.length >= LIMITS.artifacts) return { ok: false, reason: 'full' }
        const artifact: Artifact = { ...candidate, createdAt: previous?.createdAt ?? candidate.createdAt }
        await backend.put(artifact)
        return { ok: true, artifact, persistent: backend.persistent }
      } catch (error) {
        return {
          ok: false,
          reason: error instanceof DOMException && error.name === 'QuotaExceededError' ? 'quota' : 'blocked',
        }
      }
    },
    async rename(id, name) {
      try {
        const item = (await list()).find((entry) => entry.id === id)
        if (!item) return false
        await backend.put({ ...item, name: cleanName(name, item.name), updatedAt: now() })
        return true
      } catch {
        return false
      }
    },
    async remove(id) {
      try {
        await backend.remove(id)
        return true
      } catch {
        return false
      }
    },
  }
}

let shared: Promise<ArtifactService> | null = null

/** The service for this browser: IndexedDB if it opens, otherwise a store that lasts for the visit. */
export function artifacts(): Promise<ArtifactService> {
  shared ??= openIndexedDb().then((idb) => createService(idb ?? createMemoryBackend()))
  return shared
}

/** How much of the browser's storage this site uses, if the browser will say. */
export async function storageUsage(): Promise<{ used: number; quota: number } | null> {
  try {
    const estimate = await navigator.storage?.estimate?.()
    if (!estimate || estimate.usage === undefined || estimate.quota === undefined) return null
    return { used: estimate.usage, quota: estimate.quota }
  } catch {
    return null
  }
}
