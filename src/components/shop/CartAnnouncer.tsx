import { getAddon } from '../../content/services/addons'
import { useI18n } from '../../i18n/useI18n'
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
  const { lang } = useI18n()

  const name = notice?.need ? common.needs[notice.need].title : ''
  const extras = notice?.dropped.map((id) => getAddon(id).name[lang]).join(', ') ?? ''
  const message = notice ? fill(common.announce[notice.kind], { name, extras }) : ''

  return (
    <div className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
      {message}
    </div>
  )
}
