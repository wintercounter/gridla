import { createContext, useContext, type Accessor } from 'solid-js'

import type { GridController } from '../interaction/controller'
import type { GridStore } from '../interaction/store'
import type { TransferScope } from '../interaction/transfer'
import type {
  GridActions,
  GridControllerConfig,
  GridGestureApi,
  GridState,
} from '../interaction/types'

/**
 * Value provided by `GridProvider`: its id, the state store, the imperative
 * actions, the resolved config as an accessor, the gesture API, and the
 * underlying `GridController` from `gridla/interaction`.
 */
export type GridContextValue<TData = unknown> = {
  /** Unique id of this provider. Used by transfer scopes. */
  id: string
  store: GridStore<GridState<TData>>
  actions: GridActions<TData>
  /** The resolved configuration; tracks the provider's props. */
  config: Accessor<GridControllerConfig>
  /** Low-level gesture API used by `GridCanvas`. */
  gesture: GridGestureApi<TData>
  /** The controller the provider is built on. */
  controller: GridController<TData>
}

export const GridContext = createContext<GridContextValue | null>(null)

/** Read the nearest `GridProvider` context. Throws when called outside a provider. */
export function useGridContext<TData = unknown>(): GridContextValue<TData> {
  const value = useContext(GridContext)
  if (!value) {
    throw new Error('gridla/solid: this component must be rendered inside <GridProvider>')
  }
  return value as unknown as GridContextValue<TData>
}

export const TransferScopeContext = createContext<TransferScope | null>(null)

/** The nearest `GridTransferScope`, or `null` when there is none. */
export function useTransferScope(): TransferScope | null {
  return useContext(TransferScopeContext) ?? null
}
