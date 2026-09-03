import type { CSSProperties } from '@builder.io/qwik'

import type { GridRect, GridResizeEdge } from '../core'
import type { GridInteraction, GridState } from '../interaction/types'

const EMPTY_RECT: GridRect = { x: 0, y: 0, w: 0, h: 0 }

/**
 * Everything needed to paint one item: its current and pre-gesture rectangles
 * plus its active, selected, shifted, and transferring flags. Returned by
 * `useGridItemView` and derived from the provider state by `selectItemView`.
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

/** Derive the `GridItemView` of `itemId` from a state snapshot. Pure. */
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

/** How an item or preview box is positioned: with `transform` (default) or with `left`/`top`. */
export type GridPositioning = 'transform' | 'absolute'

const px = (value: number) => `${value}px`

/** Geometry styles for a rect inside the canvas. */
export function rectStyle(rect: GridRect, positioning: GridPositioning): CSSProperties {
  if (positioning === 'absolute') {
    return {
      position: 'absolute',
      left: px(rect.x),
      top: px(rect.y),
      width: px(rect.w),
      height: px(rect.h),
    }
  }
  return {
    position: 'absolute',
    left: '0px',
    top: '0px',
    width: px(rect.w),
    height: px(rect.h),
    transform: `translate(${rect.x}px, ${rect.y}px)`,
  }
}

const EDGE_CURSORS: Record<GridResizeEdge, string> = {
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  nw: 'nwse-resize',
  se: 'nwse-resize',
}

/** Styles for a built-in resize handle. Handles sit fully inside the item. */
export function resizeHandleStyle(edge: GridResizeEdge, size = 10): CSSProperties {
  const base: CSSProperties = {
    position: 'absolute',
    cursor: EDGE_CURSORS[edge],
    touchAction: 'none',
  }
  const vertical = edge === 'n' || edge === 's'
  const horizontal = edge === 'e' || edge === 'w'
  if (vertical) {
    return {
      ...base,
      left: px(size),
      right: px(size),
      height: px(size),
      [edge === 'n' ? 'top' : 'bottom']: '0px',
    }
  }
  if (horizontal) {
    return {
      ...base,
      top: px(size),
      bottom: px(size),
      width: px(size),
      [edge === 'w' ? 'left' : 'right']: '0px',
    }
  }
  return {
    ...base,
    width: px(size),
    height: px(size),
    [edge.includes('n') ? 'top' : 'bottom']: '0px',
    [edge.includes('w') ? 'left' : 'right']: '0px',
  }
}
