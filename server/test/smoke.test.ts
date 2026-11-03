import { afterEach, describe, expect, it } from 'vitest'
import { contact, quote, startServer, type TestServer } from './helpers.ts'

let server: TestServer
afterEach(async () => {
  await server?.close()
})

describe('smoke', () => {
  it('serves health, the catalogue, a contact and a quote request', async () => {
    server = await startServer()
    expect((await server.api('/api/health')).json).toEqual({ data: { status: 'ok' } })
    const ready = await server.api('/api/ready')
    expect(ready.status).toBe(200)

    const services = await server.api('/api/services?lang=en')
    expect(services.status).toBe(200)
    expect(services.json.data.map((s: { slug: string }) => s.slug)).toEqual(['website', 'webapp', 'ui', 'integrations'])

    const sent = await server.api('/api/contact', { body: contact() })
    expect(sent.status).toBe(201)
    expect(sent.json.data.reference).toMatch(/^C-[A-Z0-9]{8}$/)

    const q = await server.api('/api/quote-requests', { body: quote() })
    expect(q.status).toBe(201)
    expect(q.json.data.pricing).toEqual({ fixed: [], quotedParts: 2 })
  })
})
