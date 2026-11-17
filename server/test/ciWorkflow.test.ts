import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { startServer } from './helpers.ts'

/**
 * PROMPT 25: the deployment checks. The CI workflow covers the branch the host deploys from, it runs the same steps as `npm run check:deploy`,
 * and no workflow of the repository can deploy anything or touch a hosting setting. The smoke test of a deployed site is read-only and judges
 * the readiness answer strictly. Everything here reads files and calls pure functions: no network, no hosting account.
 */

const root = join(import.meta.dirname, '..', '..')
const text = (path: string): string => readFileSync(join(root, path), 'utf8').replace(/\r\n/g, '\n')
const workflowFiles = readdirSync(join(root, '.github', 'workflows')).filter((name) => /\.ya?ml$/.test(name))
const packageScripts = (JSON.parse(text('package.json')) as { scripts: Record<string, string> }).scripts

/** The npm scripts the pre-deploy runner runs, read from its own source (it runs on import, so it is not imported). */
const deploySteps = [...text('scripts/check-deploy.mjs').matchAll(/script: '([^']+)'/g)].map((match) => match[1])
const commandOf = (script: string): string => (script === 'test' ? 'npm test' : `npm run ${script}`)

describe('the CI workflow covers the branch the host deploys from', () => {
  const ci = text('.github/workflows/ci.yml')

  it('runs on a push to the deployment branch and to main, and on every pull request', () => {
    expect(ci).toMatch(/push:\n\s+branches: \[[^\]]*\bdeployment\/render-cloudflare\b[^\]]*\]/)
    expect(ci).toMatch(/push:\n\s+branches: \[[^\]]*\bmain\b[^\]]*\]/)
    expect(ci).toMatch(/\n {2}pull_request:/)
  })

  it('runs every step that check:deploy runs, so the two cannot drift apart', () => {
    expect(deploySteps).toEqual(['typecheck', 'lint', 'test', 'build', 'check:seo'])
    for (const script of deploySteps) {
      expect(packageScripts[script], `package.json has no "${script}" script`).toBeTruthy()
      expect(ci, `ci.yml does not run ${commandOf(script)}`).toContain(commandOf(script))
    }
    expect(packageScripts['check:deploy']).toBe('node scripts/check-deploy.mjs')
  })

  it('holds the sitemap to the canonical host: the build and the SEO check get the same address, for that step only', () => {
    const step = ci.slice(ci.indexOf('- name: Build and check the pages the build wrote'))
    expect(step).toMatch(/VITE_SITE_URL: https:\/\/szilardkiss\.com\n/)
    expect(step).toMatch(/EXPECTED_SITE_ORIGIN: https:\/\/szilardkiss\.com\n/)
    // The tests run without it, so no test starts to depend on a build-time address.
    expect(ci.slice(0, ci.indexOf('- name: Build and check'))).not.toMatch(/VITE_SITE_URL/)
  })
})

describe('no workflow can deploy anything', () => {
  it('has at least the workflows it should', () => {
    expect(workflowFiles).toEqual(expect.arrayContaining(['ci.yml', 'smoke-ready.yml']))
  })

  for (const name of workflowFiles) {
    describe(name, () => {
      const body = text(`.github/workflows/${name}`)
      // Comments explain what a workflow does not do; only what the machine would run counts.
      const code = body.split('\n').filter((line) => !/^\s*#/.test(line)).join('\n')

      it('may only read the repository', () => {
        expect(code).toMatch(/\npermissions:\n\s+contents: read\n/)
        expect(code).not.toMatch(/contents: write|id-token|deployments:|packages: write/)
      })

      it('holds no secret and no deploy hook, and calls no hosting API or deploy command', () => {
        expect(code).not.toMatch(/secrets\./)
        expect(code).not.toMatch(/api\.render\.com|render\.com\/deploy|deploy[-_ ]?hook|RENDER_[A-Z_]*|CLOUDFLARE_[A-Z_]*/i)
        expect(code).not.toMatch(/wrangler(-action)?\s+(deploy|publish|pages)|cloudflare\/wrangler-action|gh\s+(release|workflow run)|git\s+push/i)
        expect(code).not.toMatch(/\benvironment:|\bworkflow_run:|\bworkflow_call:/)
      })
    })
  }

  it('starts the smoke test and the quotation journeys by hand only', () => {
    for (const name of ['smoke-ready.yml', 'e2e-quote.yml']) {
      const on = text(`.github/workflows/${name}`).split('\njobs:')[0]
      expect(on, name).toMatch(/\non:\n\s+workflow_dispatch:/)
      expect(on, name).not.toMatch(/\n\s+(push|pull_request|schedule):/)
    }
  })

  it('passes the smoke test its inputs through the environment, not into the command line', () => {
    const code = text('.github/workflows/smoke-ready.yml')
    expect(code).toContain('SMOKE_URL: ${{ inputs.url }}')
    expect(code).toContain('--url="$SMOKE_URL"')
    expect(code.split('\n').filter((line) => /^\s+run:/.test(line) || /^\s{10,}node /.test(line)).join('\n')).not.toContain('${{')
  })
})

describe('the smoke test of a deployed site', async () => {
  // A dynamic import with a computed address: the script is plain JavaScript and the typechecker need not describe it.
  const smokeModule = pathToFileURL(join(root, 'scripts', 'smoke-ready.mjs')).href
  const { evaluateReady, parseOrigin, smoke, smokeOnce } = (await import(/* @vite-ignore */ smokeModule)) as {
    evaluateReady: (status: number, body: unknown) => { ok: boolean; reason: string }
    parseOrigin: (text: unknown) => string | null
    smoke: (origin: string, options: Record<string, unknown>) => Promise<{ ok: boolean; reason: string }>
    smokeOnce: (origin: string, fetchImpl: typeof fetch, timeoutMs?: number) => Promise<{ ok: boolean; reason: string; final?: boolean }>
  }

  // The server wraps every answer as { data: ... } (server/src/http/reply.ts), and so does every stand-in below: a stand-in with a shape the server
  // does not use would let this script pass here and fail on the real site (the last test asks the real server).
  const ready = { status: 'ready', checks: { database: 'ok', migrations: 'current', email: 'configured' } }
  const wrapped = (data: unknown) => ({ data })
  const json = (status: number, body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })

  it('accepts only a ready answer with a working database and current migrations', () => {
    expect(evaluateReady(200, wrapped(ready)).ok).toBe(true)
    expect(evaluateReady(503, wrapped({ status: 'not_ready', checks: { database: 'unavailable', migrations: 'unknown' } })).ok).toBe(false)
    expect(evaluateReady(200, wrapped({ status: 'not_ready', checks: ready.checks })).ok).toBe(false)
    expect(evaluateReady(200, wrapped({ status: 'ready', checks: { database: 'ok', migrations: 'pending' } })).reason).toContain('migrations')
    expect(evaluateReady(200, wrapped({ status: 'ready' })).ok).toBe(false)
    expect(evaluateReady(200, wrapped({ status: 'ready', checks: { database: 'unavailable', migrations: 'current' } })).ok).toBe(false)
    // An answer without the wrapper is read as it is.
    expect(evaluateReady(200, ready).ok).toBe(true)
    expect(evaluateReady(200, null).ok).toBe(false)
    expect(evaluateReady(200, 'ready').ok).toBe(false)
  })

  it('takes an origin and nothing else as the address to test', () => {
    expect(parseOrigin('https://szilardkiss.com')).toBe('https://szilardkiss.com')
    expect(parseOrigin(' https://szilardkiss.com/ ')).toBe('https://szilardkiss.com')
    expect(parseOrigin('http://127.0.0.1:8830')).toBe('http://127.0.0.1:8830')
    for (const bad of ['', undefined, 'szilardkiss.com', 'ftp://szilardkiss.com', 'https://user:pass@szilardkiss.com', 'https://szilardkiss.com/admin', 'https://szilardkiss.com/?a=1', 'javascript:alert(1)']) expect(parseOrigin(bad), String(bad)).toBeNull()
  })

  it('asks the health and the readiness endpoint, with a plain GET and nothing that identifies a person', async () => {
    const seen: Array<{ url: string; method: string; headers: Record<string, string>; body: unknown }> = []
    const fake = (async (url: string, init: RequestInit) => {
      seen.push({ url, method: init.method ?? 'GET', headers: Object.fromEntries(new Headers(init.headers).entries()), body: init.body })
      return url.endsWith('/api/health') ? json(200, wrapped({ status: 'ok' })) : json(200, wrapped(ready))
    }) as unknown as typeof fetch
    expect((await smokeOnce('https://szilardkiss.com', fake)).ok).toBe(true)
    expect(seen.map((call) => call.url)).toEqual(['https://szilardkiss.com/api/health', 'https://szilardkiss.com/api/ready'])
    for (const call of seen) {
      expect(call.method).toBe('GET')
      expect(call.body).toBeUndefined()
      expect(Object.keys(call.headers).sort()).toEqual(['accept', 'user-agent'])
    }
  })

  it('reports a redirect as the finding and does not retry it', async () => {
    let calls = 0
    const fake = (async () => {
      calls += 1
      return new Response(null, { status: 301, headers: { Location: 'https://www.szilardkiss.com/api/health' } })
    }) as unknown as typeof fetch
    const verdict = await smoke('https://szilardkiss.com', { attempts: 5, waitSeconds: 1, fetchImpl: fake, sleep: async () => {}, log: () => {} })
    expect(verdict.ok).toBe(false)
    expect(verdict.reason).toContain('redirected')
    expect(verdict.reason).toContain('https://www.szilardkiss.com')
    expect(calls).toBe(1)
  })

  it('tries again while the site is starting, and stops as soon as it is ready', async () => {
    let ready503 = 2
    const fake = (async (url: string) => {
      if (url.endsWith('/api/health')) return json(200, wrapped({ status: 'ok' }))
      if (ready503 > 0) {
        ready503 -= 1
        return json(503, wrapped({ status: 'not_ready', checks: { database: 'ok', migrations: 'pending' } }))
      }
      return json(200, wrapped(ready))
    }) as unknown as typeof fetch
    const lines: string[] = []
    const waits: number[] = []
    const verdict = await smoke('https://szilardkiss.com', { attempts: 6, waitSeconds: 7, fetchImpl: fake, sleep: async (ms: number) => void waits.push(ms), log: (line: string) => void lines.push(line) })
    expect(verdict.ok).toBe(true)
    expect(lines).toHaveLength(3)
    expect(waits).toEqual([7000, 7000])
  })

  it('gives up after the attempts it was given, and says why', async () => {
    const fake = (async () => {
      throw new TypeError('connect ECONNREFUSED 10.0.0.1:443 secret-host.internal')
    }) as unknown as typeof fetch
    const verdict = await smoke('https://szilardkiss.com', { attempts: 3, waitSeconds: 1, fetchImpl: fake, sleep: async () => {}, log: () => {} })
    expect(verdict.ok).toBe(false)
    expect(verdict.reason).toContain('no answer')
    // What the network layer said about hosts and addresses is not repeated.
    expect(verdict.reason).not.toMatch(/10\.0\.0\.1|secret-host/)
  })

  it('agrees with the real server: its own answers are accepted, and a pending migration is refused', async () => {
    const server = await startServer()
    try {
      const real = await smokeOnce(server.url, fetch)
      expect(real, JSON.stringify(real)).toMatchObject({ ok: true })
      const answer = await server.api('/api/ready')
      expect(evaluateReady(answer.status, answer.json).ok).toBe(true)

      // The newest migration is taken off the record: the server itself says it is not ready, and so does the script.
      server.db.run('DELETE FROM schema_migrations WHERE version = (SELECT MAX(version) FROM schema_migrations)')
      const pending = await server.api('/api/ready')
      expect(pending.status).toBe(503)
      const verdict = await smokeOnce(server.url, fetch)
      expect(verdict.ok).toBe(false)
      expect(verdict.reason).toContain('/api/ready')
      expect(verdict.reason).toContain('migrations')
    } finally {
      await server.close()
    }
  })
})
