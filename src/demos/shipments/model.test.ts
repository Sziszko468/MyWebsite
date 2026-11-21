import { describe, expect, it } from 'vitest'
import {
  DRIVERS,
  ME,
  NOTE_MAX,
  PAGE_SIZE,
  ROLES,
  SAMPLE_SHIPMENTS,
  STATUSES,
  TRANSITIONS,
  TRUCKS,
  allowedMoves,
  assignmentProblems,
  canAssign,
  checkAssign,
  checkMove,
  countByStatus,
  driverById,
  initialState,
  isOpen,
  isStepBack,
  noteRequired,
  overlaps,
  reduce,
  truckById,
  visibleShipments,
  type Role,
  type Shipment,
  type State,
  type Status,
} from './model'

const fresh = (role: Role = 'dispatcher'): State => reduce(initialState(), { type: 'role', role })
const shipment = (state: State, number: string) => state.shipments.find((candidate) => candidate.number === number)!
const idOf = (number: string) => Number(number.replace('S-', '')) - 1000
const driver = (id: string) => driverById(id)!
const truck = (id: string) => truckById(id)!

describe('Shipment board: the workflow the project documents', () => {
  it('has the six statuses and the moves of docs/shipments.md, final states leading nowhere', () => {
    expect([...STATUSES]).toEqual(['NEW', 'ASSIGNED', 'LOADING', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED'])
    expect(TRANSITIONS).toEqual({
      NEW: ['CANCELLED'],
      ASSIGNED: ['LOADING', 'CANCELLED'],
      LOADING: ['IN_TRANSIT', 'ASSIGNED', 'CANCELLED'],
      IN_TRANSIT: ['DELIVERED', 'LOADING'],
      DELIVERED: [],
      CANCELLED: [],
    })
    expect(isOpen('NEW') && isOpen('IN_TRANSIT')).toBe(true)
    expect(isOpen('DELIVERED') || isOpen('CANCELLED')).toBe(false)
  })

  it('asks for a reason to cancel and to step back, and for nothing else', () => {
    expect(noteRequired('NEW', 'CANCELLED')).toBe(true)
    expect(noteRequired('ASSIGNED', 'CANCELLED')).toBe(true)
    expect(noteRequired('LOADING', 'ASSIGNED')).toBe(true)
    expect(noteRequired('IN_TRANSIT', 'LOADING')).toBe(true)
    expect(isStepBack('LOADING', 'ASSIGNED') && isStepBack('IN_TRANSIT', 'LOADING')).toBe(true)
    expect(noteRequired('ASSIGNED', 'LOADING')).toBe(false)
    expect(noteRequired('LOADING', 'IN_TRANSIT')).toBe(false)
    expect(noteRequired('IN_TRANSIT', 'DELIVERED')).toBe(false)
  })
})

describe('Shipment board: who may make which move', () => {
  const movesOf = (role: Role, number: string) => allowedMoves(role, shipment(fresh(role), number)).map((move) => move.to)

  it('lets administrators and dispatchers make every move the workflow has', () => {
    for (const role of ['administrator', 'dispatcher'] as const) {
      for (const sample of SAMPLE_SHIPMENTS) expect(allowedMoves(role, sample).map((move) => move.to), `${role} ${sample.number}`).toEqual([...TRANSITIONS[sample.status]])
    }
  })

  it('lets a driver move only their own shipment, only forward, and never cancel or step back', () => {
    expect(movesOf('driver', 'S-1003')).toEqual(['DELIVERED'])
    // Not theirs: another driver's loading shipment, an unassigned one, a final one.
    expect(movesOf('driver', 'S-1004')).toEqual([])
    expect(movesOf('driver', 'S-1005')).toEqual([])
    expect(movesOf('driver', 'S-1006')).toEqual([])
    expect(movesOf('driver', 'S-1001')).toEqual([])
    for (const sample of SAMPLE_SHIPMENTS) {
      for (const move of allowedMoves('driver', sample)) {
        expect(move.to, sample.number).not.toBe('CANCELLED')
        expect(move.noteRequired, sample.number).toBe(false)
        expect(sample.driverId).toBe(ME)
      }
    }
  })

  it('lets an accountant make no move at all', () => {
    for (const sample of SAMPLE_SHIPMENTS) expect(allowedMoves('accountant', sample), sample.number).toEqual([])
  })

  it('lets only an administrator or a dispatcher assign', () => {
    expect(ROLES.filter(canAssign)).toEqual(['administrator', 'dispatcher'])
  })
})

describe('Shipment board: making a move', () => {
  it('moves a shipment forward, writes who did it into its history, and leaves the others alone', () => {
    let state = fresh('dispatcher')
    const before = JSON.stringify(state)
    state = reduce(state, { type: 'applyMove', id: idOf('S-1005'), to: 'LOADING', note: '' })
    expect(shipment(state, 'S-1005').status).toBe('LOADING')
    expect(shipment(state, 'S-1005').history.at(-1)).toEqual({ to: 'LOADING', by: 'dispatcher', note: '' })
    expect(shipment(state, 'S-1004')).toEqual(shipment(JSON.parse(before) as State, 'S-1004'))
    expect(JSON.stringify(initialState())).not.toBe(JSON.stringify(state))
  })

  it('refuses a move the role may not make, one the workflow does not have, and one without its reason', () => {
    const state = fresh('driver')
    expect(checkMove(state, idOf('S-1003'), 'DELIVERED', '')).toEqual({ ok: true, note: '' })
    expect(checkMove(state, idOf('S-1003'), 'LOADING', 'because')).toEqual({ ok: false, error: 'forbidden' })
    expect(checkMove(state, idOf('S-1003'), 'CANCELLED', 'because')).toEqual({ ok: false, error: 'impossible' })
    expect(checkMove(state, idOf('S-1004'), 'IN_TRANSIT', '')).toEqual({ ok: false, error: 'forbidden' })
    const dispatcher = fresh('dispatcher')
    expect(checkMove(dispatcher, idOf('S-1006'), 'CANCELLED', '')).toEqual({ ok: false, error: 'noteRequired' })
    expect(checkMove(dispatcher, idOf('S-1006'), 'CANCELLED', '   ')).toEqual({ ok: false, error: 'noteRequired' })
    expect(checkMove(dispatcher, idOf('S-1006'), 'CANCELLED', 'Customer called')).toEqual({ ok: true, note: 'Customer called' })
    expect(checkMove(dispatcher, idOf('S-1006'), 'DELIVERED', '')).toEqual({ ok: false, error: 'impossible' })
    expect(checkMove(dispatcher, 999, 'CANCELLED', 'x')).toEqual({ ok: false, error: 'missing' })
    expect(checkMove(dispatcher, idOf('S-1006'), 'NOPE' as Status, 'x')).toEqual({ ok: false, error: 'invalid' })
    expect(checkMove(fresh('accountant'), idOf('S-1006'), 'CANCELLED', 'x')).toEqual({ ok: false, error: 'forbidden' })
  })

  it('bounds and cleans the reason', () => {
    const state = fresh('dispatcher')
    expect(checkMove(state, idOf('S-1006'), 'CANCELLED', 'x'.repeat(NOTE_MAX + 1))).toEqual({ ok: false, error: 'noteTooLong' })
    expect(checkMove(state, idOf('S-1006'), 'CANCELLED', 'x'.repeat(NOTE_MAX))).toMatchObject({ ok: true })
    expect(checkMove(state, idOf('S-1006'), 'CANCELLED', 'bad\u0000')).toEqual({ ok: false, error: 'invalid' })
    expect(checkMove(state, idOf('S-1006'), 'CANCELLED', '  a   b  ')).toEqual({ ok: true, note: 'a b' })
  })

  it('records the reason of a step back and of a cancellation in the history, and a final shipment stays final', () => {
    let state = fresh('administrator')
    state = reduce(state, { type: 'applyMove', id: idOf('S-1003'), to: 'LOADING', note: 'Wrong trailer' })
    expect(shipment(state, 'S-1003').status).toBe('LOADING')
    expect(shipment(state, 'S-1003').history.at(-1)).toMatchObject({ to: 'LOADING', note: 'Wrong trailer', by: 'administrator' })
    state = reduce(state, { type: 'applyMove', id: idOf('S-1003'), to: 'CANCELLED', note: 'Customer cancelled' })
    expect(shipment(state, 'S-1003').status).toBe('CANCELLED')
    const again = reduce(state, { type: 'applyMove', id: idOf('S-1003'), to: 'LOADING', note: 'x' })
    expect(again).toBe(state)
  })

  it('leaves the state exactly as it was when the rules refuse the action', () => {
    const state = fresh('driver')
    expect(reduce(state, { type: 'applyMove', id: idOf('S-1004'), to: 'IN_TRANSIT', note: '' })).toBe(state)
    expect(reduce(state, { type: 'applyAssign', id: idOf('S-1006'), driverId: 'drv-1', truckId: 'trk-1' })).toBe(state)
  })
})

describe('Shipment board: rule-checked assignment', () => {
  const problems = (number: string, driverId: string | null, truckId: string | null, state = fresh()) =>
    assignmentProblems(shipment(state, number), driverId ? driver(driverId) : null, truckId ? truck(truckId) : null, state.shipments)

  it('accepts a driver and a truck whose papers are valid on the delivery day and who are free', () => {
    expect(problems('S-1006', 'drv-1', 'trk-1')).toEqual([])
    expect(checkAssign(fresh(), idOf('S-1006'), 'drv-1', 'trk-1')).toEqual({ ok: true })
  })

  it('names each paper that has run out by the delivery day', () => {
    expect(problems('S-1006', 'drv-3', null)).toEqual([{ who: 'driver', code: 'licenceExpired' }])
    expect(problems('S-1010', 'drv-2', null)).toEqual([{ who: 'driver', code: 'gkiExpired' }])
    expect(problems('S-1006', 'drv-4', null)).toEqual([{ who: 'driver', code: 'inactive' }])
    expect(problems('S-1006', null, 'trk-2')).toEqual([{ who: 'truck', code: 'inWorkshop' }])
    expect(problems('S-1014', null, 'trk-3')).toEqual([{ who: 'truck', code: 'inspectionExpired' }])
  })

  it('reports every problem at once, for the driver and the truck together', () => {
    const found = problems('S-1013', 'drv-3', 'trk-2')
    expect(found.map((problem) => `${problem.who}:${problem.code}`).sort()).toEqual(['driver:licenceExpired', 'truck:inWorkshop'])
  })

  it('judges papers on the delivery day itself: valid through that day, not after', () => {
    const state = fresh()
    const edge: Shipment = { ...shipment(state, 'S-1006'), delivery: '2026-11-20', pickup: '2026-11-19' }
    expect(assignmentProblems(edge, driver('drv-2'), null, state.shipments)).toEqual([])
    expect(assignmentProblems({ ...edge, delivery: '2026-11-21' }, driver('drv-2'), null, state.shipments)).toEqual([{ who: 'driver', code: 'gkiExpired' }])
  })

  it('treats a shipment that delivers exactly as the next picks up as no overlap, and anything that really overlaps as one', () => {
    expect(overlaps({ pickup: '2026-11-12', delivery: '2026-11-13' }, { pickup: '2026-11-13', delivery: '2026-11-14' })).toBe(false)
    expect(overlaps({ pickup: '2026-11-12', delivery: '2026-11-14' }, { pickup: '2026-11-13', delivery: '2026-11-15' })).toBe(true)
    expect(overlaps({ pickup: '2026-11-12', delivery: '2026-11-20' }, { pickup: '2026-11-14', delivery: '2026-11-16' })).toBe(true)
    // S-1005 (drv-2, trk-3) delivers on the 13th, S-1006 picks up on the 13th: drv-1 and trk-1 are free anyway, and the pair that is shared is accepted.
    expect(problems('S-1006', 'drv-2', null)).toEqual([])
  })

  it('refuses a driver or a truck that is on another open shipment in an overlapping period, naming it, and ignores delivered and cancelled ones', () => {
    let state = fresh()
    state = reduce(state, { type: 'applyAssign', id: idOf('S-1009'), driverId: 'drv-1', truckId: 'trk-1' })
    expect(shipment(state, 'S-1009').status).toBe('ASSIGNED')
    // S-1012 (19th to 20th) overlaps S-1009 (18th to 20th).
    expect(problems('S-1012', 'drv-1', null, state)).toEqual([{ who: 'driver', code: 'overlap', with: 'S-1009' }])
    expect(problems('S-1012', null, 'trk-1', state)).toEqual([{ who: 'truck', code: 'overlap', with: 'S-1009' }])
    const refused = checkAssign(state, idOf('S-1012'), 'drv-1', 'trk-1')
    expect(refused).toMatchObject({ ok: false, error: 'rules' })
    // Once S-1009 is delivered (or cancelled) it no longer blocks.
    const done: State = { ...state, shipments: state.shipments.map((s) => (s.number === 'S-1009' ? { ...s, status: 'CANCELLED' as Status } : s)) }
    expect(problems('S-1012', 'drv-1', 'trk-1', done)).toEqual([])
  })

  it('makes a shipment ASSIGNED exactly while it has both a driver and a truck', () => {
    let state = fresh()
    state = reduce(state, { type: 'applyAssign', id: idOf('S-1006'), driverId: 'drv-1', truckId: null })
    expect(shipment(state, 'S-1006')).toMatchObject({ status: 'NEW', driverId: 'drv-1', truckId: null })
    state = reduce(state, { type: 'applyAssign', id: idOf('S-1006'), driverId: null, truckId: 'trk-1' })
    expect(shipment(state, 'S-1006')).toMatchObject({ status: 'ASSIGNED', driverId: 'drv-1', truckId: 'trk-1' })
    expect(shipment(state, 'S-1006').history.at(-1)).toMatchObject({ to: 'ASSIGNED', by: 'dispatcher' })
    state = reduce(state, { type: 'applyUnassign', id: idOf('S-1006'), which: 'truck' })
    expect(shipment(state, 'S-1006')).toMatchObject({ status: 'NEW', driverId: 'drv-1', truckId: null })
    expect(shipment(state, 'S-1006').history.at(-1)).toMatchObject({ to: 'NEW' })
  })

  it('refuses to assign when the role may not, when the shipment is past assigning, when nothing is chosen, or when the resource does not exist', () => {
    expect(checkAssign(fresh('driver'), idOf('S-1006'), 'drv-1', 'trk-1')).toEqual({ ok: false, error: 'forbidden' })
    expect(checkAssign(fresh('accountant'), idOf('S-1006'), 'drv-1', 'trk-1')).toEqual({ ok: false, error: 'forbidden' })
    expect(checkAssign(fresh(), idOf('S-1004'), 'drv-1', 'trk-1')).toEqual({ ok: false, error: 'locked' })
    expect(checkAssign(fresh(), idOf('S-1001'), 'drv-1', 'trk-1')).toEqual({ ok: false, error: 'locked' })
    expect(checkAssign(fresh(), idOf('S-1006'), null, null)).toEqual({ ok: false, error: 'nothing' })
    expect(checkAssign(fresh(), idOf('S-1006'), 'drv-99', null)).toEqual({ ok: false, error: 'unknownResource' })
    expect(checkAssign(fresh(), idOf('S-1006'), 'constructor', null)).toEqual({ ok: false, error: 'unknownResource' })
    expect(checkAssign(fresh(), 999, 'drv-1', 'trk-1')).toEqual({ ok: false, error: 'missing' })
  })

  it('refuses to unassign what the role may not touch, and what is already on the road', () => {
    const state = fresh('driver')
    expect(reduce(state, { type: 'applyUnassign', id: idOf('S-1005'), which: 'driver' })).toBe(state)
    const onRoad = fresh('dispatcher')
    expect(reduce(onRoad, { type: 'applyUnassign', id: idOf('S-1003'), which: 'truck' })).toBe(onRoad)
  })
})

describe('Shipment board: the sample', () => {
  it('is fourteen invented shipments whose statuses agree with the rules', () => {
    expect(SAMPLE_SHIPMENTS).toHaveLength(14)
    expect(new Set(SAMPLE_SHIPMENTS.map((s) => s.number)).size).toBe(14)
    for (const sample of SAMPLE_SHIPMENTS) {
      expect(sample.pickup <= sample.delivery, sample.number).toBe(true)
      const both = sample.driverId !== null && sample.truckId !== null
      if (['ASSIGNED', 'LOADING', 'IN_TRANSIT', 'DELIVERED'].includes(sample.status)) expect(both, `${sample.number} ${sample.status}`).toBe(true)
      if (sample.status === 'NEW') expect(sample.driverId === null && sample.truckId === null, sample.number).toBe(true)
      if (sample.driverId) expect(driverById(sample.driverId), sample.number).not.toBeNull()
      if (sample.truckId) expect(truckById(sample.truckId), sample.number).not.toBeNull()
    }
  })

  it('has at least one driver and one truck that each rule refuses, so each refusal can be seen', () => {
    expect(DRIVERS.some((d) => !d.active)).toBe(true)
    expect(DRIVERS.some((d) => d.licenceUntil < '2026-11-01')).toBe(true)
    expect(TRUCKS.some((t) => t.inWorkshop)).toBe(true)
    expect(countByStatus(SAMPLE_SHIPMENTS)).toEqual({ NEW: 8, ASSIGNED: 1, LOADING: 1, IN_TRANSIT: 1, DELIVERED: 2, CANCELLED: 1 })
  })

  it('has open shipments that do not overlap on a shared driver or truck, so the sample itself obeys the rule', () => {
    const state = initialState()
    for (const sample of state.shipments.filter((s) => isOpen(s.status) && s.driverId && s.truckId)) {
      expect(assignmentProblems(sample, driverById(sample.driverId), truckById(sample.truckId), state.shipments).filter((p) => p.code === 'overlap'), sample.number).toEqual([])
    }
  })
})

describe('Shipment board: the list and the state', () => {
  it('filters by status and by a search word, sorts, and pages', () => {
    let state = fresh()
    expect(visibleShipments(state)).toMatchObject({ total: 14, page: 1, pages: Math.ceil(14 / PAGE_SIZE) })
    expect(visibleShipments(state).rows).toHaveLength(PAGE_SIZE)
    state = reduce(state, { type: 'status', status: 'NEW' })
    expect(visibleShipments(state).total).toBe(8)
    expect(visibleShipments(reduce(state, { type: 'status', status: 'CANCELLED' })).rows.map((s) => s.number)).toEqual(['S-1011'])
    state = reduce(fresh(), { type: 'search', text: 'rotterdam' })
    expect(visibleShipments(state).rows.map((s) => s.number)).toEqual(['S-1001', 'S-1008'])
    expect(visibleShipments(reduce(fresh(), { type: 'search', text: 'ALDER' })).rows).toHaveLength(1)
    expect(visibleShipments(reduce(fresh(), { type: 'search', text: 'zzz' })).total).toBe(0)
    const byCustomer = visibleShipments({ ...fresh(), sort: { key: 'customer', direction: 'asc' }, page: 1 }).rows.map((s) => s.customer.toLowerCase())
    expect(byCustomer).toEqual([...byCustomer].sort())
    const byPickupDesc = visibleShipments({ ...fresh(), sort: { key: 'pickup', direction: 'desc' } }).rows.map((s) => s.pickup)
    expect(byPickupDesc).toEqual([...byPickupDesc].sort().reverse())
    expect(visibleShipments({ ...fresh(), page: 99 }).page).toBe(3)
  })

  it('changes the role, the selection and the page only as asked, and ignores what is not a role or a shipment', () => {
    let state = fresh()
    expect(reduce(state, { type: 'role', role: 'hacker' as Role })).toBe(state)
    state = reduce(state, { type: 'select', id: 3 })
    expect(state.selectedId).toBe(3)
    expect(reduce(state, { type: 'select', id: 999 }).selectedId).toBeNull()
    expect(reduce(state, { type: 'select', id: null }).selectedId).toBeNull()
    expect(reduce(state, { type: 'page', page: Number.NaN }).page).toBe(1)
    expect(reduce(state, { type: 'search', text: 'x'.repeat(500) }).search).toHaveLength(60)
  })

  it('shares nothing between two demos, never changes the state it was given, and a restart is a fresh start', () => {
    const a = initialState()
    const b = initialState()
    const frozen = JSON.stringify(a)
    const moved = reduce(a, { type: 'applyMove', id: idOf('S-1005'), to: 'LOADING', note: '' })
    expect(JSON.stringify(a)).toBe(frozen)
    expect(shipment(b, 'S-1005').status).toBe('ASSIGNED')
    expect(shipment(moved, 'S-1005').status).toBe('LOADING')
    moved.shipments[0].history.push({ to: 'NEW', by: 'system', note: 'tampered' })
    expect(SAMPLE_SHIPMENTS[0].history).toHaveLength(1)
    // A restart builds the sample again from the untouched original.
    expect(JSON.stringify(initialState())).toBe(frozen)
  })
})
