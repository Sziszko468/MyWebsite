import { imageVariants } from '../content/imageVariants'

/*
 * How wide the project page really draws its pictures (measured at 13 widths from 320 to 1920 px, tools/audit/mobile/image-widths.cjs):
 * the lead screenshot is 89-92 vw below 64rem; from 64rem it is 48 vw for a tall picture and up to 1054 px for a wide one, so the
 * larger is claimed. The desktop gallery is 89-90 vw below 37.5rem, 44-45 vw up to 64rem, then 26-62 vw depending on the tile.
 * A `sizes` that claims less than the picture is drawn at makes the browser choose a copy that is then stretched (the layout
 * audit flags it as "image upscaled"); claiming a little more only costs a few kilobytes. The preload in the page's head and
 * the `<img>` must say the same thing.
 */
export const PROJECT_HERO_SIZES = '(min-width: 66rem) 1056px, 92vw'
export const GALLERY_DESKTOP_SIZES = '(min-width: 64rem) min(62vw, 1020px), (min-width: 37.5rem) 46vw, 92vw'
export const GALLERY_PHONE_SIZES = '(min-width: 48rem) 192px, 45vw'

/**
 * `srcset` for a picture that has smaller copies (tools/images/make-variants.cjs): the browser then downloads the copy
 * that fits the screen it is drawn on (a phone gets the 800 px picture, not the 1440 px one). A picture without copies
 * (a photo the administrator uploaded, which is stored as it was sent) gets nothing and loads as before.
 *
 * `width` is the intrinsic width the page declared for the original, used only when the list does not know it.
 */
export function srcSetFor(src: string, width?: number): string | undefined {
  const entry = imageVariants[src]
  if (!entry) return undefined
  const original = width ?? entry.width
  return [...entry.copies.map(([w, path]) => `${path} ${w}w`), `${src} ${original}w`].join(', ')
}
