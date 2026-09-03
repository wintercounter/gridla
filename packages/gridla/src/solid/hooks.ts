import { createMemo, from, type Accessor } from 'solid-js'

import type { GridItem, GridLayout, GridRect } from '../core'
import type { GridActions, GridInteraction, GridPreview, GridState } from '../interaction/types'
import { useGridContext } from './context'

const EMPTY_RECT: GridRect = { x: 0, y: 0, w: 0, h: 0 }

/** A plain value or an accessor for it. Item ids may be given either way. */
export type MaybeAccessor<T> = T | Accessor<T>

function access<T>(value: MaybeAccessor<T>): T {
  return typeof value === 'function' ? (value as Accessor<T>)() : value
}

/**
 * Subscribe to a slice of provider state. Returns an accessor that notifies
 * only when the selected value changes (by `Object.is`, or `isEqual`). Built
 * with `from()` over the controller store, so it follows Solid's ownership
 * rules and unsubscribes with the component.
 */
export function useGridStore<TData = unknown, TSlice = GridState<TData>>(
  selector: (state: GridState<TData>) => TSlice = (state) => state as unknown as TSlice,
  isEqual: (a: TSlice, b: TSlice) => boolean = Object.is,
): Accessor<TSlice> {
  const { store } = useGridContext<TData>()
  const state = from<GridState<TData>>(
    (set) => store.subscribe(() => set(() => store.getSnapshot())),
    store.getSnapshot(),
  )
  // Solid's server build ignores the initial value, so fall back to the store.
  return createMemo(() => selector(state() ?? store.getSnapshot()), undefined, {
    equals: isEqual,
  })
}

function rectsEqual(a: GridRect | null, b: GridRect | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h
}

function itemViewsEqual(a: GridItemView, b: GridItemView): boolean {
  return (
    rectsEqual(a.rect, b.rect) &&
    rectsEqual(a.baseRect, b.baseRect) &&
    rectsEqual(a.activeRect, b.activeRect) &&
    a.isActive === b.isActive &&
    a.isSelected === b.isSelected &&
    a.isShifted === b.isShifted &&
    a.isTransferring === b.isTransferring &&
    a.interaction === b.interaction
  )
}

/** Imperative layout and selection actions. Stable for the provider's lifetime. */
export function useGridActions<TData = unknown>(): GridActions<TData> {
  return useGridContext<TData>().actions
}

/** The rendered layout (projected onto the measured canvas size). */
export function useGridLayout<TData = unknown>(): Accessor<GridLayout<TData>> {
  return useGridStore<TData, GridLayout<TData>>(selectLayout)
}

/** The layout the provider was given, in its own coordinates. */
export function useGridSourceLayout<TData = unknown>(): Accessor<GridLayout<TData>> {
  return useGridStore<TData, GridLayout<TData>>(selectSource)
}

/** The layout that should be painted right now: the preview during a gesture, else the rendered layout. */
export function useGridVisibleLayout<TData = unknown>(): Accessor<GridLayout<TData>> {
  return useGridStore<TData, GridLayout<TData>>(selectVisibleLayout)
}

/** One item as it should be painted right now. `null` when absent. */
export function useGridItem<TData = unknown>(
  itemId: MaybeAccessor<string>,
): Accessor<GridItem<TData> | null> {
  return useGridStore<TData, GridItem<TData> | null>((state) => {
    const id = access(itemId)
    return selectVisibleLayout(state).items.find((item) => item.id === id) ?? null
  })
}

/**
 * Everything needed to paint one item: its current and pre-gesture rectangles
 * plus its active, selected, shifted, and transferring flags. Returned by
 * `useGridItemView`.
 */
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

/** Everything a rendered item needs, as one accessor that updates only when the view changes. */
export function useGridItemView<TData = unknown>(
  itemId: MaybeAccessor<string>,
): Accessor<GridItemView> {
  return useGridStore<TData, GridItemView>((state): GridItemView => {
    const id = access(itemId)
    const base = state.layout.items.find((item) => item.id === id)
    const previewItem = state.preview?.layout.items.find((item) => item.id === id)
    const baseRect = base ? { x: base.x, y: base.y, w: base.w, h: base.h } : EMPTY_RECT
    const shown = previewItem ?? base
    const rect = shown ? { x: shown.x, y: shown.y, w: shown.w, h: shown.h } : EMPTY_RECT
    const isActive = state.interaction?.itemId === id
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
      isSelected: state.selectedId === id,
      isShifted,
      isTransferring: isActive && state.transferring,
      interaction: isActive ? state.interaction : null,
    }
  }, itemViewsEqual)
}

/** The gesture in progress, or `null` when idle. */
export function useGridInteractionState(): Accessor<GridInteraction | null> {
  return useGridStore(selectInteraction)
}

/** The solver's latest preview for the gesture in progress, or `null` when idle. */
export function useGridPreview<TData = unknown>(): Accessor<GridPreview<TData> | null> {
  return useGridStore<TData, GridPreview<TData> | null>(selectPreview)
}

/** Id of the selected item, or `null` when nothing is selected. */
export function useGridSelection(): Accessor<string | null> {
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
