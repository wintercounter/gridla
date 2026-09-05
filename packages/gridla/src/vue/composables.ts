import {
  onScopeDispose,
  readonly,
  shallowRef,
  toValue,
  watch,
  type MaybeRefOrGetter,
  type ShallowRef,
} from 'vue'

import type { GridItem, GridLayout, GridRect } from '../core'
import type { GridActions, GridInteraction, GridPreview, GridState } from '../interaction/types'
import { useGridContext } from './context'
import type { GridItemView } from './types'

const EMPTY_RECT: GridRect = { x: 0, y: 0, w: 0, h: 0 }

/**
 * A read-only shallow ref: the value is replaced as a whole, its contents are
 * never made reactive. Returned by every store composable.
 */
export type GridSliceRef<T> = Readonly<ShallowRef<T>>

function useSlice<TData, TSlice>(
  selector: () => TSlice,
  isEqual: (a: TSlice, b: TSlice) => boolean,
  deps?: () => unknown,
): GridSliceRef<TSlice> {
  const { store } = useGridContext<TData>()
  const slice = shallowRef(selector()) as ShallowRef<TSlice>
  const refresh = () => {
    const next = selector()
    if (!isEqual(slice.value, next)) slice.value = next
  }
  const unsubscribe = store.subscribe(refresh)
  onScopeDispose(unsubscribe)
  if (deps) watch(deps, refresh, { flush: 'sync' })
  return readonly(slice) as GridSliceRef<TSlice>
}

/**
 * Subscribe to a slice of provider state. The returned ref updates only when
 * the selected value changes (by `Object.is`, or `isEqual` when given). The
 * subscription ends with the calling component or effect scope.
 */
export function useGridStore<TData = unknown, TSlice = GridState<TData>>(
  selector: (state: GridState<TData>) => TSlice = (state) => state as unknown as TSlice,
  isEqual: (a: TSlice, b: TSlice) => boolean = Object.is,
): GridSliceRef<TSlice> {
  const { store } = useGridContext<TData>()
  return useSlice<TData, TSlice>(() => selector(store.getSnapshot()), isEqual)
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
export function useGridLayout<TData = unknown>(): GridSliceRef<GridLayout<TData>> {
  return useGridStore<TData, GridLayout<TData>>(selectLayout)
}

/** The layout the provider was given, in its own coordinates. */
export function useGridSourceLayout<TData = unknown>(): GridSliceRef<GridLayout<TData>> {
  return useGridStore<TData, GridLayout<TData>>(selectSource)
}

/** The layout that should be painted right now: the preview during a gesture, else the rendered layout. */
export function useGridVisibleLayout<TData = unknown>(): GridSliceRef<GridLayout<TData>> {
  return useGridStore<TData, GridLayout<TData>>(selectVisibleLayout)
}

/** One item as it should be painted right now. `null` when absent. Accepts a ref or getter for the id. */
export function useGridItem<TData = unknown>(
  itemId: MaybeRefOrGetter<string>,
): GridSliceRef<GridItem<TData> | null> {
  const { store } = useGridContext<TData>()
  return useSlice<TData, GridItem<TData> | null>(
    () => {
      const id = toValue(itemId)
      return selectVisibleLayout(store.getSnapshot()).items.find((item) => item.id === id) ?? null
    },
    Object.is,
    () => toValue(itemId),
  )
}

/** Select the `GridItemView` of `itemId` from a state snapshot. */
export function selectItemView<TData>(state: GridState<TData>, itemId: string): GridItemView {
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
}

/**
 * Everything a rendered item needs, with minimal updates: the ref changes only
 * when a rect or flag differs. Accepts a ref or getter for the id.
 */
export function useGridItemView<TData = unknown>(
  itemId: MaybeRefOrGetter<string>,
): GridSliceRef<GridItemView> {
  const { store } = useGridContext<TData>()
  return useSlice<TData, GridItemView>(
    () => selectItemView(store.getSnapshot(), toValue(itemId)),
    itemViewsEqual,
    () => toValue(itemId),
  )
}

/** The gesture in progress, or `null` when idle. */
export function useGridInteractionState(): GridSliceRef<GridInteraction | null> {
  return useGridStore(selectInteraction)
}

/** The solver's latest preview for the gesture in progress, or `null` when idle. */
export function useGridPreview<TData = unknown>(): GridSliceRef<GridPreview<TData> | null> {
  return useGridStore<TData, GridPreview<TData> | null>(selectPreview)
}

/** Id of the selected item, or `null` when nothing is selected. */
export function useGridSelection(): GridSliceRef<string | null> {
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
