import type { GridRect, GridResizeEdge } from '../core'
import { resizeHandleStyle } from '../interaction/style'
import type { GridInteraction, GridState } from '../interaction/types'

/**
 * Everything needed to paint one item: its current and pre-gesture rectangles
 * plus its active, selected, shifted, and transferring flags. Passed to
 * `renderItem` and computed by `selectItemView`.
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

const EMPTY_RECT: GridRect = { x: 0, y: 0, w: 0, h: 0 }

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

/** Compare two rects by value; `null` equals only `null`. */
export function rectsEqual(a: GridRect | null, b: GridRect | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h
}

/** Compare two item views by value. */
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

/** How an element is placed: with a `transform` (default) or with `left`/`top`. */
export type GridPositioning = 'transform' | 'absolute'

/** Write `rect` onto `element.style` as absolute geometry. */
export function applyRect(element: HTMLElement, rect: GridRect, positioning: GridPositioning) {
  const style = element.style
  style.position = 'absolute'
  style.boxSizing = 'border-box'
  style.width = `${rect.w}px`
  style.height = `${rect.h}px`
  if (positioning === 'absolute') {
    style.left = `${rect.x}px`
    style.top = `${rect.y}px`
    style.transform = ''
  } else {
    style.left = '0px'
    style.top = '0px'
    style.transform = `translate(${rect.x}px, ${rect.y}px)`
  }
}

/**
 * Style a built-in resize handle for `edge`. Handles sit fully inside the item
 * so they stay hit-testable when the item clips its overflow.
 */
export function styleResizeHandle(element: HTMLElement, edge: GridResizeEdge, size?: number) {
  Object.assign(element.style, resizeHandleStyle(edge, { size }))
  element.style.zIndex = '1'
}

/** Set a boolean data attribute: present (empty) when `on`, absent otherwise. */
export function toggleAttribute(element: Element, name: string, on: boolean) {
  if (on) {
    if (!element.hasAttribute(name)) element.setAttribute(name, '')
  } else if (element.hasAttribute(name)) {
    element.removeAttribute(name)
  }
}
