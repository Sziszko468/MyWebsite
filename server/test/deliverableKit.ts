import { expect } from 'vitest'
import { makeWorkKit, type WorkKit } from './workKit.ts'

/**
 * What the deliverable tests share (PROMPT 27): a work kit (an administrator and an editor signed in, a customer with a project) whose server allows pictures and frames from
 * `https://previews.example.test`, and short calls for the owner's and the customer's endpoints. Everything goes through the real endpoints; the database is read only to prove what
 * a response was not asked to show.
 */

export const ORIGIN = 'https://previews.example.test'
export const SITE = `${ORIGIN}/site/home`
export const IMAGE = `${ORIGIN}/shots/home.png`

export interface DeliverableKit {
  w: WorkKit
  /** The owner's call. */
  call: WorkKit['call']
  /** The address of a deliverable's endpoints for the owner. */
  admin(suffix?: string, id?: string): string
  /** The address of a deliverable's endpoints for the customer. */
  mine(suffix?: string, reference?: string): string
  /** A deliverable with a draft first version (published when `publish` is true). Returns the ids the tests need. */
  make(body?: Record<string, unknown>, publish?: boolean): Promise<{ id: string; reference: string; versionId: string }>
  /** Publishes a draft version and returns the owner's refreshed view. */
  publish(id: string, versionId: string): Promise<any>
  /** Makes and publishes the next version (copying the last one) and returns its id. */
  next(id: string): Promise<{ versionId: string; number: number }>
  /** The customer's view of a deliverable. */
  view(reference: string, version?: number): Promise<any>
  /** The owner's view. */
  detail(id: string): Promise<any>
  close(): Promise<void>
}

export async function makeDeliverableKit(options: { email?: string; language?: 'hu' | 'en' | 'nl'; env?: Record<string, string> } = {}): Promise<DeliverableKit> {
  const w = await makeWorkKit({ ...options, env: { PREVIEW_ORIGINS: ORIGIN, ...options.env } })
  const admin = (suffix = '', id = '') => w.at(`/deliverables${id ? `/${id}` : ''}${suffix}`)
  const mine = (suffix = '', reference = '') => `/api/portal/projects/${w.project.reference}/deliverables${reference ? `/${reference}` : ''}${suffix}`
  const detail = async (id: string) => (await w.call('GET', admin('', id))).json.data
  const kit: DeliverableKit = {
    w,
    call: w.call,
    admin,
    mine,
    detail,
    async make(body = {}, publish = false) {
      const reply = await w.call('POST', admin(), { title: 'Home page design', type: 'website_preview', customerDescription: 'The standing words of the deliverable.', versionDescription: 'The first look of the home page.', internalDescription: 'INTERNAL-ONLY-DESCRIPTION', previewUrl: SITE, ...body })
      expect(reply.status, reply.text).toBe(201)
      const id = reply.json.data.id as string
      const versionId = (await detail(id)).versions[0].id as string
      if (publish) await kit.publish(id, versionId)
      return { id, reference: reply.json.data.reference as string, versionId }
    },
    async publish(id, versionId) {
      const reply = await w.call('POST', admin(`/versions/${versionId}/publish`, id))
      expect(reply.status, reply.text).toBe(200)
      await w.kit.settle()
      return reply.json.data
    },
    async next(id) {
      const created = await w.call('POST', admin('/versions', id))
      expect(created.status, created.text).toBe(201)
      const draft = created.json.data.versions.find((version: { status: string }) => version.status === 'draft')
      await kit.publish(id, draft.id)
      return { versionId: draft.id as string, number: draft.number as number }
    },
    async view(reference, version) {
      const reply = await w.anna.get(mine(version ? `?version=${version}` : '', reference))
      expect(reply.status, reply.text).toBe(200)
      return reply.json.data
    },
    close: () => w.close(),
  }
  return kit
}
