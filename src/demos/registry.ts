import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import type { DemoType } from './ids'

/**
 * The one place a demo type becomes code: a FIXED table of lazy imports. There is no lookup by a string from outside, no dynamic import of a variable, and no component
 * is created from data; a type the table does not have has no component (`demoComponent` answers `null`). Each demo is its own chunk, so the portfolio's pages
 * never pay for them and a demo's code arrives only when its page is opened.
 */
type Loader = () => Promise<{ default: ComponentType }>

const LOADERS: Readonly<Record<DemoType, Loader>> = {
  'finance-workbench': () => import('./finance/FinanceDemo'),
  'booking-flow': () => import('./booking/BookingDemo'),
  'shipment-board': () => import('./shipments/ShipmentDemo'),
}

export const DEMO_COMPONENTS: Readonly<Record<DemoType, LazyExoticComponent<ComponentType>>> = {
  'finance-workbench': lazy(LOADERS['finance-workbench']),
  'booking-flow': lazy(LOADERS['booking-flow']),
  'shipment-board': lazy(LOADERS['shipment-board']),
}

const owns = (type: string): type is DemoType => Object.prototype.hasOwnProperty.call(LOADERS, type)

export function demoComponent(type: string): LazyExoticComponent<ComponentType> | null {
  return owns(type) ? DEMO_COMPONENTS[type] : null
}

/**
 * A new lazy component for a type, for a retry: a lazy component that failed to load stays failed for ever, so "try again" needs a new one (the browser
 * fetches the chunk again; a failed fetch is not kept).
 */
export function freshDemoComponent(type: string): LazyExoticComponent<ComponentType> | null {
  return owns(type) ? lazy(LOADERS[type]) : null
}
