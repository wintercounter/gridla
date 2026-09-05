import { useCallback, useSyncExternalStore } from 'react'

import type { GridItem, GridLayout, GridRect } from '../core'
import { useGridContext } from './context'
import type { GridActions, GridInteraction, GridPreview, GridState } from './types'

const EMPTY_RECT: GridRect = { x: 0, y: 0, w: 0, h: 0 }

/**
 * Subscribe to a slice of provider state. Rerenders only when the selected
 * value changes (by `Object.is`).
 */
export function useGridStore<TData = unknown, TSlice = GridState<TData>>(
  selector: (state: GridState<TData>) => TSlice = (state) => state as unknown as TSlice,
): TSlice {
  const { store } = useGridContext<TData>()
  const getSlice = useCallback(() => selector(store.getSnapshot()), [store, selector])
  return useSyncExternalStore(store.subscribe, getSlice, getSlice)
}

/** Imperative layout and selection actions. Stable for the provider's lifetime. */
export function useGridActions<TData = unknown>(): GridActions<TData> {
  return useGridContext<TData>().actions
}

/** The rendered layout (projected onto the measured canvas size). */
export function useGridLayout<TData = unknown>(): GridLayout<TData> {
  return useGridStore<TData, GridLayout<TData>>(selectLayout)
}

/** The layout the provider was given, in its own coordinates. */
export function useGridSourceLayout<TData = unknown>(): GridLayout<TData> {
  return useGridStore<TData, GridLayout<TData>>(selectSource)
}

/** The layout that should be painted right now: the preview during a gesture, else the rendered layout. */
export function useGridVisibleLayout<TData = unknown>(): GridLayout<TData> {
  return useGridStore<TData, GridLayout<TData>>(selectVisibleLayout)
}

/** One item as it should be painted right now. `null` when absent. */
export function useGridItem<TData = unknown>(itemId: string): GridItem<TData> | null {
  const select = useCallback(
    (state: GridState<TData>) =>
      selectVisibleLayout(state).items.find((item) => item.id === itemId) ?? null,
    [itemId],
  )
  return useGridStore<TData, GridItem<TData> | null>(select)
}

export type GridItemView = {
  /** Where the item is painted right now (preview-aware). */
  rect: GridRect
  /** Where the item was before the current gesture. */
  baseRect: GridRect
  /** Cursor-tracked rect while this item is active; `null` otherwise. */
  activeRect: GridRect | null
  isActive: boolean
  isSelected: boolean
  /** True when this item moved in the preview because another item pushed it. */
  isShifted: boolean
  /** True while the active item is being previewed in another canvas. */
  isTransferring: boolean
  interaction: GridInteraction | null
}

/** Everything a rendered item needs, with minimal rerenders. */
export function useGridItemView<TData = unknown>(itemId: string): GridItemView {
  const select = useCallback(
    (state: GridState<TData>): GridItemView => {
      const base = state.layout.items.find((item) => item.id === itemId)
      const previewItem = state.preview?.layout.items.find((item) => item.id === itemId)
      const baseRect = base ? { x: base.x, y: base.y, w: base.w, h: base.h } : EMPTY_RECT
      const shown = previewItem ?? base
      const rect = shown ? { x: shown.x, y: shown.y, w: shown.w, h: shown.h } : EMPTY_RECT
      const isActive = state.interaction?.itemId === itemId
      const isShifted =
        !isActive &&
        !!previewItem &&
        !!base &&
        (previewItem.x !== base.x ||
          previewItem.y !== base.y ||
          previewItem.w !== base.w ||
          previewItem.h !== base.h)
      return {
        rect,
        baseRect,
        activeRect: isActive ? state.activeRect : null,
        isActive,
        isSelected: state.selectedId === itemId,
        isShifted,
        isTransferring: isActive && state.transferring,
        interaction: isActive ? state.interaction : null,
      }
    },
    [itemId],
  )
  return useGridStore<TData, GridItemView>(select)
}

export function useGridInteractionState(): GridInteraction | null {
  return useGridStore(selectInteraction)
}

export function useGridPreview<TData = unknown>(): GridPreview<TData> | null {
  return useGridStore<TData, GridPreview<TData> | null>(selectPreview)
}

export function useGridSelection(): string | null {
  return useGridStore(selectSelectedId)
}

function selectLayout<TData>(state: GridState<TData>) {
  return state.layout
}
function selectSource<TData>(state: GridState<TData>) {
  return state.source
}
function selectVisibleLayout<TData>(state: GridState<TData>) {
  return state.preview?.layout ?? state.layout
}
function selectInteraction<TData>(state: GridState<TData>) {
  return state.interaction
}
function selectPreview<TData>(state: GridState<TData>) {
  return state.preview
}
function selectSelectedId<TData>(state: GridState<TData>) {
  return state.selectedId
}
