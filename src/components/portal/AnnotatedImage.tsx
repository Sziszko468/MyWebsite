import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { usePortalText } from '../../portal/text'
import { centre, describePoint, markerStyle, nudge, stepOf, toNormalized, type Point } from '../../utils/annotations'
import { fill } from '../../utils/format'
import d from './Deliverables.module.scss'

/**
 * A picture the customer can place markers on (PROMPT 27). A marker is a position from 0 to 1 (utils/annotations.ts) drawn in PERCENT of the picture, so it stays on its spot when
 * the picture scales. It works three ways, none of which needs a mouse: a tap or click on the picture (while placing), the keyboard (a crosshair that the arrow keys move and Enter
 * places), and the list of comments beside it, which says every marker's position in words (the picture is a picture of that list, not the only way to it).
 *
 * The picture is loaded from an address the owner chose and the site's policy allows (it is on the owner's allowlist: the server refuses any other for a picture); the page
 * sends no referrer with it.
 */

export interface Marker {
  id: string
  number: number
  position: Point
  draft: boolean
  active: boolean
}

export function AnnotatedImage({
  src,
  alt,
  markers,
  placing,
  pending,
  onPlace,
  onCancel,
  onSelect,
}: {
  src: string
  alt: string
  markers: Marker[]
  /** Placing mode is on: a tap or the crosshair places a marker. */
  placing: boolean
  /** The spot already chosen for the comment being written. */
  pending: Point | null
  onPlace: (point: Point) => void
  onCancel: () => void
  onSelect: (id: string) => void
}) {
  const words = usePortalText().deliverables.annotate
  const image = useRef<HTMLImageElement>(null)
  const crosshair = useRef<HTMLButtonElement>(null)
  const [cursor, setCursor] = useState<Point>(pending ?? centre)

  // Entering placing mode puts the keyboard on the crosshair, so it can be used straight away.
  useEffect(() => {
    if (placing) {
      setCursor(pending ?? centre)
      crosshair.current?.focus()
    }
    // Only entering the mode moves focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placing])

  const place = (event: MouseEvent<HTMLImageElement>) => {
    if (!placing || !image.current) return
    const box = image.current.getBoundingClientRect()
    const point = toNormalized({ x: event.clientX, y: event.clientY }, { left: box.left, top: box.top, width: box.width, height: box.height })
    if (point) onPlace(point)
  }

  const key = (event: KeyboardEvent<HTMLButtonElement>) => {
    const step = stepOf(event.key, event.shiftKey)
    if (step) {
      event.preventDefault()
      setCursor((current) => nudge(current, step.dx, step.dy))
    } else if (event.key === 'Escape') {
      event.preventDefault()
      onCancel()
    }
  }

  const spot = describePoint(cursor)
  return (
    <div className={d.pictureBlock}>
      <div className={d.picture} data-placing={placing} role="group" aria-label={words.region}>
        <img ref={image} className={d.pictureImage} src={src} alt={alt} loading="lazy" decoding="async" referrerPolicy="no-referrer" draggable={false} onClick={place} />
        {markers.map((marker) => {
          const where = describePoint(marker.position)
          return (
            <button key={marker.id} type="button" className={d.marker} data-draft={marker.draft} data-active={marker.active} style={markerStyle(marker.position)} aria-label={fill(words.marker, { number: marker.number, left: where.left, top: where.top })} onClick={() => onSelect(marker.id)}>
              <span aria-hidden="true">{marker.number}</span>
            </button>
          )
        })}
        {pending && !placing && <span className={d.pending} style={markerStyle(pending)} aria-hidden="true" />}
        {placing && (
          <button
            ref={crosshair}
            type="button"
            className={d.crosshair}
            style={markerStyle(cursor)}
            aria-label={fill(words.crosshair, { left: spot.left, top: spot.top })}
            onKeyDown={key}
            onClick={() => onPlace(cursor)}
          >
            <span aria-hidden="true">+</span>
          </button>
        )}
      </div>
      {placing && (
        <p className={d.hint} role="status">
          {words.placing}
        </p>
      )}
    </div>
  )
}
