import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Ai3dHandler } from './handler.ts'

const MAX_BODY = 4096

/**
 * Lets the web-standard handler run as Node middleware (Vite's dev and preview servers, Express,
 * `http.createServer`). `prefix` is where it is mounted; everything under it is the handler's.
 */
export function nodeMiddleware(handler: Ai3dHandler, prefix: string, trustProxy: boolean) {
  // A long-running server asks the engine about running steps itself, so a finished model is copied even if the tab was closed.
  const ticker = setInterval(() => void handler.tick().catch(() => undefined), 3000)
  ticker.unref?.()
  const middleware = async (req: IncomingMessage, res: ServerResponse, next?: () => void): Promise<void> => {
    const original = req.url ?? '/'
    if (!original.startsWith(prefix) || !(original.length === prefix.length || '/?'.includes(original[prefix.length]))) {
      if (next) return next()
      res.statusCode = 404
      return void res.end()
    }
    const chunks: Buffer[] = []
    let size = 0
    let tooLarge = false
    for await (const chunk of req) {
      size += (chunk as Buffer).length
      if (size > MAX_BODY) {
        tooLarge = true
        break
      }
      chunks.push(chunk as Buffer)
    }
    if (tooLarge) {
      res.statusCode = 413
      return void res.end('{"error":"invalid"}')
    }
    const host = req.headers.host ?? 'localhost'
    const forwarded = trustProxy ? String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() : ''
    const client = forwarded || req.socket.remoteAddress || 'unknown'
    const headers = new Headers()
    for (const [name, value] of Object.entries(req.headers)) if (typeof value === 'string') headers.set(name, value)
    const request = new Request(`http://${host}${original.slice(prefix.length) || '/'}`, {
      method: req.method,
      headers,
      body: req.method === 'GET' || req.method === 'HEAD' || chunks.length === 0 ? undefined : Buffer.concat(chunks),
    })
    const response = await handler.handle(request, client)
    res.statusCode = response.status
    response.headers.forEach((value, name) => res.setHeader(name, value))
    res.end(Buffer.from(await response.arrayBuffer()))
  }
  return Object.assign(middleware, { stop: () => clearInterval(ticker) })
}
