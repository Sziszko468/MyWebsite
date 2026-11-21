import { useEffect, useReducer, useRef, useState } from 'react'
import { shipmentsText } from '../../content/demos/shipments'
import { demoText } from '../../content/demos/shell'
import { SelectField, TextField } from '../../components/form/fields'
import { useI18n } from '../../i18n/useI18n'
import { cx } from '../../utils/cx'
import { fill } from '../../utils/format'
import { formatShortDay } from '../format'
import { ChipRadioGroup } from '../ui/ChipRadioGroup'
import ui from '../ui/demoUi.module.scss'
import { useDemoText } from '../useDemoText'
import styles from './ShipmentDemo.module.scss'
import {
  DRIVERS,
  NOTE_MAX,
  ROLES,
  STATUSES,
  TRUCKS,
  allowedMoves,
  canAssign,
  checkAssign,
  checkMove,
  countByStatus,
  driverById,
  initialState,
  isStepBack,
  reduce,
  truckById,
  visibleShipments,
  type Problem,
  type Role,
  type Shipment,
  type State,
  type Status,
} from './model'

const GLYPHS: Record<Status, string> = { NEW: '+', ASSIGNED: '●', LOADING: '▣', IN_TRANSIT: '▶', DELIVERED: '✓', CANCELLED: '✕' }
const SORT_KEYS: ReadonlyArray<State['sort']['key']> = ['number', 'customer', 'pickup']

/**
 * The shipment board: the Logistics Platform's status workflow, role rules and rule-checked assignment on invented shipments. Its state is this component's
 * own reducer over plain data (model.ts); the rules that refuse a move or an assignment are the model's, so what the screen says is what the model decided.
 */
export default function ShipmentDemo() {
  const { lang } = useI18n()
  const t = useDemoText(shipmentsText)
  const shell = useDemoText(demoText)
  const [state, dispatch] = useReducer(reduce, undefined, initialState)
  const [pending, setPending] = useState<Status | null>(null)
  const [note, setNote] = useState('')
  const [noteError, setNoteError] = useState('')
  const [driverChoice, setDriverChoice] = useState('')
  const [truckChoice, setTruckChoice] = useState('')
  const [problems, setProblems] = useState<Problem[] | null>(null)
  const [assignError, setAssignError] = useState('')
  const [message, setMessage] = useState('')
  const headingRef = useRef<HTMLHeadingElement | null>(null)

  const selected = state.shipments.find((shipment) => shipment.id === state.selectedId) ?? null
  const { rows, total, page, pages } = visibleShipments(state)
  const counts = countByStatus(state.shipments)
  const day = (value: string) => formatShortDay(value, lang)
  const statusName = (status: Status) => t.statuses[status]
  const roleName = (role: Role) => t.roles.names[role]

  // Opening a shipment moves focus to its heading, so a keyboard or screen-reader visitor lands on what they asked for.
  useEffect(() => {
    if (state.selectedId !== null) headingRef.current?.focus()
  }, [state.selectedId])

  const clearTransient = () => {
    setPending(null)
    setNote('')
    setNoteError('')
    setDriverChoice('')
    setTruckChoice('')
    setProblems(null)
    setAssignError('')
  }

  const open = (id: number) => {
    clearTransient()
    dispatch({ type: 'select', id })
  }

  const move = (shipment: Shipment, to: Status, reason: string) => {
    const checked = checkMove(state, shipment.id, to, reason)
    if (!checked.ok) {
      setNoteError(t.moves.errors[checked.error])
      return
    }
    dispatch({ type: 'applyMove', id: shipment.id, to, note: reason })
    clearTransient()
    setMessage(fill(t.moves.done, { number: shipment.number, status: statusName(to) }))
  }

  const describe = (problem: Problem): string => {
    const who = problem.who === 'driver' ? driverById(driverChoice)?.name ?? '' : truckById(truckChoice)?.plate ?? ''
    const sentence = (problem.who === 'driver' ? t.assign.problems.driver : t.assign.problems.truck) as Record<string, string>
    return fill(sentence[problem.code], { name: who, with: problem.with ?? '' })
  }

  const assign = (shipment: Shipment) => {
    const driverId = driverChoice === '' ? null : driverChoice
    const truckId = truckChoice === '' ? null : truckChoice
    const checked = checkAssign(state, shipment.id, driverId, truckId)
    if (!checked.ok) {
      setProblems(checked.problems ?? null)
      setAssignError(checked.error === 'nothing' ? t.assign.nothing : checked.error === 'forbidden' ? t.assign.notAllowed : checked.error === 'locked' ? t.assign.locked : t.assign.refused)
      return
    }
    dispatch({ type: 'applyAssign', id: shipment.id, driverId, truckId })
    const detail = [driverId ? driverById(driverId)?.name : null, truckId ? truckById(truckId)?.plate : null].filter(Boolean).join(', ')
    setProblems(null)
    setAssignError('')
    setDriverChoice('')
    setTruckChoice('')
    setMessage(fill(t.assign.ok, { number: shipment.number, detail }))
  }

  const sortLabel = (key: State['sort']['key']) =>
    state.sort.key === key ? fill(t.list.sortedBy, { column: t.list.sorts[key], direction: state.sort.direction === 'asc' ? t.list.ascending : t.list.descending }) : t.list.sorts[key]

  const moves = selected ? allowedMoves(state.role, selected) : []
  const driver = selected ? driverById(selected.driverId) : null
  const truck = selected ? truckById(selected.truckId) : null
  const editable = selected !== null && (selected.status === 'NEW' || selected.status === 'ASSIGNED')

  return (
    <div className={styles.layout}>
      <section className={cx(ui.panel, styles.rolePanel)} aria-labelledby="ship-role">
        <div className={ui.panelHead}>
          <h3 id="ship-role" className={ui.title}>
            {t.roles.label}
          </h3>
          <span className={ui.sample}>{t.sample}</span>
        </div>
        <ChipRadioGroup legend={t.roles.label} hideLegend hint={t.roles.help} value={state.role} onChange={(role) => { clearTransient(); dispatch({ type: 'role', role: role as Role }) }} options={ROLES.map((role) => ({ value: role, label: roleName(role) }))} />
        <p className={styles.can}>{t.roles.can[state.role]}</p>
      </section>

      <section className={cx(ui.panel, styles.listPanel)} aria-labelledby="ship-list">
        <div className={ui.panelHead}>
          <h3 id="ship-list" className={ui.title}>
            {t.list.title}
          </h3>
          <p className={ui.note} role="status">
            {total === 1 ? t.list.countOne : fill(t.list.count, { count: total })}
          </p>
        </div>
        <div className={ui.chips} role="group" aria-label={t.list.filter}>
          {(['all', ...STATUSES] as const).map((status) => (
            <button key={status} type="button" className={ui.chip} aria-pressed={state.statusFilter === status} onClick={() => dispatch({ type: 'status', status })}>
              {status === 'all' ? t.list.all : statusName(status)}
              <span className={styles.count}>{status === 'all' ? state.shipments.length : counts[status]}</span>
            </button>
          ))}
        </div>
        <TextField label={t.list.search} type="search" value={state.search} maxLength={60} onChange={(event) => dispatch({ type: 'search', text: event.target.value })} />
        <div className={ui.chips} role="group" aria-label={t.list.sortGroup}>
          {SORT_KEYS.map((key) => (
            <button key={key} type="button" className={ui.chip} aria-pressed={state.sort.key === key} onClick={() => dispatch({ type: 'sort', key })}>
              {sortLabel(key)}
              {state.sort.key === key && <span aria-hidden="true">{state.sort.direction === 'asc' ? '↑' : '↓'}</span>}
            </button>
          ))}
        </div>
        {rows.length === 0 ? (
          <p className={ui.note}>{t.list.empty}</p>
        ) : (
          <ul className={cx(ui.list, styles.rows)}>
            {rows.map((shipment) => (
              <li key={shipment.id}>
                <button
                  type="button"
                  className={styles.row}
                  aria-pressed={state.selectedId === shipment.id}
                  aria-label={fill(t.list.openNamed, { number: shipment.number, customer: shipment.customer })}
                  onClick={() => open(shipment.id)}
                >
                  <span className={styles.number}>{shipment.number}</span>
                  <span className={cx(ui.badge, styles.status)} data-status={shipment.status}>
                    <span aria-hidden="true">{GLYPHS[shipment.status]}</span>
                    {statusName(shipment.status)}
                  </span>
                  <span className={styles.customer}>{shipment.customer}</span>
                  <span className={styles.route}>{fill(t.list.route, { from: shipment.from, to: shipment.to })}</span>
                  <span className={styles.dates}>{fill(t.list.dates, { pickup: day(shipment.pickup), delivery: day(shipment.delivery) })}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <nav className={styles.pager} aria-label={t.list.title}>
          <button type="button" className={ui.action} disabled={page <= 1} onClick={() => dispatch({ type: 'page', page: page - 1 })}>
            {t.list.previous}
          </button>
          <span className={ui.note}>{fill(t.list.pageOf, { page, pages })}</span>
          <button type="button" className={ui.action} disabled={page >= pages} onClick={() => dispatch({ type: 'page', page: page + 1 })}>
            {t.list.next}
          </button>
        </nav>
      </section>

      <section className={cx(ui.panel, styles.detailPanel)} aria-labelledby="ship-detail">
        {!selected ? (
          <>
            <h3 id="ship-detail" className={ui.title}>
              {t.details.title}
            </h3>
            <p className={ui.note}>{t.details.none}</p>
          </>
        ) : (
          <>
            <div className={ui.panelHead}>
              <h3 id="ship-detail" ref={headingRef} tabIndex={-1} className={cx(ui.title, styles.detailTitle)}>
                {selected.number}
              </h3>
              <span className={cx(ui.badge, styles.status)} data-status={selected.status}>
                <span aria-hidden="true">{GLYPHS[selected.status]}</span>
                {statusName(selected.status)}
              </span>
            </div>
            <dl className={styles.facts}>
              <div>
                <dt>{t.details.customer}</dt>
                <dd>{selected.customer}</dd>
              </div>
              <div>
                <dt>{t.details.cargo}</dt>
                <dd>{fill(t.cargo[selected.cargo], { n: selected.amount })}</dd>
              </div>
              <div>
                <dt>{t.details.pickup}</dt>
                <dd>
                  {selected.from}, {day(selected.pickup)}
                </dd>
              </div>
              <div>
                <dt>{t.details.delivery}</dt>
                <dd>
                  {selected.to}, {day(selected.delivery)}
                </dd>
              </div>
              <div>
                <dt>{t.details.driver}</dt>
                <dd>{driver ? driver.name : t.details.unassigned}</dd>
              </div>
              <div>
                <dt>{t.details.truck}</dt>
                <dd>{truck ? truck.plate : t.details.unassigned}</dd>
              </div>
            </dl>

            <div className={styles.block}>
              <h4 className={styles.blockTitle}>{t.moves.title}</h4>
              {moves.length === 0 ? (
                <p className={ui.note}>{selected.status === 'DELIVERED' || selected.status === 'CANCELLED' ? t.moves.final : t.moves.none}</p>
              ) : (
                <div className={styles.moves}>
                  {moves.map((candidate) => (
                    <button
                      key={candidate.to}
                      type="button"
                      className={cx(ui.action, candidate.to === 'CANCELLED' && ui.danger)}
                      aria-pressed={pending === candidate.to}
                      onClick={() => {
                        setNoteError('')
                        if (candidate.noteRequired) {
                          setPending(candidate.to)
                          setNote('')
                        } else move(selected, candidate.to, '')
                      }}
                    >
                      {candidate.to === 'CANCELLED' ? t.moves.cancel : isStepBack(selected.status, candidate.to) ? fill(t.moves.stepBack, { status: statusName(candidate.to) }) : fill(t.moves.moveTo, { status: statusName(candidate.to) })}
                    </button>
                  ))}
                </div>
              )}
              {pending && (
                <form
                  className={styles.reason}
                  noValidate
                  onSubmit={(event) => {
                    event.preventDefault()
                    move(selected, pending, note)
                  }}
                >
                  <TextField label={t.moves.reason} hint={t.moves.reasonHelp} multiline rows={3} maxLength={NOTE_MAX + 40} value={note} onChange={(event) => setNote(event.target.value)} error={noteError} />
                  <div className={styles.moves}>
                    <button type="submit" className={ui.action}>
                      {t.moves.confirm}
                    </button>
                    <button type="button" className={ui.action} onClick={() => { setPending(null); setNote(''); setNoteError('') }}>
                      {t.moves.discard}
                    </button>
                  </div>
                </form>
              )}
            </div>

            <div className={styles.block}>
              <h4 className={styles.blockTitle}>{t.assign.title}</h4>
              <p className={ui.note}>{t.assign.help}</p>
              {!canAssign(state.role) ? (
                <p className={ui.note}>{t.assign.notAllowed}</p>
              ) : !editable ? (
                <p className={ui.note}>{t.assign.locked}</p>
              ) : (
                <form
                  className={styles.assign}
                  noValidate
                  onSubmit={(event) => {
                    event.preventDefault()
                    assign(selected)
                  }}
                >
                  <SelectField
                    label={t.assign.driver}
                    value={driverChoice}
                    onChange={setDriverChoice}
                    placeholder={driver ? t.assign.keep : t.assign.choose}
                    options={DRIVERS.map((candidate) => ({ value: candidate.id, label: candidate.active ? candidate.name : fill(t.assign.inactiveOption, { name: candidate.name }) }))}
                  />
                  <SelectField
                    label={t.assign.truck}
                    value={truckChoice}
                    onChange={setTruckChoice}
                    placeholder={truck ? t.assign.keep : t.assign.choose}
                    options={TRUCKS.map((candidate) => ({ value: candidate.id, label: candidate.inWorkshop ? fill(t.assign.workshopOption, { plate: candidate.plate }) : candidate.plate }))}
                  />
                  <button type="submit" className={cx(ui.action, styles.submit)}>
                    {t.assign.submit}
                  </button>
                  {assignError && (
                    <div role="alert" className={styles.refusal}>
                      <p>{assignError}</p>
                      {problems && (
                        <ul>
                          {problems.map((problem, index) => (
                            <li key={index}>{describe(problem)}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                  <div className={styles.moves}>
                    {driver && (
                      <button type="button" className={ui.action} onClick={() => { dispatch({ type: 'applyUnassign', id: selected.id, which: 'driver' }); setMessage(fill(t.assign.removed, { number: selected.number, who: t.assign.whoDriver })) }}>
                        {fill(t.assign.remove, { who: t.assign.whoDriver })}
                      </button>
                    )}
                    {truck && (
                      <button type="button" className={ui.action} onClick={() => { dispatch({ type: 'applyUnassign', id: selected.id, which: 'truck' }); setMessage(fill(t.assign.removed, { number: selected.number, who: t.assign.whoTruck })) }}>
                        {fill(t.assign.remove, { who: t.assign.whoTruck })}
                      </button>
                    )}
                  </div>
                </form>
              )}
            </div>

            <div className={styles.block}>
              <h4 className={styles.blockTitle}>{t.timeline.title}</h4>
              <ol className={styles.timeline}>
                {selected.history.map((entry, index) => (
                  <li key={index}>
                    <span className={styles.timelineStatus}>
                      <span aria-hidden="true">{GLYPHS[entry.to]}</span> {statusName(entry.to)}
                    </span>
                    <span className={ui.note}>{entry.by === 'system' ? t.timeline.system : roleName(entry.by)}</span>
                    {(entry.note || entry.sampleNote) && <span className={ui.note}>{fill(t.timeline.note, { note: entry.sampleNote ? t.sampleNotes[entry.sampleNote] : entry.note })}</span>}
                  </li>
                ))}
              </ol>
            </div>
          </>
        )}
        <p className={ui.live} role="status">
          {message}
        </p>
        <p className={ui.note}>{shell.labels.simulated}</p>
      </section>
    </div>
  )
}
