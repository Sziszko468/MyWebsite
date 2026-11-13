import { cart } from './cart'
import { common } from './common'
import { configurator } from './configurator'
import { detail } from './detail'
import { experience } from './experience'
import { finder } from './finder'
import { landing } from './landing'
import { receipt } from './receipt'
import { tiers } from './tiers'

/** Every word of the shop, in three languages. Components read it through `useShopText()`. */
export const shopText = { common, landing, detail, configurator, cart, tiers, experience, receipt, finder }
export type ShopText = typeof shopText
