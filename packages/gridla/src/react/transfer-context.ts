import { createContext, useContext } from 'react'

import type { GridItem, GridPoint } from '../core'
import type { GridGestureApi } from './context'
import type { Store } from './store'
import type { GridState } from './types'

/** Internal registration of one canvas inside a `GridTransferScope`. */
export type TransferRegistration = {
  id: string
  getElement: () => HTMLElement | null
  accepts: (item: GridItem, sourceId: string) => boolean
  gesture: GridGestureApi
  store: Store<GridState>
  notifyTransferOut: (itemId: string, targetId: string) => void
  notifyTransferIn: (item: GridItem, sourceId: string) => void
}

export type TransferScopeValue = {
  register: (registration: TransferRegistration) => () => void
  /** Called by the source canvas on every pointer move during a drag. */
  track: (sourceId: string, itemId: string, client: GridPoint) => void
  /** Called by the source canvas on release. Returns true when a transfer happened. */
  drop: (sourceId: string) => boolean
  cancel: () => void
}

export const TransferScopeContext = createContext<TransferScopeValue | null>(null)

export function useTransferScope(): TransferScopeValue | null {
  return useContext(TransferScopeContext)
}
