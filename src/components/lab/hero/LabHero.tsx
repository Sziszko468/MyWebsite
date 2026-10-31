import { lazy, useCallback, useEffect, useId, useMemo, useRef, type CSSProperties } from 'react'
import { useNavigate } from 'react-router'
import { experimentPath } from '../../../content/lab'
import { localizedPath } from '../../../i18n/paths'
import { useTouchFirst } from '../../hero/capabilities'
import { Button } from '../../Button/Button'
import { Container } from '../../Container/Container'
import { LabStage } from '../core/LabStage'
import { useLabText } from '../core/useLabText'
import { useLabView } from '../core/useLabView'
import { useMedia } from '../experience/useMedia'
import { LabChoice } from '../ui/LabControls'
import type { LabView } from '../core/labMode'
import styles from './LabHero.module.scss'
import type { HeroLayout } from './LabHeroScene'
import type { ZoneBridge } from './LabZonesScene'
import { LabZoneBar } from './LabZoneBar'
import {
  OPEN_SECONDS,
  ZONE_CAMERA,
  ZONE_IDS,
  autoPlacement,
  beginOpening,
  resetZones,
  rowPlacement,
  zoneStore,
  type ZoneId,
  type ZonePlace,
} from './zones'

// The scene (Three.js and its shaders) is its own chunk: the headline, the button and the still
// picture are plain HTML and SVG and never wait for it.
const LabHeroScene = lazy(() => import('./LabHeroScene'))

const WIDE_QUERY = '(min-width: 64rem)'

/** The core is the hub the zones stand round: behind them, in the middle of the space. */
const HUB_LAYOUT: HeroLayout = { shiftX: 0, shiftY: 0, fit: 0.32, z: -1.6 }

/**
 * Free space kept between the objects and the headline above them, and between the objects and the
 * links below them (the second is larger: the one-line hint sits in it), in pixels.
 */
const BAND_GAP_TOP = 12
const BAND_GAP_BOTTOM = 36

function HeroPoster() {
  return (
    <div className={styles.poster}>
      <span className={styles.posterCore} />
      <span className={styles.posterRing} />
      <span className={styles.posterRingOuter} />
    </div>
  )
}

/**
 * The Lab's first screen: the headline in type, one button, the signature line and an interactive
 * object. The object is a deforming, contour-lined sphere: at rest it is calm, and the first move
 * of the pointer (or a finger, or an arrow key) dents it, turns its light and sends heat through
 * its lines; a click sends a wave across it and throws its dust outward. The text is ordinary
 * HTML above the scene, readable from the first paint; the scene is used only when it can run
 * well (see useLabView), otherwise the picture stays.
 */
export function LabHero() {
  const { lang, text } = useLabText()
  const view = useLabView()
  const touchFirst = useTouchFirst()
  const wide = useMedia(WIDE_QUERY)
  const navigate = useNavigate()
  const titleId = useId()
  const layout = useRef<HeroLayout>(HUB_LAYOUT)
  const place = useRef<ZonePlace[]>(autoPlacement(1.6))
  const stageEl = useRef<HTMLDivElement | null>(null)
  const copyEl = useRef<HTMLDivElement | null>(null)
  const barEl = useRef<HTMLElement | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const copy = text.hero

  // Where the zones stand comes from the page itself: on a wide screen each object stands above its
  // link, in the band between the headline and the bar; otherwise they form a grid in their own block.
  useEffect(() => {
    const measure = () => {
      const stage = stageEl.current?.getBoundingClientRect()
      if (!stage || stage.width < 1 || stage.height < 1) return
      const items = barEl.current?.querySelectorAll<HTMLElement>('[data-zone]') ?? []
      const heading = copyEl.current?.getBoundingClientRect()
      let row: ZonePlace[] | null = null
      if (window.matchMedia(WIDE_QUERY).matches && items.length === ZONE_IDS.length && heading) {
        const boxes = Array.from(items, (item) => item.getBoundingClientRect())
        row = rowPlacement(
          stage,
          boxes.map((box) => box.left + box.width / 2),
          heading.bottom + BAND_GAP_TOP,
          Math.min(...boxes.map((box) => box.top)) - BAND_GAP_BOTTOM,
        )
      }
      place.current = row ?? autoPlacement(stage.width / stage.height)
      layout.current = row
        ? { shiftX: 0, shiftY: row[0].y, fit: Math.min(0.85, Math.max(0.3, row[0].r * 0.85)), z: -1.6 }
        : HUB_LAYOUT
      // The hint sits just above the links, in the gap under the space, wherever the links turn out to be.
      const stageBox = stageEl.current
      if (row) {
        const top = Math.min(...Array.from(items, (item) => item.getBoundingClientRect().top))
        stageBox?.style.setProperty('--hint-bottom', `${Math.max(0, stage.bottom - top) + 6}px`)
      } else {
        stageBox?.style.removeProperty('--hint-bottom')
      }
    }
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    for (const element of [stageEl.current, copyEl.current, barEl.current]) if (element) observer?.observe(element)
    window.addEventListener('resize', measure)
    void document.fonts?.ready.then(measure)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])

  // Entering a zone: the camera flies in for a moment, then the page changes. Without the scene
  // (a still view, a calm view, reduced motion) there is nothing to fly through: it changes at once.
  const flies = view.view === 'live' && !view.reducedMotion
  const openZone = useCallback(
    (zone: ZoneId) => {
      if (zoneStore.get().opening) return
      beginOpening(zone)
      const to = localizedPath(lang, experimentPath(zone))
      if (flies) timer.current = window.setTimeout(() => navigate(to), OPEN_SECONDS * 1000)
      else navigate(to)
    },
    [flies, lang, navigate],
  )
  const zones = useMemo<ZoneBridge>(() => ({ place, open: openZone }), [openZone])

  // A page that is left in the middle of a flight must not keep the flight. The router changes the
  // address at once but keeps this page on screen until the next page's code has arrived, so a
  // visitor who steps Back in that time returns to a page that was never unmounted: the history
  // step itself ends the flight, and cancels a page change that has not happened yet.
  useEffect(() => {
    const endFlight = () => {
      window.clearTimeout(timer.current)
      resetZones()
    }
    endFlight()
    window.addEventListener('popstate', endFlight)
    return () => {
      window.removeEventListener('popstate', endFlight)
      endFlight()
    }
  }, [])

  const notice =
    view.reason === 'no-webgl'
      ? text.notices.noWebgl
      : view.reason === 'failed'
        ? text.notices.failed
        : view.reason === 'user'
          ? text.notices.still
          : view.view === 'calm'
            ? text.notices.calm
            : null

  const words = copy.title.split(' ')
  // The longest word sets the headline's size: it is the one that must fit the column, whatever the language.
  const longest = Math.max(...words.map((word) => word.length))
  const last = words.pop() ?? ''
  const head = words.join(' ')

  const viewOptions: Array<{ value: LabView; label: string; help: string }> = [
    { value: 'live', label: text.view.live, help: text.view.liveHelp },
    { value: 'calm', label: text.view.calm, help: text.view.calmHelp },
    { value: 'still', label: text.view.still, help: text.view.stillHelp },
  ]

  return (
    <section className={styles.hero} aria-labelledby={titleId} data-view={view.view}>
      <div className={styles.stageBox}>
        <LabStage
          label={copy.stageLabel}
          view={view.view}
          tier={view.tier}
          camera={ZONE_CAMERA}
          antialias
          ref={stageEl}
          className={styles.stage}
          touchAction="pan-y"
          poster={<HeroPoster />}
          hint={wide ? (touchFirst ? copy.hintTouch : copy.hint) : undefined}
          onSlow={view.onSlow}
          onFail={view.onFail}
          notices={{ loading: text.notices.loading, contextLost: text.notices.contextLost }}
        >
          <LabHeroScene layout={layout} zones={zones} />
        </LabStage>
      </div>

      <div className={styles.scrim} aria-hidden="true" />

      <Container size="wide" className={styles.content}>
        {/* Narrow screens: the space is a block of its own, so its instruction sits under it, always in view. */}
        {!wide && <p className={styles.caption}>{touchFirst ? copy.hintTouch : copy.hint}</p>}
        <div ref={copyEl} className={styles.copy} style={{ '--longest': longest } as CSSProperties}>
          <p className={styles.eyebrow}>{copy.eyebrow}</p>
          <h1 id={titleId} className={styles.title}>
            <span className={styles.line} style={{ '--i': 0 } as CSSProperties}>
              {head}
            </span>{' '}
            <span className={`${styles.line} ${styles.accent}`} style={{ '--i': 1 } as CSSProperties}>
              {last}
            </span>
          </h1>
          <p className={styles.lead}>{copy.lead}</p>
          <div className={styles.actions}>
            <Button href="#experiments" size="lg" arrow>
              {copy.cta}
            </Button>
          </div>
          <p className={styles.signature} lang="en">
            {text.signature.split(' ').map((word, index) => (
              <span key={word} className={styles.word} data-tone={index}>
                {word}
              </span>
            ))}
          </p>
        </div>

        <LabZoneBar ref={barEl} onOpen={openZone} />

        <div className={styles.view}>
          {notice && (
            <p className={styles.notice} role="status">
              {notice}
            </p>
          )}
          <LabChoice<LabView>
            label={text.view.label}
            value={view.view}
            options={viewOptions}
            onChange={view.choose}
            columns={3}
          />
        </div>
      </Container>
    </section>
  )
}
