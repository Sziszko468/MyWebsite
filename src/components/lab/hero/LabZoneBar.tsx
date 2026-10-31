import type { Ref } from 'react'
import { experimentPath, findExperiment } from '../../../content/lab'
import { LocalizedLink } from '../../LocalizedLink/LocalizedLink'
import { useStore } from '../experience/store'
import { fill, useLabText } from '../core/useLabText'
import styles from './LabZoneBar.module.scss'
import { ZONE_IDS, activate, isPlainClick, release, zoneStore, type ZoneId } from './zones'

/**
 * The four zones as plain links under the 3D space: the way in for a keyboard, a screen reader,
 * a browser without WebGL and anyone who would rather read than hover. Each carries the zone's
 * number, name, what it is and one thing to do there. The space and the links are one control
 * seen twice: hovering or focusing a link wakes its object, and an object under the pointer
 * lights its link.
 */
export function LabZoneBar({ onOpen, ref }: { onOpen: (zone: ZoneId) => void; ref?: Ref<HTMLElement> }) {
  const { lang, text, experiments: words } = useLabText()
  const active = useStore(zoneStore, (state) => state.active)
  const source = useStore(zoneStore, (state) => state.source)
  const opening = useStore(zoneStore, (state) => state.opening)

  const status = opening
    ? fill(text.zones.opening, { name: findExperiment(opening)?.name ?? '' })
    : active && source === 'tap'
      ? fill(text.zones.selected, { name: findExperiment(active)?.name ?? '' })
      : ''

  return (
    <nav ref={ref} className={styles.bar} aria-label={text.zones.label}>
      <ol className={styles.list}>
        {ZONE_IDS.map((id) => {
          const experiment = findExperiment(id)
          if (!experiment) return null
          return (
            <li
              key={id}
              className={styles.item}
              data-zone={id}
              data-active={active === id}
              data-opening={opening === id}
            >
              <LocalizedLink
                to={experimentPath(id)}
                className={styles.link}
                onClick={(event) => {
                  if (!isPlainClick(event.nativeEvent)) return
                  event.preventDefault()
                  onOpen(id)
                }}
                onPointerEnter={(event) => {
                  if (event.pointerType !== 'touch') activate(id, 'link')
                }}
                onPointerLeave={() => release('link')}
                onFocus={() => activate(id, 'focus')}
                onBlur={() => release('focus')}
              >
                <span className={styles.number} aria-hidden="true">
                  {experiment.number}
                </span>
                <span className={styles.name}>{experiment.name}</span>
                <span className={styles.tagline}>{experiment.tagline[lang]}</span>
                <span className={styles.preview}>{words[id].interactions[0]}</span>
                <span className={styles.enter}>
                  {text.zones.enter}
                  <svg viewBox="0 0 16 16" width="1em" height="1em" aria-hidden="true">
                    <path d="M2 8h11m0 0L8.5 3.5M13 8l-4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.75" />
                  </svg>
                </span>
              </LocalizedLink>
            </li>
          )
        })}
      </ol>
      <p className="visually-hidden" role="status">
        {status}
      </p>
    </nav>
  )
}
