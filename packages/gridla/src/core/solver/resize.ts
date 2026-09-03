/**
 * Resize solver. Accepts a requested rectangle for one item (or an edge plus a
 * pixel delta), snaps the moving edge to nearby sibling and canvas edges, and
 * shrinks neighbors the new rectangle actually collides with.
 */

import {
  boundsFromCanvas,
  boundsInnerRight,
  clampItem,
  cloneItems,
  itemBottom,
  itemRight,
  rectsOverlap,
  rectsViolateGap,
  resizeRect,
  roundItem,
  verticalOverlap,
} from '../geometry'
import {
  MIN_ITEM_SIZE,
  isGhost,
  isLocked,
  type GridBounds,
  type GridItem,
  type GridLayout,
  type GridPoint,
  type GridRect,
  type GridResizeEdge,
} from '../model'
import {
  capOversizedMinimums,
  emitTrace,
  findById,
  nearestValue,
  partitionItems,
  replaceItem,
  resolveOptions,
  restoreConstraints,
  type InternalResult,
  type SolveOptions,
  type SolveResult,
} from './shared'

function snapResizedItem<T>(
  resized: GridItem<T>,
  edge: GridResizeEdge,
  baseItems: readonly GridItem<T>[],
  bounds: GridBounds,
  gap: number,
  snapDistance: number,
): GridItem<T> {
  const minH = Math.max(MIN_ITEM_SIZE, resized.minH ?? MIN_ITEM_SIZE)
  const minW = Math.max(MIN_ITEM_SIZE, resized.minW ?? MIN_ITEM_SIZE)
  const next = { ...resized }
  const originRight = itemRight(resized)
  const originBottom = itemBottom(resized)
  const maxRight = boundsInnerRight(bounds)
  const maxBottom = bounds.height === null ? null : bounds.height - bounds.padding.bottom
  const g = Math.max(0, gap)

  if (edge.includes('n')) {
    const targets: number[] = [bounds.padding.top]
    for (const sibling of baseItems) {
      if (sibling.id === resized.id) continue
      targets.push(sibling.y, itemBottom(sibling) + g)
    }
    const snapped = nearestValue(targets, next.y, snapDistance)
    if (snapped !== next.y) {
      const newH = Math.max(minH, originBottom - snapped)
      next.y = originBottom - newH
      next.h = newH
    }
  }
  if (edge.includes('s')) {
    const targets: number[] = []
    if (maxBottom !== null) targets.push(maxBottom)
    for (const sibling of baseItems) {
      if (sibling.id === resized.id) continue
      targets.push(itemBottom(sibling), sibling.y - g)
    }
    const currentBottom = itemBottom(next)
    const snapped = nearestValue(targets, currentBottom, snapDistance)
    if (snapped !== currentBottom) next.h = Math.max(minH, snapped - next.y)
  }
  if (edge.includes('w')) {
    const targets: number[] = [bounds.padding.left]
    for (const sibling of baseItems) {
      if (sibling.id === resized.id) continue
      targets.push(sibling.x, itemRight(sibling) + g)
    }
    const snapped = nearestValue(targets, next.x, snapDistance)
    if (snapped !== next.x) {
      const newW = Math.max(minW, originRight - snapped)
      next.x = originRight - newW
      next.w = newW
    }
  }
  if (edge.includes('e')) {
    const targets: number[] = [maxRight]
    for (const sibling of baseItems) {
      if (sibling.id === resized.id) continue
      targets.push(itemRight(sibling), sibling.x - g)
    }
    const currentRight = itemRight(next)
    const snapped = nearestValue(targets, currentRight, snapDistance)
    if (snapped !== currentRight) next.w = Math.max(minW, snapped - next.x)
  }
  return next
}

/**
 * Trim neighbors that the resized rectangle newly collides with. Neighbors
 * that already overlapped the original rect, ghosts, and locked items are not
 * touched; a locked collision refuses the resize.
 */
export function resizeByShrinkingNeighbors<T>({
  baseItems,
  gap,
  original,
  resized,
}: {
  baseItems: readonly GridItem<T>[]
  gap: number
  original: GridItem<T>
  resized: GridItem<T>
}): InternalResult<T> | null {
  const next = baseItems.map((item) => ({ ...item }))
  const resizedRight = itemRight(resized)
  const resizedBottom = itemBottom(resized)
  const g = Math.max(0, gap)

  for (let index = 0; index < next.length; index += 1) {
    const item = next[index]
    if (!item || !rectsViolateGap(item, resized, gap)) continue
    if (!rectsOverlap(item, resized)) continue
    if (rectsOverlap(item, original)) continue
    if (isGhost(item) || isLocked(item)) return null

    const right = itemRight(item)
    const bottom = itemBottom(item)
    const minW = item.minW ?? MIN_ITEM_SIZE
    const minH = item.minH ?? MIN_ITEM_SIZE

    if (verticalOverlap(item, resized) > 0) {
      if (item.x >= resized.x && right > resizedRight) {
        const x = resizedRight + g
        const w = right - x
        if (w >= item.w) continue
        if (w < minW) return null
        next[index] = { ...item, w, x }
        continue
      }
      if (item.x < resized.x && right <= resizedRight) {
        const w = resized.x - g - item.x
        if (w >= item.w) continue
        if (w < minW) return null
        next[index] = { ...item, w }
        continue
      }
    }
    const hOverlap = Math.max(0, Math.min(resizedRight, right) - Math.max(resized.x, item.x))
    if (hOverlap > 0) {
      if (item.y >= resized.y && bottom > resizedBottom) {
        const y = resizedBottom + g
        const h = bottom - y
        if (h >= item.h) continue
        if (h < minH) return null
        next[index] = { ...item, h, y }
        continue
      }
      if (item.y < resized.y && bottom <= resizedBottom) {
        const h = resized.y - g - item.y
        if (h >= item.h) continue
        if (h < minH) return null
        next[index] = { ...item, h }
        continue
      }
    }
    return null
  }

  if (next.some((item) => rectsOverlap(item, resized))) return null
  return { item: resized, items: [...next, resized] }
}

export type ResizeItemInput<T = unknown> = {
  layout: GridLayout<T>
  itemId: string
  /**
   * Edge or corner being dragged. Required when `delta` is used; optional
   * with `rect`, where it only informs edge snapping.
   */
  edge?: GridResizeEdge
  /** Pixel movement of the dragged edge. Ignored when `rect` is given. */
  delta?: GridPoint
  /** Requested rectangle. Missing fields default to the current values. */
  rect?: Partial<GridRect>
  options?: SolveOptions
}

/**
 * Resize one item. Provide `edge` + `delta` for interactive resizing, or
 * `rect` for programmatic resizing. Returns a new layout; inputs are not
 * mutated.
 */
export function resizeItem<T = unknown>({
  layout,
  itemId,
  edge,
  delta,
  rect,
  options,
}: ResizeItemInput<T>): SolveResult<T> {
  const { gap, snapDistance, snap, onTrace } = resolveOptions(options)
  const currentItems = layout.items
  const bounds = boundsFromCanvas(layout.canvas)
  const original = findById(currentItems, itemId)
  if (!original) {
    throw new Error(`resizeItem: item "${itemId}" is not in the layout`)
  }

  let requested: GridItem<T>
  if (rect) {
    requested = { ...original, ...rect }
  } else if (edge && delta) {
    requested = resizeRect(original, edge, delta, bounds)
  } else {
    throw new Error('resizeItem: provide either `rect` or both `edge` and `delta`')
  }

  const done = (
    strategy: SolveResult['strategy'],
    accepted: boolean,
    active: GridItem<T>,
    items: GridItem<T>[],
    shiftedSiblings = false,
  ): SolveResult<T> => {
    emitTrace(onTrace, 'resize', strategy, active, accepted)
    return {
      accepted,
      layout: { canvas: layout.canvas, items },
      item: active,
      strategy,
      shiftedSiblings,
    }
  }

  const rounded = roundItem(requested)
  const clamped = restoreConstraints(clampItem(capOversizedMinimums(rounded), bounds), rounded)
  const { baseItems, ghostItems } = partitionItems(currentItems, itemId)
  const resized =
    edge && snap ? snapResizedItem(clamped, edge, baseItems, bounds, gap, snapDistance) : clamped

  const hasRealCollision = baseItems.some((item) => rectsOverlap(item, resized))
  if (!hasRealCollision) {
    return done('resize', true, resized, replaceItem(currentItems, resized))
  }

  const shrunk = resizeByShrinkingNeighbors({ baseItems, gap, original, resized })
  if (shrunk) {
    return done(
      'resize-shrink-neighbors',
      true,
      shrunk.item,
      replaceItem([...shrunk.items, ...ghostItems], shrunk.item),
      true,
    )
  }
  return done('rejected', false, resized, cloneItems(currentItems))
}
