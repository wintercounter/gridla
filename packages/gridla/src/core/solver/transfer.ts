/**
 * Transfer solver. Moves an item from one layout into another at a pointer
 * location, translating its size so it keeps roughly the same visual
 * proportion when the two canvases have different scales.
 */

import { canvasInnerHeight, canvasInnerWidth } from '../geometry'
import type { SolveStrategy } from '../instrumentation'
import type { GridItem, GridLayout, GridPoint, GridSize } from '../model'
import { placeItem } from './place'
import { emitTrace, findById, removeItem, resolveOptions, type SolveOptions } from './shared'

export type TransferItemInput<T = unknown> = {
  /** Layout the item currently lives in. */
  source: GridLayout<T>
  /** Layout the item is dropped into. */
  target: GridLayout<T>
  itemId: string
  /** Pointer location in the target's canvas coordinates. */
  pointer: GridPoint
  /**
   * Size the item should take in the target. Defaults to the source size
   * scaled by the ratio of the two canvases' inner areas.
   */
  size?: Partial<GridSize>
  options?: SolveOptions
}

export type TransferResult<T = unknown> = {
  accepted: boolean
  /** Source layout without the item. Equals the input when rejected. */
  source: GridLayout<T>
  /** Target layout with the item. Equals the input when rejected. */
  target: GridLayout<T>
  item: GridItem<T>
  strategy: SolveStrategy
  shiftedSiblings: boolean
}

/**
 * Scale a size authored against `source` so it covers the same fraction of
 * `target`. Used to keep items visually consistent across canvases.
 */
export function scaleSizeBetweenCanvases(
  size: GridSize,
  source: GridLayout['canvas'],
  target: GridLayout['canvas'],
): GridSize {
  const ratioX = canvasInnerWidth(target) / canvasInnerWidth(source)
  const ratioY = canvasInnerHeight(target) / canvasInnerHeight(source)
  return { w: size.w * ratioX, h: size.h * ratioY }
}

/**
 * Move an item from `source` into `target` at `pointer`. Returns both updated
 * layouts. Neither input is mutated.
 */
export function transferItem<T = unknown>({
  source,
  target,
  itemId,
  pointer,
  size,
  options,
}: TransferItemInput<T>): TransferResult<T> {
  const { onTrace } = resolveOptions(options)
  const original = findById(source.items, itemId)
  if (!original) {
    throw new Error(`transferItem: item "${itemId}" is not in the source layout`)
  }
  const scaled = scaleSizeBetweenCanvases(original, source.canvas, target.canvas)
  const innerW = canvasInnerWidth(target.canvas)
  const innerH = canvasInnerHeight(target.canvas)
  const w = Math.min(size?.w ?? scaled.w, innerW)
  const h = Math.min(size?.h ?? scaled.h, innerH)

  const placed = placeItem<T>({
    layout: target,
    item: { ...original, w, h },
    pointer,
    options: { ...options, onTrace: undefined },
  })
  emitTrace(onTrace, 'transfer', placed.strategy, placed.item, placed.accepted)
  if (!placed.accepted) {
    return {
      accepted: false,
      source,
      target,
      item: placed.item,
      strategy: placed.strategy,
      shiftedSiblings: false,
    }
  }
  return {
    accepted: true,
    source: { canvas: source.canvas, items: removeItem(source.items, itemId) },
    target: placed.layout,
    item: placed.item,
    strategy: placed.strategy,
    shiftedSiblings: placed.shiftedSiblings,
  }
}
