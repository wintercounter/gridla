import { createContext, useContext } from 'react'

import type { GridController } from '../interaction/controller'
import type { GridActions, GridGestureApi, GridState } from '../interaction/types'
import type { Store } from './store'
import type { GridProviderConfig } from './types'

/**
 * Value provided by `GridProvider`: its id, the state store, the imperative
 * actions, the resolved config, the internal gesture API, and the underlying
 * `GridController` from `gridla/interaction`.
 */
export type GridContextValue<TData = unknown> = {
  /** Unique id of this provider. Used by transfer scopes. */
  id: string
  store: Store<GridState<TData>>
  actions: GridActions<TData>
  config: GridProviderConfig
  /** Internal gesture API used by `useGridInteraction`. */
  gesture: GridGestureApi<TData>
  /** The controller the provider is built on. */
  controller: GridController<TData>
}

export const GridContext = createContext<GridContextValue | null>(null)

/** Read the nearest `GridProvider` context. Throws when called outside a provider. */
export function useGridContext<TData = unknown>(): GridContextValue<TData> {
  const value = useContext(GridContext)
  if (!value) {
    throw new Error('gridla/react: this component must be rendered inside <GridProvider>')
  }
  return value as unknown as GridContextValue<TData>
}
