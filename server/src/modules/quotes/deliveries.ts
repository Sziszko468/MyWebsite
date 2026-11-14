import type { Database } from '../../db/database.ts'

/**
 * Removes every e-mail that is about one quote request: its own, its quotations' and its change requests', and the owner's alerts that any of them
 * could not be delivered (those point at a message, not at the request). Used when a request is deleted or its owner asks to be forgotten; it must run
 * before the request goes, because the quotations and change requests are found through it. Returns how many rows were removed.
 */
export function deleteDeliveriesOfRequest(db: Database, requestId: string): number {
  const where = `(related_type = 'quote_request' AND related_id = ?)
    OR (related_type = 'quote' AND related_id IN (SELECT id FROM quotes WHERE quote_request_id = ?))
    OR (related_type = 'quote_revision' AND related_id IN (SELECT id FROM quote_revision_requests WHERE quote_request_id = ?))`
  const params = [requestId, requestId, requestId]
  const alerts = db.run(`DELETE FROM email_deliveries WHERE related_type = 'email_delivery' AND related_id IN (SELECT id FROM email_deliveries WHERE ${where})`, params).changes
  return alerts + db.run(`DELETE FROM email_deliveries WHERE ${where}`, params).changes
}
