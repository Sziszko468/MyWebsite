import { useId } from 'react'
import { Button } from '../Button/Button'
import { LocalizedLink } from '../LocalizedLink/LocalizedLink'
import { Reveal } from '../motion/Reveal'
import { usePointerField } from '../motion/usePointerField'
import styles from './PathChooser.module.scss'

/** Where a door leads: a page of the site (`to`, language-free) or a place on the page it is on (`href`). */
export type DoorAction = ({ to: string; href?: never } | { href: string; to?: never }) & { onClick?: () => void }

export interface DoorProps {
  label: string
  title: string
  /** An optional sentence under the title. */
  text?: string
  cta: string
  action: DoorAction
}

function DoorLink({ action, className }: { action: DoorAction; className: string }) {
  // The larger hit area: hidden from assistive tech and the tab order, because the button is the link.
  return action.to !== undefined ? (
    <LocalizedLink className={className} to={action.to} onClick={action.onClick} aria-hidden="true" tabIndex={-1} />
  ) : (
    <a className={className} href={action.href} onClick={action.onClick} aria-hidden="true" tabIndex={-1} />
  )
}

function DoorButton({ action, variant, size, className, children }: { action: DoorAction; variant: 'primary' | 'secondary'; size?: 'lg'; className: string; children: string }) {
  return action.to !== undefined ? (
    <Button to={action.to} onClick={action.onClick} variant={variant} size={size} arrow className={className}>
      {children}
    </Button>
  ) : (
    <Button href={action.href} onClick={action.onClick} variant={variant} size={size} arrow className={className}>
      {children}
    </Button>
  )
}

/**
 * Two doors, built differently on purpose. The first is paper, narrow and measured: a blueprint grid
 * and a crosshair come up under the pointer. The second is carbon, wide and fast: a red streak leans
 * after the pointer. Each is dark or light whatever the page is, so the two always contrast with each
 * other and with the page. Both are whole-panel links; the button inside is the real, focusable link
 * and the larger hit area is a hidden twin of it. The home page uses them to ask who is visiting, the
 * contact page to ask what the visit is about. `size="long"` is for titles that are whole sentences:
 * they are set smaller and may break inside a long word rather than spill out of the door.
 */
export function PathDoors({ career, clients, size = 'default' }: { career: DoorProps; clients: DoorProps; size?: 'default' | 'long' }) {
  const careerTitle = useId()
  const clientsTitle = useId()
  const careerRef = usePointerField<HTMLElement>()
  const clientsRef = usePointerField<HTMLElement>()

  return (
    <div className={styles.paths}>
      <Reveal className={styles.careerSlot}>
        <article ref={careerRef} className={styles.career} data-theme="light" data-size={size} aria-labelledby={careerTitle}>
          <DoorLink action={career.action} className={styles.overlay} />
          <span className={styles.grid} aria-hidden="true" />
          <span className={styles.crossH} aria-hidden="true" />
          <span className={styles.crossV} aria-hidden="true" />
          <span className={styles.ghostA} aria-hidden="true">
            A
          </span>

          <p className={styles.careerLabel}>
            <span aria-hidden="true">A</span>
            {career.label}
          </p>
          <h3 id={careerTitle} className={styles.careerTitle}>
            {career.title}
          </h3>
          {career.text && <p className={styles.careerText}>{career.text}</p>}
          <DoorButton action={career.action} variant="secondary" className={styles.cta}>
            {career.cta}
          </DoorButton>
        </article>
      </Reveal>

      <Reveal className={styles.clientsSlot} delay={120}>
        <article ref={clientsRef} className={styles.clients} data-theme="dark" data-size={size} aria-labelledby={clientsTitle}>
          <DoorLink action={clients.action} className={styles.overlay} />
          <span className={styles.streaks} aria-hidden="true" />
          <span className={styles.beam} aria-hidden="true" />
          <span className={styles.ghostB} aria-hidden="true">
            B
          </span>

          <p className={styles.clientsLabel}>
            <span aria-hidden="true">B</span>
            {clients.label}
          </p>
          <h3 id={clientsTitle} className={styles.clientsTitle}>
            {clients.title}
          </h3>
          {clients.text && <p className={styles.clientsText}>{clients.text}</p>}
          <DoorButton action={clients.action} variant="primary" size="lg" className={styles.cta}>
            {clients.cta}
          </DoorButton>
        </article>
      </Reveal>
    </div>
  )
}
