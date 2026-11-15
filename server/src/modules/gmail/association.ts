import type { Database } from '../../db/database.ts'
import { targetExists, targetOf, type AssociationSource, type Target } from './repository.ts'

/**
 * Which request an incoming message belongs to, decided conservatively: a message is tied to a request only when the evidence points
 * at exactly one, and is otherwise left unassigned for a person to place. Nothing is guessed, and nothing is ever created.
 *
 *  1. The conversation: another message of the same Gmail thread that already belongs to a request, or a message this one replies to
 *     (`In-Reply-To` / `References`) that is stored with a request, or that this system itself sent about a request (its `Message-ID`
 *     is the delivery's id). If all of that points at one request, that is the answer; if it points at two, the message stays
 *     unassigned (no falling back to the address: the evidence disagrees).
 *  2. With no such evidence, the sender's address: exactly one inquiry or quote request in the whole database has it. Two or more (the
 *     same person wrote twice, or a quote request came from an inquiry) is ambiguous, and so is none.
 */

export interface Evidence {
  threadId: string
  inReplyTo: string | null
  references: readonly string[]
  senderAddress: string
  direction: 'inbound' | 'outbound'
}

export interface Resolution {
  target: Target | null
  source: Exclude<AssociationSource, 'manual'> | null
  /** Why there is no target: nothing matched, or the evidence disagreed. */
  reason: 'none' | 'ambiguous' | null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const keyOf = (target: Target): string => `${target.type}:${target.id}`

function distinct(targets: Target[]): Target[] {
  const seen = new Map<string, Target>()
  for (const target of targets) seen.set(keyOf(target), target)
  return [...seen.values()]
}

function threadTargets(db: Database, threadId: string): Target[] {
  return db
    .all<{ inquiry_id: string | null; quote_request_id: string | null }>('SELECT DISTINCT inquiry_id, quote_request_id FROM gmail_messages WHERE gmail_thread_id = ? AND (inquiry_id IS NOT NULL OR quote_request_id IS NOT NULL)', [threadId])
    .map(targetOf)
    .filter((target): target is Target => target !== null)
}

/** The request a message that this system sent was about: its `Message-ID` is `<delivery id@domain>`. */
function deliveryTarget(db: Database, messageId: string): Target | null {
  const local = messageId.slice(1, -1).split('@')[0] ?? ''
  if (!UUID.test(local)) return null
  const delivery = db.get<{ related_type: string; related_id: string }>('SELECT related_type, related_id FROM email_deliveries WHERE id = ?', [local])
  if (!delivery) return null
  let target: Target | null = null
  if (delivery.related_type === 'inquiry' || delivery.related_type === 'quote_request') target = { type: delivery.related_type, id: delivery.related_id }
  else if (delivery.related_type === 'quote') {
    const row = db.get<{ quote_request_id: string }>('SELECT quote_request_id FROM quotes WHERE id = ?', [delivery.related_id])
    if (row) target = { type: 'quote_request', id: row.quote_request_id }
  } else if (delivery.related_type === 'quote_revision') {
    const row = db.get<{ quote_request_id: string }>('SELECT quote_request_id FROM quote_revision_requests WHERE id = ?', [delivery.related_id])
    if (row) target = { type: 'quote_request', id: row.quote_request_id }
  }
  // The delivery log may name a request that has since been deleted.
  return target && targetExists(db, target) ? target : null
}

function referenceTargets(db: Database, ids: readonly string[]): Target[] {
  const targets: Target[] = []
  const list = [...new Set(ids)].slice(0, 60)
  for (let i = 0; i < list.length; i += 50) {
    const chunk = list.slice(i, i + 50)
    targets.push(
      ...db
        .all<{ inquiry_id: string | null; quote_request_id: string | null }>(`SELECT DISTINCT inquiry_id, quote_request_id FROM gmail_messages WHERE rfc_message_id IN (${chunk.map(() => '?').join(',')}) AND (inquiry_id IS NOT NULL OR quote_request_id IS NOT NULL)`, chunk)
        .map(targetOf)
        .filter((target): target is Target => target !== null),
    )
  }
  for (const id of list) {
    const sent = deliveryTarget(db, id)
    if (sent) targets.push(sent)
  }
  return targets
}

export function resolveAssociation(db: Database, evidence: Evidence): Resolution {
  const fromThread = threadTargets(db, evidence.threadId)
  const fromReplies = referenceTargets(db, [...(evidence.inReplyTo ? [evidence.inReplyTo] : []), ...evidence.references])
  const conversation = distinct([...fromThread, ...fromReplies])
  if (conversation.length === 1) return { target: conversation[0], source: fromThread.length > 0 ? 'thread' : 'reference', reason: null }
  if (conversation.length > 1) return { target: null, source: null, reason: 'ambiguous' }

  // Only what someone else wrote says anything about who they are: the mailbox's own mail is placed by its conversation alone.
  if (evidence.direction !== 'inbound' || evidence.senderAddress === '') return { target: null, source: null, reason: 'none' }
  const address = evidence.senderAddress.toLowerCase()
  const inquiries = db.all<{ id: string }>('SELECT id FROM inquiries WHERE email = ? LIMIT 2', [address])
  const requests = db.all<{ id: string }>('SELECT id FROM quote_requests WHERE email = ? LIMIT 2', [address])
  const matches: Target[] = [...inquiries.map((row) => ({ type: 'inquiry' as const, id: row.id })), ...requests.map((row) => ({ type: 'quote_request' as const, id: row.id }))]
  if (matches.length === 1) return { target: matches[0], source: 'sender', reason: null }
  return { target: null, source: null, reason: matches.length > 1 ? 'ambiguous' : 'none' }
}
