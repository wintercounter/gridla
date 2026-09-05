import { useComputed$, type ReadonlySignal } from '@builder.io/qwik'

import type { GridLayout } from '../core'
import type { GridState } from '../interaction/types'
import { useGridContext, type GridRuntime } from './context'
import { selectItemView, type GridItemView } from './view'

/**
 * The provider's `GridState` as a read-only signal. Reading `.value` in a
 * component subscribes it to every store change.
 */
export function useGridState<TData = unknown>(): ReadonlySignal<GridState<TData>> {
  return useGridContext<TData>().state
}

/** The layout that should be painted right now: the preview during a gesture, else the rendered layout. */
export function useGridVisibleLayout<TData = unknown>(): ReadonlySignal<GridLayout<TData>> {
  const { state } = useGridContext<TData>()
  return useComputed$(() => state.value.preview?.layout ?? state.value.layout)
}

/** Everything a rendered item needs, recomputed when the provider state changes. */
export function useGridItemView(itemId: string): ReadonlySignal<GridItemView> {
  const { state } = useGridContext()
  return useComputed$(() => selectItemView(state.value, itemId))
}

/**
 * The client-only runtime of the nearest provider: a Qwik store whose
 * `controller` is set once the provider has mounted (and `undefined` on the
 * server). Capture the store in event handlers and read
 * `runtime.controller?.actions` there for imperative layout and selection
 * changes.
 */
export function useGridRuntime<TData = unknown>(): GridRuntime<TData> {
  return useGridContext<TData>().runtime
}
