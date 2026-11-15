import { createContext } from 'react'
import type { CustomerView, PortalConfig, SessionData } from './api'

/** What the portal knows about who is signed in. The provider is in session.tsx, the hooks in usePortal.ts. */
export type PortalState =
  | { status: 'loading' }
  | { status: 'unusable' }
  | { status: 'anonymous'; config: PortalConfig | null; ended: boolean }
  | { status: 'signedIn'; config: PortalConfig | null; session: SessionData }

export interface PortalContextValue {
  state: PortalState
  /** The customer has signed in (a link was opened): from here on the session is theirs. */
  adopt: (customer: CustomerView, csrfToken: string, features?: SessionData['features']) => void
  /** The server said the sign-in is over. */
  ended: () => void
  signOut: () => Promise<void>
  updateCustomer: (customer: CustomerView) => void
  refresh: () => void
}

export const PortalContext = createContext<PortalContextValue | null>(null)
