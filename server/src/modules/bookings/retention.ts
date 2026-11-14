import type { AppContext } from '../../context.ts'

/**
 * What the booking system forgets, on the same terms as the rest of the site (`RETENTION_DAYS`, and an erasure request for one e-mail address).
 * A booking takes its notes, changes and secure links with it (cascades) and the e-mails written about it (their recipient is a person's address);
 * the history keeps one line per event, with a reference, a status and a time and nothing a person wrote.
 */

function deleteOne(app: AppContext, bookingId: string): number {
  const { db } = app
  db.run("DELETE FROM email_deliveries WHERE related_type = 'booking_event' AND related_id IN (SELECT CAST(id AS TEXT) FROM booking_events WHERE booking_id = ?)", [bookingId])
  return db.run('DELETE FROM bookings WHERE id = ?', [bookingId]).changes
}

/** Everything the site holds about one e-mail address, in bookings. Call it inside the erasure's transaction. */
export function deleteBookingsByEmail(app: AppContext, email: string): number {
  let removed = 0
  for (const row of app.db.all<{ id: string }>('SELECT id FROM bookings WHERE email = ? COLLATE NOCASE', [email])) removed += deleteOne(app, row.id)
  return removed
}

/** Bookings that are over (cancelled, completed or a no show) and last changed before the cut-off. A booking that is still alive is never removed by age. */
export function purgeFinishedBookings(app: AppContext, cutoffIso: string): number {
  let removed = 0
  for (const row of app.db.all<{ id: string }>("SELECT id FROM bookings WHERE updated_at < ? AND status IN ('cancelled', 'completed', 'no_show')", [cutoffIso])) removed += deleteOne(app, row.id)
  return removed
}
