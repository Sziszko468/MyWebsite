import { useEffect, useRef, useState } from 'react'
import { useAiConfig } from '../ai/availability'
import { controlRoom, useControlRoom } from '../ai/controlRoom'
import { useAiText } from '../ai/useAiText'
import { useVisualViewport } from '../ai/viewport'
import { ChatSurface } from '../components/ai/ChatSurface'
import { HistoryList } from '../components/ai/HistoryList'
import { PlanPanel } from '../components/ai/PlanPanel'
import { LocalizedLink } from '../components/LocalizedLink/LocalizedLink'
import { useI18n } from '../i18n/useI18n'
import { cx } from '../utils/cx'
import styles from './ControlRoomPage.module.scss'

/**
 * CONTROL ROOM AI as a place of its own, not an enlarged chat window: a workspace with the visitor's conversations on the left,
 * the conversation in the middle and the project plan on the right. On a phone it is one column: the conversation, with the
 * plan one tap away and the conversations in a drawer; the box to write in stays above the on-screen keyboard. It is the same
 * conversation the floating assistant shows (both read `controlRoom`), and the page is a chunk of its own: nothing about the
 * AI loads on any other page until the floating assistant is opened.
 */

type Pane = 'chat' | 'plan'

export function ControlRoomPage() {
  const text = useAiText()
  const { lang } = useI18n()
  const { config, ready } = useAiConfig(true)
  const room = useControlRoom()
  const workspace = useRef<HTMLDivElement | null>(null)
  const [element, setElement] = useState<HTMLDivElement | null>(null)
  const [pane, setPane] = useState<Pane>('chat')
  const [drawer, setDrawer] = useState(false)
  const drawerButton = useRef<HTMLButtonElement | null>(null)

  useEffect(() => setElement(workspace.current), [ready])
  useVisualViewport(element)
  useEffect(() => {
    controlRoom.language = lang
    if (config?.available) void controlRoom.start()
  }, [config?.available, lang])

  // Escape closes the drawer and returns to the button that opened it.
  useEffect(() => {
    if (!drawer) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDrawer(false)
        drawerButton.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [drawer])

  const planReady = Boolean(room.plan?.ready && !room.plan.sent)

  if (!ready) return <div className={styles.loading} role="status">{text.page.loading}</div>
  if (!config?.available || !config.languages.includes(lang)) {
    return (
      <div className={styles.unavailable}>
        <h1 className={styles.heading}>{config?.unavailableReason === 'model' ? text.page.modelUnavailableTitle : text.page.unavailableTitle}</h1>
        <p>{text.page.unavailableText}</p>
        <LocalizedLink to="/contact" className={styles.link}>
          {text.page.contact}
        </LocalizedLink>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <header className={styles.intro}>
        <p className={styles.eyebrow}>
          <span className={styles.led} aria-hidden="true" />
          {text.page.live}
        </p>
        <h1 className={styles.heading}>{text.page.heading}</h1>
        <p className={styles.tagline}>{text.tagline}</p>
        <p className={styles.lead}>{text.page.lead}</p>
      </header>

      <div ref={workspace} className={styles.workspace} data-pane={pane} data-drawer={drawer || undefined}>
        <div className={styles.bar}>
          <button ref={drawerButton} type="button" className={styles.barButton} aria-expanded={drawer} aria-controls="control-room-history" onClick={() => setDrawer(!drawer)}>
            {text.history.toggle}
          </button>
          <div className={styles.switch} role="tablist" aria-label={text.page.title}>
            <button type="button" role="tab" id="cr-tab-chat" aria-selected={pane === 'chat'} aria-controls="control-room-chat" tabIndex={pane === 'chat' ? 0 : -1} className={styles.tab} onClick={() => setPane('chat')}>
              {text.actions.chat}
            </button>
            <button type="button" role="tab" id="cr-tab-plan" aria-selected={pane === 'plan'} aria-controls="control-room-plan" tabIndex={pane === 'plan' ? 0 : -1} className={styles.tab} onClick={() => setPane('plan')}>
              {text.actions.plan}
              {planReady && <span className={styles.dot} aria-hidden="true" />}
            </button>
          </div>
        </div>

        <aside id="control-room-history" className={cx(styles.history)} aria-label={text.history.toggle}>
          <HistoryList onChosen={() => setDrawer(false)} />
        </aside>
        <section id="control-room-chat" className={styles.chat} aria-labelledby="cr-tab-chat">
          <ChatSurface variant="page" />
        </section>
        <aside id="control-room-plan" className={styles.plan} aria-labelledby="cr-tab-plan">
          <PlanPanel onAsk={() => setPane('chat')} />
          <p className={styles.note}>{text.page.sessionNote}</p>
        </aside>
        {drawer && <button type="button" className={styles.scrim} aria-label={text.panel.close} tabIndex={-1} onClick={() => setDrawer(false)} />}
      </div>
    </div>
  )
}
