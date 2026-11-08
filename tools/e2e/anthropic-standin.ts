import { createServer, type IncomingMessage, type Server } from 'node:http'

/**
 * A local stand-in for Anthropic's Messages API (`POST /v1/messages`, streamed), for checking the assistant with the REAL
 * `@ai-sdk/anthropic` provider over real HTTP without an API key and without spending anything. It speaks the documented
 * server-sent-event protocol (message_start, content_block_start/delta/stop, message_delta, message_stop) and is scripted by
 * markers in the last user message:
 *
 *   TOOL:<name>:<json input>   answer with a tool call (then, once the result comes back, a short text)
 *   FAIL:<status>              answer with an HTTP error of that status
 *   SLOW                       write the answer word by word, 150 ms apart
 *   a visitor's "I approved the plan" (in any of the three languages): ask to send the quote request (what a real model would
 *                              do after the visitor presses the button)
 * It also answers GET /__requests with what it has received (the e2e journeys read it) and DELETE /__requests to forget it.
 *   anything else              "Stand-in answer."
 *
 * It records every request it receives, so a test can check what the provider sent (the model, the limits, the tools, the
 * thinking setting, the absence of settings the model rejects). It is NOT the real model and proves nothing about how that
 * behaves; it proves that the integration speaks to the provider's API correctly.
 *
 *   node tools/e2e/anthropic-standin.ts [port]        (Node 22.18+ runs TypeScript directly)
 */

export interface Received {
  headers: IncomingMessage['headers']
  body: Record<string, any>
}

export interface StandIn {
  server: Server
  port: number
  requests: Received[]
  close(): Promise<void>
}

const sse = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function lastUserText(body: Record<string, any>): string {
  const messages = Array.isArray(body.messages) ? body.messages : []
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i]
    if (message.role !== 'user') continue
    const content = typeof message.content === 'string' ? [{ type: 'text', text: message.content }] : message.content
    if (content.some((part: { type: string }) => part.type === 'tool_result')) return '<tool_result>'
    return content.filter((part: { type: string }) => part.type === 'text').map((part: { text: string }) => part.text).join(' ')
  }
  return ''
}

export async function startStandIn(port = 0): Promise<StandIn> {
  const requests: Received[] = []
  const server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', async () => {
      if (req.url === '/__requests') {
        if (req.method === 'DELETE') requests.length = 0
        res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(requests))
        return
      }
      if (req.method !== 'POST' || !req.url?.startsWith('/v1/messages')) {
        res.writeHead(404, { 'Content-Type': 'application/json' }).end(JSON.stringify({ type: 'error', error: { type: 'not_found_error', message: 'not found' } }))
        return
      }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, any>
      requests.push({ headers: req.headers, body })
      const text = lastUserText(body)
      const fail = /FAIL:(\d{3})/.exec(text)
      if (fail) {
        res.writeHead(Number(fail[1]), { 'Content-Type': 'application/json' }).end(JSON.stringify({ type: 'error', error: { type: Number(fail[1]) === 529 ? 'overloaded_error' : 'api_error', message: 'stand-in failure with a secret detail' } }))
        return
      }
      const inputTokens = 120 + requests.length
      if (!body.stream) {
        // The non-streamed form of the same API (used by the operator's `ai check`).
        res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ id: `msg_${requests.length}`, type: 'message', role: 'assistant', model: body.model, content: [{ type: 'text', text: 'Stand-in answer.' }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: inputTokens, output_tokens: 12 } }))
        return
      }
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
      res.write(sse('message_start', { type: 'message_start', message: { id: `msg_${requests.length}`, type: 'message', role: 'assistant', model: body.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: inputTokens, output_tokens: 1 } } }))
      const approved = /approved the plan|jóváhagytam a tervet|goedgekeurd/i.test(text) && text !== '<tool_result>'
      const tool = approved ? [text, 'submitApprovedQuoteRequest', '{}'] : /TOOL:([A-Za-z]+):(\{.*\})/.exec(text)
      if (tool) {
        res.write(sse('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: `toolu_${requests.length}`, name: tool[1], input: {} } }))
        const json = tool[2]
        res.write(sse('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: json.slice(0, Math.ceil(json.length / 2)) } }))
        res.write(sse('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: json.slice(Math.ceil(json.length / 2)) } }))
        res.write(sse('content_block_stop', { type: 'content_block_stop', index: 0 }))
        res.write(sse('message_delta', { type: 'message_delta', delta: { stop_reason: 'tool_use', stop_sequence: null }, usage: { output_tokens: 18 } }))
        res.end(sse('message_stop', { type: 'message_stop' }))
        return
      }
      const words = (text === '<tool_result>' ? 'Tool result received. ' : 'Stand-in answer. ').split(/(?<= )/)
      res.write(sse('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }))
      for (const word of words) {
        res.write(sse('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: word } }))
        if (/SLOW/.test(text)) await wait(150)
      }
      res.write(sse('content_block_stop', { type: 'content_block_stop', index: 0 }))
      res.write(sse('message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 12 } }))
      res.end(sse('message_stop', { type: 'message_stop' }))
    })
  })
  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', () => resolve()))
  const address = server.address()
  const actual = typeof address === 'object' && address ? address.port : port
  return {
    server,
    port: actual,
    requests,
    close: () => new Promise<void>((resolve) => { server.closeAllConnections?.(); server.close(() => resolve()) }),
  }
}

// Run directly: a stand-in that stays up until stopped.
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('anthropic-standin.ts')) {
  const port = Number(process.argv[2] ?? 9911)
  const standIn = await startStandIn(port)
  process.stdout.write(`Anthropic stand-in listening on http://127.0.0.1:${standIn.port}/v1\n`)
}
