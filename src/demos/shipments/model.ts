import { SAMPLE_CUSTOMERS } from '../../content/demos/shipments'

/**
 * The shipment board's model: plain functions over invented data. It reproduces rules the Logistics Platform's own documentation (docs/shipments.md) states:
 *
 *   - the status workflow NEW → ASSIGNED → LOADING → IN_TRANSIT → DELIVERED (or CANCELLED), final states leading nowhere, and "a reason" required to cancel or step back;
 *   - who may make which move: administrators and dispatchers every move, a driver only forward and only on their own shipment, an accountant none;
 *   - NEW and ASSIGNED are not entered by a status change but by assigning: both a driver and a truck make a shipment ASSIGNED, and taking either away moves it back;
 *   - rule-checked assignment: a driver must be active with a licence, GKI and medical certificate valid on the delivery day, a truck must not be in the workshop and
 *     its insurance and inspection must cover the delivery day, and none may be on another open shipment in an overlapping period (one delivering exactly as the next
 *     picks up does not overlap; delivered and cancelled shipments never block).
 *
 * It leaves out the trailer, the map route, documents, money and the live updates. All names, companies, plates and dates are invented.
 */

export const STATUSES = ['NEW', 'ASSIGNED', 'LOADING', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED'] as const
export type Status = (typeof STATUSES)[number]

export const ROLES = ['administrator', 'dispatcher', 'driver', 'accountant'] as const
export type Role = (typeof ROLES)[number]

/** The driver the "driver" role acts as: a driver only moves their own shipment. */
export const ME = 'drv-1'

/** The keys of what the sample shipments carry and of the one sample reason (content/demos/shipments.ts): the model holds the key, the page's language gives the words. */
export type CargoKey = 'dairy' | 'timber' | 'furniture' | 'glass' | 'dryGoods' | 'steel' | 'apples' | 'paper' | 'tools' | 'spices' | 'bikes' | 'cheese' | 'emptyPallets' | 'cabinets'
export type SampleNoteKey = 'withdrawn'

/** From → to, as the project documents it. NEW and ASSIGNED are entered by assigning, not by a move (except stepping back from LOADING to ASSIGNED). */
export const TRANSITIONS: Readonly<Record<Status, readonly Status[]>> = {
  NEW: ['CANCELLED'],
  ASSIGNED: ['LOADING', 'CANCELLED'],
  LOADING: ['IN_TRANSIT', 'ASSIGNED', 'CANCELLED'],
  IN_TRANSIT: ['DELIVERED', 'LOADING'],
  DELIVERED: [],
  CANCELLED: [],
}

const FORWARD: ReadonlyArray<readonly [Status, Status]> = [
  ['ASSIGNED', 'LOADING'],
  ['LOADING', 'IN_TRANSIT'],
  ['IN_TRANSIT', 'DELIVERED'],
]

export const NOTE_MAX = 200
export const PAGE_SIZE = 6
export const isOpen = (status: Status): boolean => status !== 'DELIVERED' && status !== 'CANCELLED'

export interface Driver {
  id: string
  name: string
  active: boolean
  /** The last day each paper is valid, `YYYY-MM-DD`. */
  licenceUntil: string
  gkiUntil: string
  medicalUntil: string
}

export interface Truck {
  id: string
  plate: string
  inWorkshop: boolean
  insuranceUntil: string
  inspectionUntil: string
}

export interface HistoryEntry {
  to: Status
  /** Who made the move. `system` is the sample data's own starting point. */
  by: Role | 'system'
  /** What the visitor wrote as the reason, or `''`. */
  note: string
  /** The sample's own reason, as a key to its words. */
  sampleNote?: SampleNoteKey
}

export interface Shipment {
  id: number
  number: string
  customer: string
  from: string
  to: string
  pickup: string
  delivery: string
  cargo: CargoKey
  /** How many (pallets, tonnes, units: the cargo's own words say which). */
  amount: number
  status: Status
  driverId: string | null
  truckId: string | null
  history: HistoryEntry[]
}

export const DRIVERS: readonly Driver[] = [
  { id: 'drv-1', name: 'Alex Rowan', active: true, licenceUntil: '2028-03-01', gkiUntil: '2027-06-30', medicalUntil: '2027-02-15' },
  { id: 'drv-2', name: 'Mira Kessel', active: true, licenceUntil: '2028-01-31', gkiUntil: '2026-11-20', medicalUntil: '2027-06-30' },
  { id: 'drv-3', name: 'Tomas Veld', active: true, licenceUntil: '2026-10-01', gkiUntil: '2027-09-10', medicalUntil: '2027-04-05' },
  { id: 'drv-4', name: 'Nina Okoro', active: false, licenceUntil: '2028-05-20', gkiUntil: '2027-08-01', medicalUntil: '2027-03-12' },
  { id: 'drv-5', name: 'Jonas Pell', active: true, licenceUntil: '2028-07-11', gkiUntil: '2027-12-12', medicalUntil: '2027-10-30' },
]

export const TRUCKS: readonly Truck[] = [
  { id: 'trk-1', plate: 'NX-4101', inWorkshop: false, insuranceUntil: '2027-03-01', inspectionUntil: '2027-01-15' },
  { id: 'trk-2', plate: 'NX-4102', inWorkshop: true, insuranceUntil: '2027-04-18', inspectionUntil: '2027-02-02' },
  { id: 'trk-3', plate: 'NX-4103', inWorkshop: false, insuranceUntil: '2027-05-09', inspectionUntil: '2026-11-25' },
  { id: 'trk-4', plate: 'NX-4104', inWorkshop: false, insuranceUntil: '2027-06-21', inspectionUntil: '2027-04-30' },
]

const make = (
  id: number,
  from: string,
  to: string,
  pickup: string,
  delivery: string,
  cargo: CargoKey,
  amount: number,
  status: Status,
  driverId: string | null,
  truckId: string | null,
  sampleNote?: SampleNoteKey,
): Shipment => ({
  id,
  number: `S-${1000 + id}`,
  customer: SAMPLE_CUSTOMERS[id - 1],
  from,
  to,
  pickup,
  delivery,
  cargo,
  amount,
  status,
  driverId,
  truckId,
  history: [{ to: status, by: 'system', note: '', ...(sampleNote ? { sampleNote } : {}) }],
})

/** Invented shipments for invented customers. Their statuses and assignments are consistent with the rules above. */
export const SAMPLE_SHIPMENTS: readonly Shipment[] = [
  make(1, 'Rotterdam', 'Gdańsk', '2026-11-02', '2026-11-04', 'dairy', 18, 'DELIVERED', 'drv-1', 'trk-1'),
  make(2, 'Győr', 'Vienna', '2026-11-03', '2026-11-04', 'timber', 22, 'DELIVERED', 'drv-5', 'trk-4'),
  make(3, 'Antwerp', 'Lyon', '2026-11-09', '2026-11-11', 'furniture', 14, 'IN_TRANSIT', 'drv-1', 'trk-1'),
  make(4, 'Plzeň', 'Munich', '2026-11-10', '2026-11-11', 'glass', 9, 'LOADING', 'drv-5', 'trk-4'),
  make(5, 'Budapest', 'Zagreb', '2026-11-12', '2026-11-13', 'dryGoods', 20, 'ASSIGNED', 'drv-2', 'trk-3'),
  make(6, 'Katowice', 'Brno', '2026-11-13', '2026-11-14', 'steel', 24, 'NEW', null, null),
  make(7, 'Breda', 'Hamburg', '2026-11-16', '2026-11-17', 'apples', 26, 'NEW', null, null),
  make(8, 'Rotterdam', 'Paris', '2026-11-17', '2026-11-19', 'paper', 21, 'NEW', null, null),
  make(9, 'Debrecen', 'Bratislava', '2026-11-18', '2026-11-20', 'tools', 12, 'NEW', null, null),
  make(10, 'Szeged', 'Belgrade', '2026-11-23', '2026-11-25', 'spices', 8, 'NEW', null, null),
  make(11, 'Utrecht', 'Cologne', '2026-11-05', '2026-11-06', 'bikes', 40, 'CANCELLED', null, null, 'withdrawn'),
  make(12, 'Eindhoven', 'Brussels', '2026-11-19', '2026-11-20', 'cheese', 16, 'NEW', null, null),
  make(13, 'Liège', 'Dortmund', '2026-11-24', '2026-11-25', 'emptyPallets', 60, 'NEW', null, null),
  make(14, 'Gdańsk', 'Poznań', '2026-11-25', '2026-11-26', 'cabinets', 11, 'NEW', null, null),
]

export const driverById = (id: string | null): Driver | null => DRIVERS.find((driver) => driver.id === id) ?? null
export const truckById = (id: string | null): Truck | null => TRUCKS.find((truck) => truck.id === id) ?? null

// ── Who may move what ───────────────────────────────────────────────────────

export const isStepBack = (from: Status, to: Status): boolean => (from === 'LOADING' && to === 'ASSIGNED') || (from === 'IN_TRANSIT' && to === 'LOADING')
export const noteRequired = (from: Status, to: Status): boolean => to === 'CANCELLED' || isStepBack(from, to)

export interface Move {
  to: Status
  noteRequired: boolean
}

/** The moves a role may make on a shipment right now: what the workflow allows, narrowed by the role. */
export function allowedMoves(role: Role, shipment: Shipment): Move[] {
  if (role === 'accountant') return []
  const options = TRANSITIONS[shipment.status]
  const permitted =
    role === 'driver'
      ? shipment.driverId === ME
        ? options.filter((to) => FORWARD.some(([a, b]) => a === shipment.status && b === to))
        : []
      : options
  return permitted.map((to) => ({ to, noteRequired: noteRequired(shipment.status, to) }))
}

export const canAssign = (role: Role): boolean => role === 'administrator' || role === 'dispatcher'

// ── Papers and overlaps ─────────────────────────────────────────────────────

export type Problem =
  | { who: 'driver'; code: 'inactive' | 'licenceExpired' | 'gkiExpired' | 'medicalExpired' | 'overlap'; with?: string }
  | { who: 'truck'; code: 'inWorkshop' | 'insuranceExpired' | 'inspectionExpired' | 'overlap'; with?: string }

/** Two stretches overlap when each starts before the other ends: one delivering exactly as the next picks up does not. */
export const overlaps = (a: Pick<Shipment, 'pickup' | 'delivery'>, b: Pick<Shipment, 'pickup' | 'delivery'>): boolean => a.pickup < b.delivery && b.pickup < a.delivery

/** Everything that stops this driver and truck taking this shipment, each named. Empty when they can. Either may be absent (null). */
export function assignmentProblems(shipment: Shipment, driver: Driver | null, truck: Truck | null, all: readonly Shipment[]): Problem[] {
  const out: Problem[] = []
  const day = shipment.delivery
  const others = all.filter((other) => other.id !== shipment.id && isOpen(other.status))
  if (driver) {
    if (!driver.active) out.push({ who: 'driver', code: 'inactive' })
    if (driver.licenceUntil < day) out.push({ who: 'driver', code: 'licenceExpired' })
    if (driver.gkiUntil < day) out.push({ who: 'driver', code: 'gkiExpired' })
    if (driver.medicalUntil < day) out.push({ who: 'driver', code: 'medicalExpired' })
    const clash = others.find((other) => other.driverId === driver.id && overlaps(shipment, other))
    if (clash) out.push({ who: 'driver', code: 'overlap', with: clash.number })
  }
  if (truck) {
    if (truck.inWorkshop) out.push({ who: 'truck', code: 'inWorkshop' })
    if (truck.insuranceUntil < day) out.push({ who: 'truck', code: 'insuranceExpired' })
    if (truck.inspectionUntil < day) out.push({ who: 'truck', code: 'inspectionExpired' })
    const clash = others.find((other) => other.truckId === truck.id && overlaps(shipment, other))
    if (clash) out.push({ who: 'truck', code: 'overlap', with: clash.number })
  }
  return out
}

// ── The demo's state and its only ways to change ────────────────────────────

export interface State {
  shipments: Shipment[]
  role: Role
  selectedId: number | null
  statusFilter: 'all' | Status
  search: string
  sort: { key: 'number' | 'customer' | 'pickup'; direction: 'asc' | 'desc' }
  page: number
}

export const initialState = (): State => ({
  shipments: SAMPLE_SHIPMENTS.map((shipment) => ({ ...shipment, history: shipment.history.map((entry) => ({ ...entry })) })),
  role: 'dispatcher',
  selectedId: null,
  statusFilter: 'all',
  search: '',
  sort: { key: 'number', direction: 'asc' },
  page: 1,
})

export type MoveError = 'missing' | 'forbidden' | 'impossible' | 'noteRequired' | 'noteTooLong' | 'invalid'
export type AssignError = 'missing' | 'forbidden' | 'locked' | 'nothing' | 'unknownResource' | 'rules'

export type Action =
  | { type: 'role'; role: Role }
  | { type: 'select'; id: number | null }
  | { type: 'status'; status: 'all' | Status }
  | { type: 'search'; text: string }
  | { type: 'sort'; key: State['sort']['key'] }
  | { type: 'page'; page: number }
  | { type: 'applyMove'; id: number; to: Status; note: string }
  | { type: 'applyAssign'; id: number; driverId: string | null; truckId: string | null }
  | { type: 'applyUnassign'; id: number; which: 'driver' | 'truck' }

// Refusing control characters in typed text is the point of this expression.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/

/** Checks a move without making it: the same answer the reducer will act on. */
export function checkMove(state: Pick<State, 'shipments' | 'role'>, id: number, to: Status, note: string): { ok: true; note: string } | { ok: false; error: MoveError } {
  const shipment = state.shipments.find((candidate) => candidate.id === id)
  if (!shipment) return { ok: false, error: 'missing' }
  if (!(STATUSES as readonly string[]).includes(to)) return { ok: false, error: 'invalid' }
  if (!TRANSITIONS[shipment.status].includes(to)) return { ok: false, error: 'impossible' }
  const move = allowedMoves(state.role, shipment).find((candidate) => candidate.to === to)
  if (!move) return { ok: false, error: 'forbidden' }
  const text = note.replace(/\s+/g, ' ').trim()
  if (CONTROL.test(text)) return { ok: false, error: 'invalid' }
  if ([...text].length > NOTE_MAX) return { ok: false, error: 'noteTooLong' }
  if (move.noteRequired && text === '') return { ok: false, error: 'noteRequired' }
  return { ok: true, note: text }
}

/** Checks an assignment without making it. `problems` is the rule-by-rule account a refusal carries. */
export function checkAssign(
  state: Pick<State, 'shipments' | 'role'>,
  id: number,
  driverId: string | null,
  truckId: string | null,
): { ok: true } | { ok: false; error: AssignError; problems?: Problem[] } {
  const shipment = state.shipments.find((candidate) => candidate.id === id)
  if (!shipment) return { ok: false, error: 'missing' }
  if (!canAssign(state.role)) return { ok: false, error: 'forbidden' }
  if (shipment.status !== 'NEW' && shipment.status !== 'ASSIGNED') return { ok: false, error: 'locked' }
  if (driverId === null && truckId === null) return { ok: false, error: 'nothing' }
  const driver = driverId === null ? null : driverById(driverId)
  const truck = truckId === null ? null : truckById(truckId)
  if ((driverId !== null && !driver) || (truckId !== null && !truck)) return { ok: false, error: 'unknownResource' }
  const problems = assignmentProblems(shipment, driver, truck, state.shipments)
  if (problems.length > 0) return { ok: false, error: 'rules', problems }
  return { ok: true }
}

const update = (state: State, id: number, change: (shipment: Shipment) => Shipment): State => ({ ...state, shipments: state.shipments.map((shipment) => (shipment.id === id ? change(shipment) : shipment)) })

/** Pure. An action that the rules refuse leaves the state exactly as it was; the caller asks `checkMove` / `checkAssign` first to say why. */
export function reduce(state: State, action: Action): State {
  switch (action.type) {
    case 'role':
      return (ROLES as readonly string[]).includes(action.role) ? { ...state, role: action.role } : state
    case 'select':
      return { ...state, selectedId: action.id !== null && state.shipments.some((shipment) => shipment.id === action.id) ? action.id : null }
    case 'status':
      return { ...state, statusFilter: action.status, page: 1 }
    case 'search':
      return { ...state, search: action.text.slice(0, 60), page: 1 }
    case 'sort':
      return { ...state, sort: state.sort.key === action.key ? { key: action.key, direction: state.sort.direction === 'asc' ? 'desc' : 'asc' } : { key: action.key, direction: 'asc' }, page: 1 }
    case 'page':
      return { ...state, page: Math.max(1, Math.trunc(action.page) || 1) }
    case 'applyMove': {
      const checked = checkMove(state, action.id, action.to, action.note)
      if (!checked.ok) return state
      return update(state, action.id, (shipment) => ({ ...shipment, status: action.to, history: [...shipment.history, { to: action.to, by: state.role, note: checked.note }] }))
    }
    case 'applyAssign': {
      const checked = checkAssign(state, action.id, action.driverId, action.truckId)
      if (!checked.ok) return state
      return update(state, action.id, (shipment) => {
        const driverId = action.driverId ?? shipment.driverId
        const truckId = action.truckId ?? shipment.truckId
        const status: Status = driverId && truckId ? 'ASSIGNED' : shipment.status
        const history = status !== shipment.status ? [...shipment.history, { to: status, by: state.role, note: '' }] : shipment.history
        return { ...shipment, driverId, truckId, status, history }
      })
    }
    case 'applyUnassign': {
      const shipment = state.shipments.find((candidate) => candidate.id === action.id)
      if (!shipment || !canAssign(state.role) || (shipment.status !== 'NEW' && shipment.status !== 'ASSIGNED')) return state
      return update(state, action.id, (current) => {
        const driverId = action.which === 'driver' ? null : current.driverId
        const truckId = action.which === 'truck' ? null : current.truckId
        // A shipment is ASSIGNED exactly while it has both a driver and a truck.
        const status: Status = current.status === 'ASSIGNED' && !(driverId && truckId) ? 'NEW' : current.status
        const history = status !== current.status ? [...current.history, { to: status, by: state.role, note: '' }] : current.history
        return { ...current, driverId, truckId, status, history }
      })
    }
  }
}

// ── The list ────────────────────────────────────────────────────────────────

export function visibleShipments(state: State): { rows: Shipment[]; total: number; page: number; pages: number } {
  const needle = state.search.trim().toLowerCase()
  const filtered = state.shipments.filter(
    (shipment) =>
      (state.statusFilter === 'all' || shipment.status === state.statusFilter) &&
      (needle === '' || [shipment.number, shipment.customer, shipment.from, shipment.to].some((text) => text.toLowerCase().includes(needle))),
  )
  const sign = state.sort.direction === 'asc' ? 1 : -1
  const key = state.sort.key
  const sorted = [...filtered].sort((a, b) => {
    const x = key === 'number' ? a.id : key === 'customer' ? a.customer.toLowerCase() : a.pickup
    const y = key === 'number' ? b.id : key === 'customer' ? b.customer.toLowerCase() : b.pickup
    return sign * (x < y ? -1 : x > y ? 1 : 0) || a.id - b.id
  })
  const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const page = Math.min(Math.max(1, state.page), pages)
  return { rows: sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), total: sorted.length, page, pages }
}

export const countByStatus = (shipments: readonly Shipment[]): Record<Status, number> => {
  const counts = Object.fromEntries(STATUSES.map((status) => [status, 0])) as Record<Status, number>
  for (const shipment of shipments) counts[shipment.status] += 1
  return counts
}
