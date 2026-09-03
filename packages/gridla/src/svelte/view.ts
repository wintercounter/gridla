import type { GridRect, GridResizeEdge } from 'gridla'
import {
  rectStyle as baseRectStyle,
  resizeHandleStyle as baseResizeHandleStyle,
  styleToText,
  type GridState,
} from 'gridla/interaction'

import type { GridItemView } from './types.js'

const EMPTY_RECT: GridRect = { x: 0, y: 0, w: 0, h: 0 }

/** Derive the `GridItemView` of `itemId` from a controller state snapshot. */
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

/** Structural equality of two rects (or both `null`). */
export function rectsEqual(a: GridRect | null, b: GridRect | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h
}

/** Structural equality of two item views; used to skip redundant updates. */
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

/** Inline style that places an element at `rect` inside a canvas. */
export function rectStyle(rect: GridRect, positioning: 'transform' | 'absolute'): string {
  return styleToText(baseRectStyle(rect, positioning))
}

/**
 * Inline style of a built-in resize handle. Handles sit fully inside the item
 * so they stay hit-testable when the item clips its overflow; the geometry
 * reads `--gridla-handle-size` and `--gridla-handle-inset` so CSS can resize
 * them. `size` is the fallback thickness.
 */
export function resizeHandleStyle(edge: GridResizeEdge, size = 10): string {
  return styleToText(baseResizeHandleStyle(edge, { size }))
}

/** Join style fragments, appending a consumer-supplied `style` attribute value. */
export function joinStyle(...parts: Array<string | null | undefined>): string {
  return parts
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .map((part) => (part.endsWith(';') ? part : `${part};`))
    .join('')
}
