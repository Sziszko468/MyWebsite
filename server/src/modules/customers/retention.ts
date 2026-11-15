import type { AppContext } from '../../context.ts'

/**
 * What the client portal forgets when the owner erases an e-mail address (`server:cli erase <address>`). It is done by hand, like every other erasure on
 * this site; nothing here runs by age (`RETENTION_DAYS` does not delete accounts: whether and when a customer's account and projects should go is the owner's
 * decision, written down in docs/client-portal/SECURITY.md and the launch checklist).
 *
 * The account takes its sign-ins, its requests for links and their secrets, its record links, and its projects with their milestones, history, private notes
 * and documents with it (cascades). The e-mails written about any of it go too (their recipient is a person's address, or they point at records that are gone).
 * What stays is the account's own history (`customer_audit_events`): a number, a kind of event and a short fixed code, and nothing a person wrote.
 */

function deleteOne(app: AppContext, customerId: string): number {
  const { db } = app
  db.run("DELETE FROM email_deliveries WHERE related_type = 'client_auth' AND related_id IN (SELECT id FROM customer_auth_requests WHERE customer_id = ?)", [customerId])
  db.run("DELETE FROM email_deliveries WHERE related_type = 'client_audit' AND related_id IN (SELECT CAST(id AS TEXT) FROM customer_audit_events WHERE customer_id = ?)", [customerId])
  db.run("DELETE FROM email_deliveries WHERE related_type = 'client_project_event' AND related_id IN (SELECT CAST(e.id AS TEXT) FROM client_project_events e JOIN client_projects p ON p.id = e.project_id WHERE p.customer_id = ?)", [customerId])
  db.run("DELETE FROM email_deliveries WHERE related_type = 'client_document' AND related_id IN (SELECT d.id FROM client_documents d JOIN client_projects p ON p.id = d.project_id WHERE p.customer_id = ?)", [customerId])
  return db.run('DELETE FROM customers WHERE id = ?', [customerId]).changes
}

/** Everything the portal holds about one e-mail address. Call it inside the erasure's transaction. */
export function deleteCustomersByEmail(app: AppContext, email: string): number {
  let removed = 0
  for (const row of app.db.all<{ id: string }>('SELECT id FROM customers WHERE email = ? COLLATE NOCASE', [email])) removed += deleteOne(app, row.id)
  // A registration link nobody has opened yet belongs to no account: it is removed with the address it was sent to.
  app.db.run('DELETE FROM customer_auth_requests WHERE email = ? COLLATE NOCASE AND customer_id IS NULL', [email])
  return removed
}
