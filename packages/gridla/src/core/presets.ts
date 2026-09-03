/**
 * Layout presets: arrange items into rows, columns, or a grid that fills the
 * canvas, preserving each item's size constraints.
 */

import { canvasInnerHeight, canvasInnerWidth, inferGap } from './geometry'
import type { GridItem, GridItemSize, GridLayout } from './model'

/**
 * Arrangement produced by `applyPreset`: full-width rows stacked vertically,
 * full-height columns side by side, or a grid with a fixed column count.
 */
export type LayoutPreset = 'rows' | 'columns' | 'grid'

/** Options for `applyPreset`. */
export type PresetOptions = {
  /** Spacing between cells. Defaults to the smallest gap already in the layout. */
  gap?: number
  /** Column count for `grid`. Defaults to 2. */
  columns?: number
  /** Fallback size for ids that are not in the layout yet. */
  defaultSize?: GridItemSize
}

const FALLBACK_SIZE: GridItemSize = { w: 240, h: 180, minW: 40, minH: 40 }

function normalizeSize(value: GridItemSize | undefined, fallback: GridItemSize): GridItemSize {
  const size = value ?? fallback
  return {
    ...size,
    w: Math.max(1, Number(size.w) || fallback.w),
    h: Math.max(1, Number(size.h) || fallback.h),
    minW: Math.max(1, Number(size.minW) || 1),
    minH: Math.max(1, Number(size.minH) || 1),
  }
}

/**
 * Rebuild `layout.items` so the given ids tile the canvas as rows, columns,
 * or a grid. Ids keep their constraints; new ids use `defaultSize`.
 */
export function applyPreset<T = unknown>(
  layout: GridLayout<T>,
  preset: LayoutPreset,
  ids: readonly string[] = layout.items.map((item) => item.id),
  options: PresetOptions = {},
): GridLayout<T> {
  const byId = new Map(layout.items.map((item) => [item.id, item]))
  const fallback = options.defaultSize ?? FALLBACK_SIZE
  const sizes = ids.map((id) => normalizeSize(byId.get(id), fallback))
  const padding = layout.canvas.padding
  const gap = options.gap ?? inferGap(layout.items)
  const innerWidth = canvasInnerWidth(layout.canvas)
  const innerHeight = canvasInnerHeight(layout.canvas)
  const columnCount =
    preset === 'rows'
      ? 1
      : preset === 'columns'
        ? Math.max(1, ids.length)
        : Math.max(1, Math.min(options.columns ?? 2, ids.length))
  const rowCount = Math.max(1, Math.ceil(ids.length / columnCount))
  const cellWidth = Math.max(1, (innerWidth - gap * Math.max(0, columnCount - 1)) / columnCount)
  const cellHeight = Math.max(1, (innerHeight - gap * Math.max(0, rowCount - 1)) / rowCount)

  const items = ids.map((id, index): GridItem<T> => {
    const size = sizes[index] ?? fallback
    const existing = byId.get(id)
    const column = index % columnCount
    const row = Math.floor(index / columnCount)
    const itemWidth =
      column === columnCount - 1 ? innerWidth - column * (cellWidth + gap) : cellWidth
    const itemHeight = row === rowCount - 1 ? innerHeight - row * (cellHeight + gap) : cellHeight
    const item: GridItem<T> = {
      ...(existing ?? ({} as GridItem<T>)),
      id,
      x: Math.round(padding.left + column * (cellWidth + gap)),
      y: Math.round(padding.top + row * (cellHeight + gap)),
      w: Math.max(1, Math.round(itemWidth)),
      h: Math.max(1, Math.round(itemHeight)),
      minW: Math.min(size.minW ?? 1, itemWidth),
      minH: Math.min(size.minH ?? 1, itemHeight),
      maxW: size.maxW,
      maxH: size.maxH,
      sizeMode: size.sizeMode,
      fixedWidth: size.fixedWidth,
      fixedHeight: size.fixedHeight,
    }
    return item
  })
  return { ...layout, items }
}
