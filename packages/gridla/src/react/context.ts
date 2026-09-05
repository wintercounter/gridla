import { createContext, useContext } from 'react'

import type { GridItem, GridLayout, GridResizeEdge } from '../core'

import type { GridActions, GridPreview, GridProviderConfig, GridState } from './types'
import type { Store } from './store'

/**
 * Value provided by `GridProvider`: its id, the state store, the imperative
 * actions, the resolved config, and the internal gesture API.
 */
export type GridContextValue<TData = unknown> = {
  /** Unique id of this provider. Used by transfer scopes. */
  id: string
  store: Store<GridState<TData>>
  actions: GridActions<TData>
  config: GridProviderConfig
  /** Internal gesture API used by `useGridInteraction`. */
  gesture: GridGestureApi<TData>
}

/** Internal: low-level gesture control shared between hooks and components. */
export type GridGestureApi<TData = unknown> = {
  beginMove: (
    itemId: string,
    pointer: { x: number; y: number },
    pointerId: number | null,
  ) => boolean
  beginResize: (
    itemId: string,
    edge: GridResizeEdge,
    pointer: { x: number; y: number },
    pointerId: number | null,
  ) => boolean
  updateMove: (pointer: { x: number; y: number }, modifiers: { snap: boolean }) => void
  updateResize: (pointer: { x: number; y: number }, modifiers: { snap: boolean }) => void
  /** Show the active item leaving this canvas (during a transfer). */
  setTransferring: (transferring: boolean) => void
  commit: () => void
  cancel: () => void
  /** Preview a foreign item dropped at `pointer` (rendered coordinates). */
  previewIncoming: (
    item: GridItem<TData>,
    pointer: { x: number; y: number },
  ) => GridPreview<TData> | null
  clearIncoming: () => void
  /** Commit the current incoming preview. Returns the accepted layout or `null`. */
  commitIncoming: () => GridLayout<TData> | null
  /** Remove an item because it was transferred to another canvas. */
  completeOutgoing: (itemId: string) => void
  /** The canvas element, when mounted. */
  getElement: () => HTMLElement | null
  setElement: (element: HTMLElement | null) => void
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
