import { simulateReadableStream } from 'ai'
import { MockLanguageModelV4 } from 'ai/test'
import { AI_MODEL_ID } from '../src/modules/ai/model.ts'

/**
 * A scripted language model for the assistant's tests: the AI SDK's own mock, fed one stream per model call. It stands in for
 * the provider so that everything around the model (the tools, the limits, the budget, the stored conversation, the streamed
 * protocol) is exercised for real, deterministically and for free. What it cannot show is how the REAL model behaves.
 */

export interface Tokens {
  input: number
  output: number
}

const usage = ({ input, output }: Tokens) => ({
  inputTokens: { total: input, noCache: input, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: output, text: output, reasoning: undefined },
})

type Chunk = Record<string, unknown>
export interface Scripted {
  stream: ReadableStream<Chunk>
}

const finish = (reason: 'stop' | 'tool-calls' | 'error', tokens: Tokens): Chunk => ({ type: 'finish', finishReason: { unified: reason, raw: reason === 'stop' ? 'end_turn' : reason }, usage: usage(tokens) })

/**
 * What the provider says about itself at the start of every answer (Anthropic: `message.model` in `message_start`). The
 * assistant checks it against the required model; a test passes another identifier (or `null`: nothing reported) to see what
 * happens when the answer does not come from Claude Haiku 5.5.
 */
export const identity = (reported: string | null = AI_MODEL_ID): Chunk[] => (reported === null ? [] : [{ type: 'response-metadata', id: 'msg_test', modelId: reported }])

export interface CallOptions {
  delayMs?: number
  gate?: Promise<void>
  /** The model the provider claims answered (default: the required one); `null`: the provider reports none. */
  reportedModel?: string | null
}

/** A model call that answers with text. */
export function say(text: string, tokens: Tokens = { input: 400, output: 60 }, options: CallOptions = {}): Scripted {
  const chunks: Chunk[] = [{ type: 'stream-start', warnings: [] }, ...identity(options.reportedModel), { type: 'text-start', id: 't1' }]
  for (const word of text.split(/(?<= )/)) chunks.push({ type: 'text-delta', id: 't1', delta: word })
  chunks.push({ type: 'text-end', id: 't1' }, finish('stop', tokens))
  return scripted(chunks, options)
}

let calls = 0

/** A model call that asks for a tool. */
export function callTool(toolName: string, input: Record<string, unknown>, tokens: Tokens = { input: 500, output: 30 }, options: CallOptions = {}): Scripted {
  calls += 1
  return scripted([{ type: 'stream-start', warnings: [] }, ...identity(options.reportedModel), { type: 'tool-call', toolCallId: `call-${calls}`, toolName, input: JSON.stringify(input) }, finish('tool-calls', tokens)], {})
}

function scripted(chunks: Chunk[], options: CallOptions): Scripted {
  if (options.gate) {
    // Nothing is produced until the test opens the gate: lets a test hold many requests open at once.
    const source = simulateReadableStream({ chunks, initialDelayInMs: 0, chunkDelayInMs: 0 })
    const reader = source.getReader()
    return {
      stream: new ReadableStream<Chunk>({
        async pull(controller) {
          await options.gate
          const next = await reader.read()
          if (next.done) controller.close()
          else controller.enqueue(next.value as Chunk)
        },
      }),
    }
  }
  return { stream: simulateReadableStream({ chunks, initialDelayInMs: options.delayMs ?? 0, chunkDelayInMs: options.delayMs ?? 0 }) as ReadableStream<Chunk> }
}

/** The model: its calls, in order. When the script runs out the model fails loudly, so a test never silently asks for more than it planned. */
export function scriptedModel(script: Scripted[] | ((callNumber: number, options: { prompt: unknown; tools?: unknown }) => Scripted | Promise<Scripted>)) {
  let index = 0
  const model = new MockLanguageModelV4({
    modelId: AI_MODEL_ID,
    provider: 'anthropic.messages',
    doStream: (async (options: { prompt: unknown; tools?: unknown }) => {
      const number = index
      index += 1
      const next = typeof script === 'function' ? await script(number, options) : script[number]
      if (!next) throw new Error(`the scripted model was asked for call ${number + 1}, which the test did not plan`)
      return next
    }) as never,
  })
  return model
}

/** Reads a UI message stream response (server-sent events) into its chunks. */
export function parseSse(text: string): Record<string, unknown>[] {
  return text
    .split('\n\n')
    .map((block) => block.replace(/^data: /, '').trim())
    .filter((block) => block && block !== '[DONE]')
    .map((block) => JSON.parse(block) as Record<string, unknown>)
}

/** The text of the assistant's answer in a parsed stream. */
export const answerText = (chunks: Record<string, unknown>[]): string => chunks.filter((chunk) => chunk.type === 'text-delta').map((chunk) => String(chunk.delta)).join('')
