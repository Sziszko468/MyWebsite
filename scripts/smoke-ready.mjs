#!/usr/bin/env node
/**
 * A read-only smoke test of a deployed site (PROMPT 25): `GET /api/health` and `GET /api/ready`, nothing else. It is run by hand, or by
 * the manual workflow .github/workflows/smoke-ready.yml; nothing starts it after a deploy, and it can not start a deploy.
 *
 *   node scripts/smoke-ready.mjs --url=https://szilardkiss.com [--attempts=6] [--wait=10]
 *
 * It sends no cookie, no token and no body, and prints only the status and the names of the checks: never a header value or a body it
 * did not expect. A redirect is a failure, not something to follow: the address given should be the canonical one, so an answer that
 * sends the visitor somewhere else is exactly what this should report. A site that is still starting up gets a few more tries.
 */

import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const READY_CHECKS = { database: 'ok', migrations: 'current' }

/** The server wraps every answer as `{ "data": ... }` (server/src/http/reply.ts); an answer without the wrapper is read as it is. */
const payloadOf = (body) => (body && typeof body === 'object' && 'data' in body ? body.data : body)

/** Whether the answer of `/api/ready` says the site can do its work. Pure, so the test can hold it to account. */
export function evaluateReady(status, answer) {
  const body = payloadOf(answer)
  if (status !== 200) {
    // What the server says about the two checks that decide readiness (a fixed set of short words), so the operator sees which one failed.
    const checks = body && typeof body === 'object' && body.checks && typeof body.checks === 'object' ? body.checks : null
    const detail = checks ? `: database ${String(checks.database).slice(0, 20)}, migrations ${String(checks.migrations).slice(0, 20)}` : body?.status ? ` (${String(body.status).slice(0, 40)})` : ''
    return { ok: false, reason: `the readiness check answered HTTP ${status}${detail}` }
  }
  if (!body || typeof body !== 'object' || body.status !== 'ready') return { ok: false, reason: 'the readiness check answered 200 but did not say "ready"' }
  const checks = body.checks && typeof body.checks === 'object' ? body.checks : {}
  for (const [name, wanted] of Object.entries(READY_CHECKS)) {
    if (checks[name] !== wanted) return { ok: false, reason: `check "${name}" is "${String(checks[name]).slice(0, 40)}", not "${wanted}"` }
  }
  return { ok: true, reason: 'ready' }
}

/** The origin to test, or null when the text is not an http(s) origin without credentials, a path or a query. */
export function parseOrigin(text) {
  let url
  try {
    url = new URL(String(text ?? '').trim())
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  if (url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) return null
  return url.origin
}

async function get(origin, path, fetchImpl, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(`${origin}${path}`, { redirect: 'manual', signal: controller.signal, headers: { Accept: 'application/json', 'User-Agent': 'site-smoke-test' } })
    if (response.status >= 300 && response.status < 400) {
      let where = 'somewhere else'
      try {
        where = new URL(response.headers.get('location') ?? '', origin).origin
      } catch {
        // A Location that is not an address is reported as "somewhere else".
      }
      return { status: response.status, body: null, redirect: where }
    }
    const text = await response.text()
    let body = null
    try {
      body = text ? JSON.parse(text) : null
    } catch {
      body = null
    }
    return { status: response.status, body, redirect: null }
  } finally {
    clearTimeout(timer)
  }
}

/** One full attempt: the liveness answer, then the readiness answer. */
export async function smokeOnce(origin, fetchImpl = fetch, timeoutMs = 15_000) {
  for (const path of ['/api/health', '/api/ready']) {
    let answer
    try {
      answer = await get(origin, path, fetchImpl, timeoutMs)
    } catch (error) {
      return { ok: false, reason: `${path}: no answer (${error instanceof Error && error.name === 'AbortError' ? 'timed out' : 'connection failed'})` }
    }
    if (answer.redirect) return { ok: false, reason: `${path}: redirected (HTTP ${answer.status}) to ${answer.redirect}; test the canonical address instead`, final: true }
    if (path === '/api/health') {
      if (answer.status !== 200 || payloadOf(answer.body)?.status !== 'ok') return { ok: false, reason: `/api/health: HTTP ${answer.status}` }
      continue
    }
    const verdict = evaluateReady(answer.status, answer.body)
    return verdict.ok ? verdict : { ok: false, reason: `/api/ready: ${verdict.reason}` }
  }
  return { ok: false, reason: 'no verdict' }
}

export async function smoke(origin, { attempts = 6, waitSeconds = 10, fetchImpl = fetch, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), log = console.log } = {}) {
  let last = { ok: false, reason: 'not tried' }
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    last = await smokeOnce(origin, fetchImpl)
    log(`attempt ${attempt}/${attempts}: ${last.ok ? 'ok' : last.reason}`)
    if (last.ok || last.final) break
    if (attempt < attempts) await sleep(waitSeconds * 1000)
  }
  return last
}

function option(name) {
  const hit = process.argv.slice(2).find((arg) => arg.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : undefined
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const origin = parseOrigin(option('url'))
  if (!origin) {
    console.error('usage: node scripts/smoke-ready.mjs --url=https://your-site.example   (an address with no path, query or credentials)')
    process.exit(2)
  }
  const attempts = Math.min(Math.max(Number(option('attempts') ?? 6) || 6, 1), 30)
  const waitSeconds = Math.min(Math.max(Number(option('wait') ?? 10) || 10, 1), 120)
  const verdict = await smoke(origin, { attempts, waitSeconds })
  console.log(verdict.ok ? `smoke test ok: ${origin} is live and ready` : `smoke test FAILED for ${origin}: ${verdict.reason}`)
  process.exit(verdict.ok ? 0 : 1)
}
