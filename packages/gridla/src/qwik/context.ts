import { createContextId, useContext, type NoSerialize, type Signal } from '@builder.io/qwik'

import type { GridController } from '../interaction/controller'
import type { TransferScope } from '../interaction/transfer'
import type { GridState } from '../interaction/types'

/**
 * Client-only handles kept in a Qwik store. Neither the controller nor the
 * transfer scope can be serialized, so they are created in a visible task and
 * stored with `noSerialize`; they are `undefined` on the server and until the
 * provider has mounted.
 */
export type GridRuntime<TData = unknown> = {
  /** Unique id of this provider. Used by transfer scopes. */
  id: string
  /** Whether the layout is projected onto the measured canvas size. */
  responsive: boolean
  /** The controller the provider is built on. Client only. */
  controller: NoSerialize<GridController<TData>> | undefined
  /** The transfer scope the provider registered with, if any. Client only. */
  scope: NoSerialize<TransferScope> | undefined
}

/**
 * Value provided by `GridProvider`: a serializable mirror of the controller
 * state (so the server render and the resumed client agree) plus the
 * client-only runtime handles.
 */
export type GridContextValue<TData = unknown> = {
  /** Latest `GridState` snapshot. Serializable; updated after every store change. */
  state: Signal<GridState<TData>>
  runtime: GridRuntime<TData>
}

/** Context id for the nearest `GridProvider`. */
export const GridContextId = createContextId<GridContextValue>('gridla.grid')

/** Read the nearest `GridProvider` context. Throws when called outside a provider. */
export function useGridContext<TData = unknown>(): GridContextValue<TData> {
  const value = useContext(GridContextId, null)
  if (!value) {
    throw new Error('gridla/qwik: this component must be rendered inside <GridProvider>')
  }
  return value as unknown as GridContextValue<TData>
}

/**
 * Value provided by `GridTransferScope`. The scope itself is created lazily
 * by the first provider that mounts on the client.
 */
export type TransferContextValue = {
  scope: NoSerialize<TransferScope> | undefined
}

/** Context id for the nearest `GridTransferScope`. */
export const TransferScopeContextId = createContextId<TransferContextValue>('gridla.transfer')
