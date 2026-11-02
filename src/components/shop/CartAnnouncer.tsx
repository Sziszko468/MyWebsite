import { useCartNotice, useCommonText } from '../../shop/hooks'
import { fill } from '../../utils/format'

/**
 * Tells a screen reader what happened to the cart ("Website Development was added to your
 * cart"), since the cart icon itself only changes a number. Rendered once, in the header; it
 * shows nothing.
 */
export function CartAnnouncer() {
  const notice = useCartNotice()
  const common = useCommonText()

  const name = notice?.need ? common.needs[notice.need].title : ''
  const message = notice ? fill(common.announce[notice.kind], { name }) : ''

  return (
    <div className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
      {message}
    </div>
  )
}
