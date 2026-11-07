import { useLayoutEffect, useRef, type ImgHTMLAttributes } from 'react'
import { cx } from '../../utils/cx'
import { srcSetFor } from '../../utils/responsiveImage'
import styles from './RevealImage.module.scss'

/**
 * A picture that fades in (and settles from slightly smaller) as it arrives, instead of popping in
 * line by line. The box is the image's own width and height, so nothing moves when it loads; an image
 * that is already in the cache or already decoded is shown at once with no effect; and if the picture
 * fails to load the broken-image state is shown as it always was, never a permanent blank. Without
 * script, with reduced motion and for any image that is not loading the markup is a plain <img>.
 * Only opacity and transform animate, over the motion tokens.
 */
export function RevealImage({
  className,
  alt,
  srcSet,
  sizes,
  ...rest
}: ImgHTMLAttributes<HTMLImageElement> & { alt: string }) {
  const ref = useRef<HTMLImageElement>(null)

  useLayoutEffect(() => {
    const image = ref.current
    if (!image || image.complete) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    image.dataset.state = 'loading'
    const done = () => {
      image.dataset.state = 'loaded'
    }
    image.addEventListener('load', done, { once: true })
    image.addEventListener('error', done, { once: true })
    return () => {
      image.removeEventListener('load', done)
      image.removeEventListener('error', done)
    }
  }, [])

  // A picture with smaller copies is offered at all of them (utils/responsiveImage.ts); `sizes` says how wide the page draws it.
  // `srcSet=""` opts out (the lightbox shows the original).
  const set = srcSet === '' ? undefined : (srcSet ?? (typeof rest.src === 'string' ? srcSetFor(rest.src, typeof rest.width === 'number' ? rest.width : undefined) : undefined))
  return <img ref={ref} className={cx(styles.image, className)} alt={alt} srcSet={set} sizes={set ? (sizes ?? '100vw') : undefined} {...rest} />
}
