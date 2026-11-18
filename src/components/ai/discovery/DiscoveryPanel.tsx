import { useId, useRef, useState, type KeyboardEvent } from 'react'
import { controlRoom, useControlRoom } from '../../../ai/controlRoom'
import { useDiscoveryText } from '../../../ai/useDiscoveryText'
import { cx } from '../../../utils/cx'
import { fill } from '../../../utils/format'
import { PlanTab } from './PlanTab'
import { ProgressList } from './ProgressList'
import { ProjectTab } from './ProjectTab'
import { RequirementsTab } from './RequirementsTab'
import styles from './Discovery.module.scss'

type Tab = 'project' | 'requirements' | 'plan'
const TABS: Tab[] = ['project', 'requirements', 'plan']

/**
 * The project discovery (PROMPT 30): the structured side of the conversation. The assistant asks one question at a time and records what it
 * understood; this panel shows that record, lets the visitor correct, confirm or reject any of it, and turns it into a plan and a quote request
 * only when the visitor says so. The state is the server's (`controlRoom.discovery`); every change names the version the visitor saw.
 */
export function DiscoveryPanel({ onAsk }: { onAsk?: () => void }) {
  const room = useControlRoom()
  const text = useDiscoveryText()
  const id = useId()
  const [tab, setTab] = useState<Tab>('project')
  const tabs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({})
  const state = room.discovery
  const chatBusy = room.status === 'submitted' || room.status === 'streaming'
  const onServer = room.conversations.some((conversation) => conversation.id === room.conversationId)

  if (!state) {
    if (room.loading)
      return (
        <div className={styles.panel}>
          <h2 className={styles.title}>{text.panel.title}</h2>
          <p className={styles.lead} role="status">
            {text.panel.loading}
          </p>
        </div>
      )
    if (onServer)
      return (
        <div className={styles.panel}>
          <h2 className={styles.title}>{text.panel.title}</h2>
          <p className={styles.alert} role="alert">
            {text.panel.problem}
          </p>
          <div className={styles.actions}>
            <button type="button" className={styles.secondary} onClick={() => void controlRoom.refreshDiscovery()}>
              {text.panel.retry}
            </button>
          </div>
        </div>
      )
    return (
      <div className={cx(styles.panel)}>
        <h2 className={styles.title}>{text.panel.title}</h2>
        <p className={styles.lead}>{text.panel.lead}</p>
        <div className={styles.empty}>
          <p className={styles.notice}>{text.panel.empty}</p>
          <button
            type="button"
            className={styles.primary}
            disabled={chatBusy}
            onClick={() => {
              onAsk?.()
              void controlRoom.send(text.panel.startPrompt)
            }}
          >
            {text.panel.start}
          </button>
        </div>
      </div>
    )
  }

  const locked = chatBusy || room.discoveryBusy || state.sent
  const problem = room.discoveryProblem
  const fields = problem?.fields ?? {}
  const live = state.requirements.filter((item) => item.status !== 'rejected').length

  const move = (event: KeyboardEvent) => {
    const index = TABS.indexOf(tab)
    const next = event.key === 'ArrowRight' ? TABS[(index + 1) % TABS.length] : event.key === 'ArrowLeft' ? TABS[(index + TABS.length - 1) % TABS.length] : event.key === 'Home' ? TABS[0] : event.key === 'End' ? TABS[TABS.length - 1] : null
    if (!next) return
    event.preventDefault()
    setTab(next)
    tabs.current[next]?.focus()
  }

  return (
    <div className={styles.panel}>
      <div className={styles.head}>
        <h2 className={styles.title}>{text.panel.title}</h2>
        {state.exists && !state.sent && <StartOver disabled={chatBusy || room.discoveryBusy} />}
      </div>
      <p className={styles.lead}>{text.panel.lead}</p>

      {state.sent && (
        <p className={styles.good} role="status">
          {fill(text.panel.sent, { reference: room.plan?.reference ?? '' })}
        </p>
      )}
      {problem && (
        <p className={styles.alert} role="alert">
          {text.errors[problem.code]}
        </p>
      )}

      <ProgressList state={state} locked={locked} />

      {!state.sent && (
        <div className={styles.askRow}>
          <button
            type="button"
            className={cx(styles.secondary, styles.compact)}
            onClick={() => {
              onAsk?.()
              // The conversation may have to be shown first (a phone, the floating window): the box is focused once it is on screen.
              window.requestAnimationFrame(() => window.requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>('textarea[enterkeyhint="send"]')?.focus()))
            }}
          >
            {text.panel.ask}
          </button>
          <p className={styles.small}>{text.panel.askHint}</p>
        </div>
      )}

      <div className={styles.tabs} role="tablist" aria-label={text.panel.tabs} onKeyDown={move}>
        {TABS.map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            id={`${id}-tab-${name}`}
            ref={(element) => {
              tabs.current[name] = element
            }}
            aria-selected={tab === name}
            aria-controls={`${id}-panel-${name}`}
            tabIndex={tab === name ? 0 : -1}
            className={styles.tab}
            onClick={() => setTab(name)}
          >
            {text.panel[name]}
            {name === 'requirements' && live > 0 && <span className={styles.tabCount}> ({live})</span>}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`${id}-panel-${tab}`} aria-labelledby={`${id}-tab-${tab}`} tabIndex={0}>
        {tab === 'project' && <ProjectTab state={state} locked={locked} fields={fields} />}
        {tab === 'requirements' && <RequirementsTab state={state} locked={locked} fields={fields} />}
        {tab === 'plan' && <PlanTab state={state} conversationId={room.conversationId} locked={locked} ready={room.plan?.ready === true} quoteEnabled={room.config?.quoteEnabled === true} />}
      </div>
    </div>
  )
}

/** Starting the discovery over clears the draft, its requirements and its plan versions on the server: asked twice. */
function StartOver({ disabled }: { disabled: boolean }) {
  const text = useDiscoveryText()
  const [asking, setAsking] = useState(false)
  const [failed, setFailed] = useState(false)
  if (!asking)
    return (
      <button type="button" className={cx(styles.ghost, styles.compact)} disabled={disabled} onClick={() => setAsking(true)}>
        {text.panel.startOver}
      </button>
    )
  return (
    <span className={styles.confirm} role="group" aria-label={text.panel.startOverConfirm}>
      <span>{failed ? text.errors.generic : text.panel.startOverConfirm}</span>
      <button
        type="button"
        className={cx(styles.danger, styles.compact)}
        disabled={disabled}
        onClick={() =>
          void controlRoom
            .startOverPlan()
            .then(() => setAsking(false))
            .catch(() => setFailed(true))
        }
      >
        {text.panel.startOver}
      </button>
      <button type="button" className={cx(styles.ghost, styles.compact)} onClick={() => setAsking(false)}>
        {text.panel.cancel}
      </button>
    </span>
  )
}
