/**
 * Where the server keeps what it has made. A provider deletes its files after a few days (Meshy: at most
 * three) and signs its addresses, so a finished model is copied the moment it is ready and served from
 * the copy.
 *
 *   memory   always: the job table and a bounded cache of model files. Gone when the process restarts.
 *   disk     when AI3D_STORAGE_DIR is set: every job as a small JSON file, every model as a .glb, and a
 *            usage.jsonl log, so jobs and models survive a restart and can be refined or fetched again
 *            until AI3D_KEEP_HOURS have passed.
 *
 * A failing disk never fails a creation: the handler keeps the copy in memory and logs the trouble.
 */
export interface JobStorage {
  readonly persistent: boolean
  loadJobs(): Promise<unknown[]>
  saveJob(id: string, job: unknown): Promise<void>
  removeJob(id: string): Promise<void>
  putAsset(key: string, bytes: Uint8Array): Promise<void>
  getAsset(key: string): Promise<Uint8Array | null>
  removeAsset(key: string): Promise<void>
  appendLog(line: string): Promise<void>
}

const KEY = /^[\w-]{1,96}$/
const checked = (key: string) => {
  if (!KEY.test(key)) throw new Error('Not a storage key.')
  return key
}

/** Jobs and models in the process's memory, the models bounded to `maxBytes` (oldest dropped first). */
export function createMemoryStorage(maxBytes = 128 * 1024 * 1024): JobStorage {
  const jobs = new Map<string, unknown>()
  const assets = new Map<string, Uint8Array>()
  let used = 0
  const drop = (key: string) => {
    const old = assets.get(key)
    if (old) used -= old.byteLength
    assets.delete(key)
  }
  return {
    persistent: false,
    loadJobs: async () => [],
    saveJob: async (id, job) => void jobs.set(checked(id), structuredClone(job)),
    removeJob: async (id) => void jobs.delete(id),
    async putAsset(key, bytes) {
      drop(checked(key))
      assets.set(key, bytes)
      used += bytes.byteLength
      for (const oldest of assets.keys()) {
        if (used <= maxBytes || assets.size <= 1) break
        if (oldest !== key) drop(oldest)
      }
    },
    getAsset: async (key) => assets.get(checked(key)) ?? null,
    removeAsset: async (key) => void drop(checked(key)),
    appendLog: async () => undefined,
  }
}

/** Jobs and models as files under `dir`. Node only; the file system is loaded when first used. */
export function createFileStorage(dir: string): JobStorage {
  let ready: Promise<{ fs: typeof import('node:fs/promises'); path: typeof import('node:path') }> | null = null
  const open = () =>
    (ready ??= (async () => {
      const [fs, path] = await Promise.all([import('node:fs/promises'), import('node:path')])
      await fs.mkdir(path.join(dir, 'jobs'), { recursive: true })
      await fs.mkdir(path.join(dir, 'models'), { recursive: true })
      return { fs, path }
    })())
  const write = async (target: string, data: string | Uint8Array) => {
    const { fs } = await open()
    const temp = `${target}.${process.pid}.tmp`
    await fs.writeFile(temp, data)
    await fs.rename(temp, target)
  }
  return {
    persistent: true,
    async loadJobs() {
      const { fs, path } = await open()
      const out: unknown[] = []
      for (const name of await fs.readdir(path.join(dir, 'jobs'))) {
        if (!name.endsWith('.json')) continue
        try {
          out.push(JSON.parse(await fs.readFile(path.join(dir, 'jobs', name), 'utf8')))
        } catch {
          // A damaged file is skipped; the others are still good.
        }
      }
      return out
    },
    async saveJob(id, job) {
      const { path } = await open()
      await write(path.join(dir, 'jobs', `${checked(id)}.json`), JSON.stringify(job))
    },
    async removeJob(id) {
      const { fs, path } = await open()
      await fs.rm(path.join(dir, 'jobs', `${checked(id)}.json`), { force: true })
    },
    async putAsset(key, bytes) {
      const { path } = await open()
      await write(path.join(dir, 'models', `${checked(key)}.glb`), bytes)
    },
    async getAsset(key) {
      const { fs, path } = await open()
      try {
        return new Uint8Array(await fs.readFile(path.join(dir, 'models', `${checked(key)}.glb`)))
      } catch {
        return null
      }
    },
    async removeAsset(key) {
      const { fs, path } = await open()
      await fs.rm(path.join(dir, 'models', `${checked(key)}.glb`), { force: true })
    },
    async appendLog(line) {
      const { fs, path } = await open()
      await fs.appendFile(path.join(dir, 'usage.jsonl'), `${line}\n`)
    },
  }
}
