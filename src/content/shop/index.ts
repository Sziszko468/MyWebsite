import { cart } from './cart'
import { common } from './common'
import { configurator } from './configurator'
import { detail } from './detail'
import { landing } from './landing'

/** Every word of the shop, in three languages. Components read it through `useShopText()`. */
export const shopText = { common, landing, detail, configurator, cart }
export type ShopText = typeof shopText
