import { useLayoutEffect, useRef, type ImgHTMLAttributes } from 'react'
import { cx } from '../../utils/cx'
import styles from './RevealImage.module.scss'

/**
 * A picture that fades in (and settles from slightly smaller) as it arrives, instead of popping in
 * line by line. The box is the image's own width and height, so nothing moves when it loads; an image
 * that is already in the cache or already decoded is shown at once with no effect; and if the picture
 * fails to load the broken-image state is shown as it always was, never a permanent blank. Without
 * script, with reduced motion and for any image that is not loading the markup is a plain <img>.
 * Only opacity and transform animate, over the motion tokens.
 */
export function RevealImage({ className, alt, ...rest }: ImgHTMLAttributes<HTMLImageElement> & { alt: string }) {
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

  return <img ref={ref} className={cx(styles.image, className)} alt={alt} {...rest} />
}
