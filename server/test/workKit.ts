import { expect } from 'vitest'
import { makePortalKit, type Customer, type PortalKit } from './portalKit.ts'

/**
 * What the project work's tests share (PROMPT 26): a portal kit, a customer with a project, and short calls for the owner's endpoints (an administrator and an
 * editor are signed in, exactly as the portal's tests have them). Everything goes through the real endpoints; the database is read only to check what the endpoints
 * were not asked to show.
 */

export interface Reply {
  status: number
  json: any
  text: string
}

export interface WorkKit {
  kit: PortalKit
  anna: Customer
  project: { id: string; reference: string }
  /** The owner's call (an administrator unless `as` is given). */
  call(method: string, path: string, body?: unknown, as?: 'admin' | 'editor' | 'none'): Promise<Reply>
  /** A task through the administration's endpoint; returns its id and reference. A task is private unless `customerVisible` is true. */
  task(body?: Record<string, unknown>, project?: { id: string }): Promise<{ id: string; reference: string }>
  /** The path of the workspace's endpoints for a project. */
  at(path?: string, project?: { id: string }): string
  close(): Promise<void>
}

export async function makeWorkKit(options: { email?: string; language?: 'hu' | 'en' | 'nl'; env?: Record<string, string> } = {}): Promise<WorkKit> {
  const kit = await makePortalKit({ env: { NOTIFY_TO: 'owner@site.test', ...options.env } })
  const anna = await kit.customer(options.email ?? 'anna@example.com', options.language ? { language: options.language } : {})
  const project = await kit.project(anna.id)
  const heads = { admin: kit.admin, editor: kit.editor, none: {} as Record<string, string> }
  const call: WorkKit['call'] = (method, path, body, as = 'admin') => kit.api(path, { method, body, headers: heads[as] })
  const at = (path = '', target: { id: string } = project) => `/api/admin/client-projects/${target.id}${path}`
  return {
    kit,
    anna,
    project,
    call,
    at,
    async task(body = {}, target = project) {
      const reply = await call('POST', at('/tasks', target), { title: 'Design the home page', ...body })
      expect(reply.status, reply.text).toBe(201)
      return { id: reply.json.data.id as string, reference: reply.json.data.reference as string }
    },
    close: () => kit.close(),
  }
}
