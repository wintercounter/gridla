import { inject, type ComputedRef, type InjectionKey } from 'vue'

import type { GridController } from '../interaction/controller'
import type { TransferScope } from '../interaction/transfer'
import type {
  GridActions,
  GridControllerConfig,
  GridGestureApi,
  GridState,
} from '../interaction/types'
import type { GridStore } from '../interaction/store'

/**
 * Value provided by `GridProvider` to its descendants: its id, the state
 * store, the imperative actions, the resolved config (reactive), the internal
 * gesture API, and the underlying `GridController` from `gridla/interaction`.
 */
export type GridContextValue<TData = unknown> = {
  /** Unique id of this provider. Used by transfer scopes. */
  id: string
  store: GridStore<GridState<TData>>
  actions: GridActions<TData>
  /** Resolved configuration; follows the provider's props. */
  config: ComputedRef<GridControllerConfig>
  /** Internal gesture API used by `GridCanvas`. */
  gesture: GridGestureApi<TData>
  /** The controller the provider is built on. */
  controller: GridController<TData>
}

/** Injection key under which `GridProvider` provides its `GridContextValue`. */
export const GRID_CONTEXT_KEY: InjectionKey<GridContextValue> = Symbol.for('gridla.vue.grid')

/** Injection key under which `GridTransferScope` provides its `TransferScope`. */
export const TRANSFER_SCOPE_KEY: InjectionKey<TransferScope> = Symbol.for('gridla.vue.transfer')

/**
 * Read the nearest `GridProvider` context. Throws when called outside a
 * provider. Call it during `setup()`.
 */
export function useGridContext<TData = unknown>(): GridContextValue<TData> {
  const value = inject(GRID_CONTEXT_KEY, null)
  if (!value) {
    throw new Error('gridla/vue: this component must be rendered inside <GridProvider>')
  }
  return value as unknown as GridContextValue<TData>
}

/** The nearest `GridTransferScope`'s scope, or `null` when there is none. Call it during `setup()`. */
export function useTransferScope(): TransferScope | null {
  return inject(TRANSFER_SCOPE_KEY, null)
}
