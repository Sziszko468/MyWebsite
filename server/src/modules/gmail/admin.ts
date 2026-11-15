import type { AppContext, SessionInfo } from '../../context.ts'
import { requirePermission } from '../auth/permissions.ts'
import { audit } from '../system/audit.ts'
import type { GmailCheckedStatus, GmailErrorCategory } from './tokenService.ts'

/**
 * The administration's view of the Gmail connection (connection status only: no mail is read or sent here). Reading it needs
 * `system:read`, running a check needs `system:write` (the check makes a real request to Google); the permission is checked
 * here, in the business function, so no route can forget it.
 *
 * What leaves this file is picked by name, field by field: the mailbox address is the most it says about the set-up, and a
 * field added to the service later cannot travel to the browser by accident.
 */

export interface GmailStatusView {
  configured: boolean
  connected: boolean
  /** The mailbox the integration is set up for. Shown only to someone who may read the system page. */
  accountEmail: string | null
  /** A category from a fixed list (never a message from Google or from the network); the administration words it in its own language. */
  lastError: GmailErrorCategory | null
  /** When the last request to Google finished (ISO 8601, UTC); null when no check has been made since the server started. */
  checkedAt: string | null
}

const view = (status: GmailCheckedStatus): GmailStatusView => ({
  configured: status.configured,
  connected: status.connected,
  accountEmail: status.accountEmail,
  lastError: status.lastError,
  checkedAt: status.checkedAt,
})

/** What is known now. Makes no request to Google, so it is cheap and cannot fail because Google does. */
export function gmailStatus(app: AppContext, session: SessionInfo | null): GmailStatusView {
  requirePermission(session, 'system:read')
  return view(app.gmail.snapshot())
}

/** A real check: asks Google for a new access token, records the outcome and returns it. A failed connection is a result, not an error. */
export async function gmailCheck(app: AppContext, session: SessionInfo | null): Promise<GmailStatusView> {
  const who = requirePermission(session, 'system:write')
  // Each check is a request to Google: a script (or a stuck button) cannot make hundreds of them. Counted per administrator, after the permission.
  app.limiters.check('gmailCheck', who.userId)
  const result = view(await app.gmail.check())
  // Only a check that really asked Google is worth a line in the log of administrator actions; the line says the outcome, nothing more.
  if (result.configured) audit(app, who, result.connected ? 'gmail.check' : 'gmail.check_failed', 'system', null, result.connected ? undefined : { category: result.lastError })
  return result
}
