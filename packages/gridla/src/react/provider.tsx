import { useEffect, useId, useMemo, useState, type ReactNode } from 'react'

import type { GridItem, GridLayout, GridSize, SolveOptions } from '../core'
import {
  createGridController,
  renderLayout,
  resolveControllerConfig,
  type GridControllerOptions,
} from '../interaction/controller'
import type { GridState } from '../interaction/types'
import { GridContext, type GridContextValue } from './context'
import type { Store } from './store'
import { useTransferScope } from './transfer-context'
import type { GridChangeDetail, GridProviderConfig } from './types'

/**
 * Props for `GridProvider`: every `SolveOptions` field, a controlled or
 * uncontrolled layout, change and transfer callbacks, and `GridProviderConfig`
 * overrides.
 */
export type GridProviderProps<TData = unknown> = SolveOptions & {
  /** Controlled layout. Pair with `onLayoutChange`. */
  layout?: GridLayout<TData>
  /** Initial layout for uncontrolled use. */
  defaultLayout?: GridLayout<TData>
  /**
   * Called with the next layout after every accepted change. The layout is
   * expressed in the canvas size it was rendered at.
   */
  onLayoutChange?: (layout: GridLayout<TData>, detail: GridChangeDetail) => void
  /** Fires with the solver strategy on every accepted interactive commit. */
  onCommit?: (detail: GridChangeDetail) => void
  /** Called when an item moves to another canvas inside a `GridTransferScope`. */
  onTransferOut?: (itemId: string, targetId: string) => void
  /** Called when an item arrives from another canvas. */
  onTransferIn?: (item: GridItem<TData>, sourceId: string) => void
  /** Whether items from other canvases may be dropped here. Default `true`. */
  acceptTransfers?: boolean | ((item: GridItem<TData>, sourceId: string) => boolean)
  responsive?: boolean
  dragThreshold?: number
  keyboardStep?: number
  /** Controlled selection. */
  selectedId?: string | null
  onSelectedIdChange?: (itemId: string | null) => void
  children?: ReactNode
}

/**
 * Owns layout state and gesture state for one canvas. Place a `GridCanvas`
 * (or your own element wired with `useGridInteraction`) inside it. A binding
 * over `createGridController` from `gridla/interaction`.
 */
export function GridProvider<TData = unknown>(props: GridProviderProps<TData>) {
  const { children, ...rest } = props
  const id = useId()
  const scope = useTransferScope()
  const options: GridControllerOptions<TData> = { ...rest, id, scope }

  const [controller] = useState(() => createGridController<TData>(options))
  // Forward prop changes after every render: callbacks, config, the controlled
  // layout and selection. The controller compares and only touches the store
  // when something changed.
  useEffect(() => {
    controller.setOptions(options)
  })
  useEffect(() => () => controller.destroy(), [controller])

  const {
    responsive = true,
    dragThreshold = 4,
    keyboardStep = 8,
    gap = 0,
    snapDistance,
    snap,
    onTrace,
  } = rest
  const config = useMemo<GridProviderConfig>(
    () =>
      resolveControllerConfig({
        responsive,
        dragThreshold,
        keyboardStep,
        gap,
        snapDistance,
        snap,
        onTrace,
      }),
    [responsive, dragThreshold, keyboardStep, gap, snapDistance, snap, onTrace],
  )

  const value = useMemo<GridContextValue<TData>>(
    () => ({
      id,
      store: controller.store,
      actions: controller.actions,
      config,
      gesture: controller.gesture,
      controller,
    }),
    [id, controller, config],
  )

  return (
    <GridContext.Provider value={value as unknown as GridContextValue}>
      {children}
    </GridContext.Provider>
  )
}

/** Update the measured size. Used by `GridCanvas`; exposed for custom canvases. */
export function applyMeasuredSize<TData>(
  store: Store<GridState<TData>>,
  size: GridSize | null,
  config: GridProviderConfig,
) {
  const state = store.getSnapshot()
  if (state.size && size && state.size.w === size.w && state.size.h === size.h) return
  store.set({ ...state, size, layout: renderLayout(state.source, size, config) })
}
