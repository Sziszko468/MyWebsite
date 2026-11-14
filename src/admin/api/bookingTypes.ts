/** What the administration's booking routes answer (server/src/modules/bookings/admin.ts). */

export type BookingStatus = 'pending' | 'confirmed' | 'reschedule_requested' | 'rescheduled' | 'cancelled' | 'completed' | 'no_show'
export type Lang = 'hu' | 'en' | 'nl'

export interface BookingListItem {
  id: string
  reference: string
  name: string
  email: string
  company: string | null
  typeCode: string
  typeName: string
  startAt: string
  endAt: string
  timeZone: string
  status: BookingStatus
  language: Lang
  createdAt: string
  openChange: 'cancel' | 'reschedule' | null
}

export interface BookingChange {
  id: string
  booking_id: string
  kind: 'cancel' | 'reschedule'
  initiator: 'customer' | 'owner'
  status: 'open' | 'applied' | 'declined' | 'withdrawn' | 'expired'
  new_start_at: string | null
  new_end_at: string | null
  message: string | null
  booking_status_before: BookingStatus
  expires_at: string | null
  created_at: string
  decided_at: string | null
  decided_by: 'customer' | 'owner' | 'system' | null
}

export interface BookingDetail {
  booking: {
    id: string
    reference: string
    consultation_type_id: string
    language: Lang
    name: string
    email: string
    company: string | null
    website: string | null
    description: string | null
    start_at: string
    end_at: string
    time_zone: string
    status: BookingStatus
    related_reference: string | null
    quote_request_id: string | null
    created_at: string
    updated_at: string
    cancelled_by: 'customer' | 'owner' | null
    cancellation_note: string | null
  }
  type: { code: string; durationMinutes: number | null; translations: Record<Lang, { name: string; description: string }> } | null
  changes: BookingChange[]
  openChange: BookingChange | null
  events: { id: number; type: string; actorType: 'customer' | 'admin' | 'system'; actor: string | null; from: BookingStatus | null; to: BookingStatus | null; fromStart: string | null; toStart: string | null; changeId: string | null; summary: string | null; at: string }[]
  notes: { id: string; body: string; created_at: string; author: string | null }[]
  deliveries: { id: string; kind: string; recipient: string; status: string; attempts: number; lastError: string | null; createdAt: string; eventId: number }[]
  quote: { id: string; reference: string; status: string } | null
  activeLinks: number
  next: BookingStatus[]
}

export interface BookingSettings {
  enabled: boolean
  timeZone: string | null
  slotStepMinutes: number
  bufferMinutes: number
  minNoticeHours: number
  horizonDays: number
  confirmation: 'automatic' | 'manual'
  allowCancelRequests: boolean
  allowRescheduleRequests: boolean
  changeMinNoticeHours: number
  approvalRequired: boolean
  ownerChangeNeedsConfirmation: boolean
  proposalValidHours: number
  configuredAt: string | null
}

export type ClosedReason = 'switched_off' | 'not_configured' | 'no_time_zone' | 'no_type' | 'no_hours'

export interface ConsultationType {
  id: string
  code: string
  durationMinutes: number | null
  enabled: boolean
  sortOrder: number
  translations: Record<Lang, { name: string; description: string }>
  complete: boolean
}

export interface WeeklyHour {
  id: string
  type: string | null
  weekday: number
  start: string
  end: string
}

export interface ScheduleException {
  id: string
  kind: 'closed' | 'open'
  startDate: string
  endDate: string
  start: string | null
  end: string | null
  label: string | null
}

export interface BookingConfig {
  settings: BookingSettings
  closedReasons: ClosedReason[]
  types: ConsultationType[]
  hours: WeeklyHour[]
  exceptions: ScheduleException[]
  now: string
}

export interface FreeDay {
  date: string
  status: 'available' | 'full' | 'closed'
  slots: { start: string; end: string; ambiguous: boolean }[]
}
