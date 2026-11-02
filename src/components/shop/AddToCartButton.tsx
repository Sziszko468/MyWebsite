import type { NeedId } from '../../content/services/ids'
import { cartActions } from '../../shop/cartStore'
import { hasLine } from '../../shop/cart'
import { useCart, useCommonText } from '../../shop/hooks'
import { SHOP_PATHS } from '../../shop/paths'
import { Button } from '../Button/Button'
import { CheckIcon } from './icons'
import styles from './AddToCartButton.module.scss'

interface AddToCartButtonProps {
  need: NeedId
  /** The service's name, spoken after the label so several buttons on a page can be told apart. */
  name: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

/**
 * Puts a service in the cart in one tap. Once it is in, the button says so and becomes the way to
 * the cart ("In your cart" with a tick, never only a colour), so the feedback is where the finger
 * just was. The package and add-ons are chosen later, in the cart or the request builder.
 */
export function AddToCartButton({ need, name, size = 'md', className }: AddToCartButtonProps) {
  const common = useCommonText()
  const inCart = hasLine(useCart(), need)

  if (inCart) {
    return (
      <Button to={SHOP_PATHS.cart} variant="secondary" size={size} className={className}>
        <span className={styles.done}>
          <CheckIcon />
          {common.action.inCart}
        </span>
        <span className="visually-hidden">
          {' '}
          — {name}. {common.action.viewCart}
        </span>
      </Button>
    )
  }

  return (
    <Button variant="secondary" size={size} className={className} onClick={() => cartActions.add(need)}>
      {common.action.addToCart}
      <span className="visually-hidden"> — {name}</span>
    </Button>
  )
}
