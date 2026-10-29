import { useEffect, useRef } from 'react'
import type { GalleryImage } from '../../content/projectDetails/types'
import { useI18n } from '../../i18n/useI18n'
import { cx } from '../../utils/cx'
import { Reveal } from '../motion/Reveal'
import { fill } from '../../utils/format'
import styles from './Gallery.module.scss'

function Thumbnails({
  images,
  kind,
  onOpenImage,
}: {
  images: readonly GalleryImage[]
  kind: 'desktop' | 'mobile'
  onOpenImage: (id: string) => void
}) {
  const { lang, t } = useI18n()
  const title = kind === 'desktop' ? t.project.gallery.desktop : t.project.gallery.mobile

  return (
    <div className={styles.group}>
      <h3 className={styles.groupTitle}>{title}</h3>
      <ul className={cx(styles.thumbs, styles[kind])}>
        {images.map((image, position) => (
          <li key={image.id} className={styles.item}>
            <Reveal delay={Math.min(position, 4) * 60}>
              <figure className={styles.figure}>
                <button type="button" className={styles.thumb} onClick={() => onOpenImage(image.id)}>
                  <img
                    src={image.src}
                    width={image.width}
                    height={image.height}
                    alt={image.alt[lang]}
                    loading="lazy"
                    decoding="async"
                  />
                  <span className="visually-hidden">{fill(t.project.gallery.open, { title: image.caption[lang] })}</span>
                </button>
                <figcaption className={styles.caption}>{image.caption[lang]}</figcaption>
              </figure>
            </Reveal>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * The project's screenshots, desktop and phone apart. Each is a real button, so a keyboard or a
 * finger opens it large; nothing depends on hovering. A note says what the pictures are (names,
 * age, data) so they are never mistaken for something they are not.
 */
export function Gallery({
  images,
  note,
  onOpenImage,
}: {
  images: readonly GalleryImage[]
  note: string | null
  onOpenImage: (id: string) => void
}) {
  const desktop = images.filter((image) => image.device === 'desktop')
  const mobile = images.filter((image) => image.device === 'mobile')

  return (
    <div className={styles.gallery}>
      {desktop.length > 0 && <Thumbnails images={desktop} kind="desktop" onOpenImage={onOpenImage} />}
      {mobile.length > 0 && <Thumbnails images={mobile} kind="mobile" onOpenImage={onOpenImage} />}
      {note && <p className={styles.note}>{note}</p>}
    </div>
  )
}

/**
 * One image large, in a modal dialog: Escape, the close button or a click outside closes it, the
 * arrow keys and the two buttons move through the set, and focus goes back to what opened it. It
 * lives at the top of the page, outside the bands, so no band's clipping can cut it.
 */
export function Lightbox({
  images,
  activeId,
  onChange,
}: {
  images: readonly GalleryImage[]
  activeId: string | null
  onChange: (id: string | null) => void
}) {
  const { lang, t } = useI18n()
  const ref = useRef<HTMLDialogElement>(null)
  const index = images.findIndex((image) => image.id === activeId)
  const image = index === -1 ? undefined : images[index]
  const open = image !== undefined

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  const go = (step: number) => {
    if (images.length < 2 || index === -1) return
    onChange(images[(index + step + images.length) % images.length].id)
  }

  return (
    <dialog
      ref={ref}
      className={styles.lightbox}
      aria-label={t.project.gallery.dialog}
      onClose={() => onChange(null)}
      onClick={(event) => {
        if (event.target === event.currentTarget) onChange(null)
      }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') go(-1)
        if (event.key === 'ArrowRight') go(1)
      }}
    >
      {image && (
        <div className={styles.panel}>
          <div className={styles.controls}>
            <button type="button" className={styles.control} onClick={() => onChange(null)}>
              {t.project.gallery.close}
            </button>
            {images.length > 1 && (
              <>
                <button type="button" className={styles.control} onClick={() => go(-1)}>
                  <span aria-hidden="true">←</span> {t.project.gallery.previous}
                </button>
                <button type="button" className={styles.control} onClick={() => go(1)}>
                  {t.project.gallery.next} <span aria-hidden="true">→</span>
                </button>
              </>
            )}
          </div>
          <figure className={styles.large}>
            <img key={image.id} src={image.src} width={image.width} height={image.height} alt={image.alt[lang]} decoding="async" />
            <figcaption>
              {image.caption[lang]}
              <span className={styles.counter}>{fill(t.project.gallery.counter, { current: index + 1, total: images.length })}</span>
            </figcaption>
          </figure>
        </div>
      )}
    </dialog>
  )
}
