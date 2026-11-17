import { findSensitive } from './sensitive.ts'

/**
 * The last check on what a tool hands back to the model (PROMPT 29). The tools only read published content or the plan of the visitor's own
 * conversation, so nothing here should ever fire; it is the tripwire that makes "the model only sees approved data" true even if a future
 * change to a tool, or a row someone edited by hand, would put something else into a result:
 *
 *  - the result must be plain JSON data, no larger than `TOOL_OUTPUT_MAX_CHARS` (a result is context the visitor pays for in tokens, and a
 *    runaway result is a cost and a prompt-injection surface);
 *  - no object may carry a key that names a secret, a credential, a session, an address hash or an internal note;
 *  - no text may look like a credential.
 *
 * A result that fails any of these is not passed on: the model is told the lookup failed, and the administration counts it as a rejected call.
 */

export const TOOL_OUTPUT_MAX_CHARS = 24_000

/** Key names no tool result may carry, whatever their value. (`note` is not here: the tools use it for their own instructions to the model.) */
const FORBIDDEN_KEY = /^(password|passwd|passwordhash|secret|apikey|api_key|authorization|cookie|csrf|csrftoken|iphash|ip_hash|internalnote|internal_note|privatenote|private_note|adminnote|admin_note|sessionid|session_id|sessiontoken|accesstoken|refreshtoken|customeremail|customer_email|customerid|customer_id)$/i

export type ToolOutputProblem = 'not_serializable' | 'too_large' | 'forbidden_key' | 'credential'

function walk(value: unknown, depth: number): boolean {
  if (depth > 14) return false
  if (Array.isArray(value)) return value.every((item) => walk(item, depth + 1))
  if (typeof value === 'object' && value !== null) return Object.entries(value).every(([key, item]) => !FORBIDDEN_KEY.test(key) && walk(item, depth + 1))
  return true
}

/** Null when the result may be passed on, otherwise why not. */
export function checkToolOutput(output: unknown): ToolOutputProblem | null {
  let json: string
  try {
    json = JSON.stringify(output)
  } catch {
    return 'not_serializable'
  }
  if (typeof json !== 'string') return 'not_serializable'
  if (json.length > TOOL_OUTPUT_MAX_CHARS) return 'too_large'
  if (!walk(output, 0)) return 'forbidden_key'
  if (findSensitive(json) === 'secret') return 'credential'
  return null
}
