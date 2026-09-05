import type { GridRect } from 'gridla'
import type { GridInteraction, GridState } from 'gridla/interaction'

const EMPTY_RECT: GridRect = { x: 0, y: 0, w: 0, h: 0 }

/**
 * Everything needed to paint one item: its current and pre-gesture rectangles
 * plus its active, selected, shifted, and transferring flags. Returned by
 * `injectGridItemView` and `GridController.itemView`.
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

function rectsEqual(a: GridRect | null, b: GridRect | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h
}

/** Structural equality for `GridItemView`, used to skip redundant signal updates. */
export function itemViewsEqual(a: GridItemView, b: GridItemView): boolean {
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

/** Derive the `GridItemView` of `itemId` from controller state. */
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
