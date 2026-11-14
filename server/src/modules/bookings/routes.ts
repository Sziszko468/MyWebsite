import { LANGUAGES, type Language } from '../../config.ts'
import type { AppContext } from '../../context.ts'
import { notFound, validationFailed } from '../../http/errors.ts'
import { json } from '../../http/reply.ts'
import type { RouteDef } from '../../http/router.ts'
import { actOnBooking, bookingDetail, configuration, listBookings, proposalDays, saveBookingSettings, saveHours, saveType } from './admin.ts'
import { act, daysForReschedule, parseAction, viewBooking } from './customer.ts'
import { publicConfig } from './public.ts'
import { typeByCode } from './repository.ts'
import { createBooking, parseBooking, parseDate, publicDays } from './service.ts'

/**
 * The booking system's addresses.
 *
 * Public (`/api/consultations/*`): what can be booked, which times are free, making a booking, and the customer's own page behind a secret link.
 * No address takes a reference, an e-mail address or an identifier: a booking is reached only through its secret. Nothing here returns who
 * booked what: a free slot is a start and an end.
 *
 * The administration (`/api/admin/bookings*`, `/api/admin/booking-*`, `/api/admin/consultation-types*`): behind a session and the CSRF token, the
 * permission checked by the business function.
 */

const language = (value: string | null): Language => {
  if (value && (LANGUAGES as readonly string[]).includes(value)) return value as Language
  throw validationFailed({ lang: value ? 'invalid' : 'required' })
}

export function bookingRoutes(_app: AppContext): RouteDef[] {
  const admin = (method: RouteDef['method'], pattern: string, handler: RouteDef['handler']): RouteDef => ({ method, pattern, area: 'admin', auth: true, handler })
  return [
    // ---- public ----
    {
      method: 'GET',
      pattern: '/api/consultations/config',
      area: 'api',
      limit: 'catalog',
      handler: (ctx) => json(publicConfig(ctx.app, language(ctx.query.get('lang')))),
    },
    {
      method: 'GET',
      pattern: '/api/consultations/types/:code/days',
      area: 'api',
      limit: 'catalog',
      handler: (ctx) => {
        const type = typeByCode(ctx.app.db, ctx.params.code)
        if (!type || !type.enabled) throw notFound('The consultation type')
        const from = parseDate(ctx.query.get('from'))
        const to = parseDate(ctx.query.get('to'))
        if (!from || !to) throw validationFailed({ [from ? 'to' : 'from']: 'invalid' })
        return json({ days: publicDays(ctx.app, type, from, to) })
      },
    },
    {
      method: 'POST',
      pattern: '/api/consultations/bookings',
      area: 'api',
      limit: 'booking',
      handler: async (ctx) => {
        const header = ctx.req.headers['idempotency-key']
        const input = parseBooking(await ctx.json(), ctx.app.config.requireConsent, typeof header === 'string' ? header : null)
        const receipt = createBooking(ctx.app, input, ctx.ipHash)
        // No name, address or text in the log: only what kind of thing happened.
        ctx.log.info('booking received', { status: receipt.status, duplicate: receipt.duplicate })
        return json(receipt, { status: receipt.duplicate ? 200 : 201 })
      },
    },
    {
      method: 'GET',
      pattern: '/api/consultations/manage/:token',
      area: 'api',
      limit: 'customer',
      handler: (ctx) => json(viewBooking(ctx.app, ctx.params.token, ctx.ip)),
    },
    {
      method: 'GET',
      pattern: '/api/consultations/manage/:token/days',
      area: 'api',
      limit: 'customer',
      handler: (ctx) => json({ days: daysForReschedule(ctx.app, ctx.params.token, ctx.query, ctx.ip) }),
    },
    {
      method: 'POST',
      pattern: '/api/consultations/manage/:token/actions',
      area: 'api',
      limit: 'customer',
      handler: async (ctx) => {
        const result = act(ctx.app, ctx.params.token, parseAction(await ctx.json()), ctx.ip)
        ctx.log.info('booking action', { outcome: result.outcome })
        return json(result)
      },
    },

    // ---- the administration ----
    admin('GET', '/api/admin/bookings', (ctx) => {
      const data = listBookings(ctx.app, ctx.session, ctx.query)
      return json(data.rows, { meta: { page: data.filters.page, pageSize: data.filters.pageSize, total: data.total } })
    }),
    admin('GET', '/api/admin/bookings/:id', (ctx) => json(bookingDetail(ctx.app, ctx.session, ctx.params.id))),
    admin('GET', '/api/admin/bookings/:id/days', (ctx) => json({ days: proposalDays(ctx.app, ctx.session, ctx.params.id, ctx.query) })),
    admin('POST', '/api/admin/bookings/:id/actions', async (ctx) => json(actOnBooking(ctx.app, ctx.session, ctx.params.id, await ctx.json()))),
    admin('GET', '/api/admin/booking-config', (ctx) => json(configuration(ctx.app, ctx.session))),
    admin('PUT', '/api/admin/booking-settings', async (ctx) => json(saveBookingSettings(ctx.app, ctx.session, await ctx.json()))),
    admin('PUT', '/api/admin/booking-hours', async (ctx) => json(saveHours(ctx.app, ctx.session, await ctx.json()))),
    admin('POST', '/api/admin/consultation-types', async (ctx) => {
      const type = saveType(ctx.app, ctx.session, null, await ctx.json())
      return json(type, { status: 201 })
    }),
    admin('PUT', '/api/admin/consultation-types/:code', async (ctx) => json(saveType(ctx.app, ctx.session, ctx.params.code, await ctx.json()))),
  ]
}

