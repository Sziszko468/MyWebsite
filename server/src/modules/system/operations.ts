import type { IncomingMessage } from 'node:http'
import { existsSync, statSync, statfsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import type { AppContext } from '../../context.ts'
import { migrationStatus } from '../../db/migrate.ts'
import { listSnapshots } from '../../db/snapshot.ts'
import { clientIp } from '../../http/request.ts'
import { availability } from '../ai/settings.ts'
import { readVerification, verificationLabel } from '../ai/verification.ts'
import { backupRunning } from '../backups/googleDrive.ts'
import { backupStatus } from '../backups/records.ts'

/**
 * The first screen of a command center (PROMPT 25): what an operator wants to know before anything else, gathered in one read-only
 * place. Every part answers "is it working?" with a fact and a time, never with a guess: where something is not known (a check that
 * has not run since the server started, a host that does not say its commit) it says so.
 *
 * Nothing here holds a secret, a token, a path, an environment value, a customer's name or address, or the text of a provider's answer.
 * The only addresses are the ones of the request the administrator is making right now (their own, to measure TRUST_PROXY).
 */

const MIB = 1_048_576
const SAFE_ADDRESS = /^[0-9A-Fa-f:.]{2,45}$/

export interface DiskView {
  available: boolean
  freeBytes: number | null
  totalBytes: number | null
  freePercent: number | null
  /** The database file, without its journal. */
  databaseBytes: number | null
  /** Less than 10 % or 512 MiB free: a full disk stops writes, backups and migration snapshots. */
  low: boolean
}

/** The volume the database lives on. An in-memory database (tests) has none. */
export function diskData(databasePath: string): DiskView {
  const none: DiskView = { available: false, freeBytes: null, totalBytes: null, freePercent: null, databaseBytes: null, low: false }
  if (databasePath === ':memory:') return none
  try {
    const location = resolve(databasePath)
    const volume = statfsSync(existsSync(dirname(location)) ? dirname(location) : '.')
    const total = Number(volume.blocks) * Number(volume.bsize)
    const free = Number(volume.bavail) * Number(volume.bsize)
    const percent = total > 0 ? Math.round((free / total) * 1000) / 10 : null
    return { available: true, freeBytes: free, totalBytes: total, freePercent: percent, databaseBytes: existsSync(location) ? statSync(location).size : null, low: (percent !== null && percent < 10) || free < 512 * MIB }
  } catch {
    return none
  }
}

export type NetworkVerdict =
  /** No proxy header at all: a direct connection (or a proxy that adds none). */
  | 'direct'
  /** Cloudflare's header and the address the application picked agree: the setting fits this request. */
  | 'matches_cloudflare_header'
  | 'differs_from_cloudflare_header'
  /** Forwarding headers but no Cloudflare header: a proxy that is not Cloudflare, or Cloudflare is not in front. */
  | 'proxy_without_cloudflare_header'

export interface NetworkView {
  /** The address the application takes this request to come from (what the rate limits and the sign-in lock use). */
  clientIp: string
  /** The address of the connection that reached the application (a proxy's, when there is one). */
  socketAddress: string
  /** The `X-Forwarded-For` list of THIS request, left to right (at most ten entries). */
  forwardedFor: string[]
  /** What Cloudflare says the visitor's address is, if the request came through it. */
  cloudflareConnectingIp: string | null
  trustProxy: number
  verdict: NetworkVerdict
  /** The `TRUST_PROXY` that would have picked the address Cloudflare reports on this request; null when it cannot be measured here. */
  measuredTrustProxy: number | null
}

const safeAddress = (value: string): string => (SAFE_ADDRESS.test(value) ? value.replace(/^::ffff:/, '') : '(unreadable)')

/** How this very request reached the application, to measure `TRUST_PROXY` against: the administrator compares `clientIp` with their own address. */
export function networkData(request: IncomingMessage, trustProxy: number): NetworkView {
  const header = (name: string): string => {
    const value = request.headers[name]
    return typeof value === 'string' ? value : Array.isArray(value) ? value.join(',') : ''
  }
  const forwardedFor = header('x-forwarded-for').split(',').map((part) => part.trim()).filter(Boolean).slice(0, 10).map(safeAddress)
  const rawCloudflare = header('cf-connecting-ip').trim()
  const cloudflare = rawCloudflare ? safeAddress(rawCloudflare) : null
  const seen = clientIp(request, trustProxy)
  const verdict: NetworkVerdict = cloudflare !== null ? (seen === cloudflare ? 'matches_cloudflare_header' : 'differs_from_cloudflare_header') : forwardedFor.length > 0 ? 'proxy_without_cloudflare_header' : 'direct'
  const index = cloudflare === null ? -1 : forwardedFor.lastIndexOf(cloudflare)
  return {
    clientIp: seen,
    socketAddress: safeAddress(request.socket.remoteAddress ?? 'unknown') === '(unreadable)' ? 'unknown' : safeAddress(request.socket.remoteAddress ?? 'unknown'),
    forwardedFor,
    cloudflareConnectingIp: cloudflare,
    trustProxy,
    verdict,
    measuredTrustProxy: index >= 0 ? forwardedFor.length - index : null,
  }
}

export function operationsData(app: AppContext, request: IncomingMessage) {
  const { config, db, clock } = app
  const migrations = migrationStatus(db)
  const snapshots = config.migrationSnapshots.days > 0 && config.databasePath !== ':memory:' ? listSnapshots(config.migrationSnapshots.directory) : []
  const mail = app.notifier.summary()
  const checks = app.emailChecks.last()
  const verification = readVerification(app)
  const states: Record<string, number> = {}
  for (const check of checks?.checks ?? []) states[check.state] = (states[check.state] ?? 0) + 1
  const available = availability(app)
  return {
    backup: backupStatus(db, config, clock, backupRunning()),
    migrations: {
      ...migrations,
      snapshots: { enabled: config.migrationSnapshots.days > 0 && config.databasePath !== ':memory:', retentionDays: config.migrationSnapshots.days, count: snapshots.length, newestAt: snapshots[0]?.modifiedAt ?? null, newestBytes: snapshots[0]?.bytes ?? null },
    },
    disk: diskData(config.databasePath),
    email: {
      provider: config.email.provider,
      enabled: mail.enabled,
      paused: mail.paused,
      fromSet: config.email.from !== null,
      replyToSet: config.email.replyTo !== null,
      notifyToSet: config.email.notifyTo !== null,
      webhookSecretSet: config.email.webhookSecret !== null,
      deliveries: { pending: mail.pending, failed: mail.failed, accepted: mail.accepted, delivered: mail.delivered, bounced: mail.bounced },
      lastFailureAt: mail.lastFailure?.at ?? null,
      // What the checks of the e-mail set-up found the last time they ran (null: not since the server started). States only: the sentences are on the e-mail page.
      checks: checks ? { checkedAt: checks.checkedAt, states, items: checks.checks.map((check) => ({ id: check.id, state: check.state })) } : null,
    },
    assistant: {
      operatorEnabled: config.ai.enabled,
      apiKeySet: config.ai.apiKey !== null,
      model: config.ai.model,
      verification: verificationLabel(app, verification),
      verifiedAt: verification.verifiedAt,
      checkedAt: verification.checkedAt,
      failureReason: verification.status === 'failed' ? verification.reason : null,
      available: available.available,
      unavailableReason: available.available ? null : available.reason,
    },
    network: networkData(request, config.trustProxy),
    deployment: { commit: config.deployment.commit, shortCommit: config.deployment.commit?.slice(0, 12) ?? null, source: config.deployment.source, service: config.deployment.service, environment: config.env, startedAt: new Date(app.stats.startedAt).toISOString() },
  }
}
