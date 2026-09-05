/**
 * Helpers shared by the move, resize, place, and transfer solvers. Nothing in
 * this module is public API.
 */

import {
  boundsInnerBottom,
  boundsInnerRight,
  canPlaceItem,
  clampItem,
  itemBottom,
  itemRight,
  layoutIsValid,
  overlapArea,
  rectsOverlap,
  rectsViolateGap,
  roundItem,
  verticalOverlap,
} from '../geometry'
import type { SolveStrategy, TraceCallback } from '../instrumentation'
import {
  DEFAULT_SNAP_DISTANCE,
  MIN_ITEM_SIZE,
  isFixedHeight,
  isFixedOnAxis,
  isFixedWidth,
  isGhost,
  isLocked,
  type GridAxis,
  type GridBounds,
  type GridItem,
  type GridLayout,
} from '../model'

/**
 * Tuning shared by every solver: minimum gap, snapping, and tracing. Every field
 * is optional.
 */
export type SolveOptions = {
  /** Minimum distance kept between neighbors. Default `0`. */
  gap?: number
  /** Distance within which edges attract. Default `24`. */
  snapDistance?: number
  /**
   * When `false`, alignment snapping is skipped so the item tracks the
   * requested position exactly. Bounds, gap, and constraint rules still
   * apply. Default `true`.
   */
  snap?: boolean
  /** Receives one event per solve describing which strategy produced the result. */
  onTrace?: TraceCallback
}

export type ResolvedOptions = {
  gap: number
  snapDistance: number
  snap: boolean
  onTrace: TraceCallback | undefined
}

export function resolveOptions(options: SolveOptions | undefined): ResolvedOptions {
  return {
    gap: Math.max(0, options?.gap ?? 0),
    snapDistance: Math.max(0, options?.snapDistance ?? DEFAULT_SNAP_DISTANCE),
    snap: options?.snap ?? true,
    onTrace: options?.onTrace,
  }
}

/** Outcome of a solve. `layout` is always a complete, independent copy. */
export type SolveResult<T = unknown> = {
  /** `false` means the request could not be honored; `layout` then equals the input. */
  accepted: boolean
  /** The layout after the operation. */
  layout: GridLayout<T>
  /**
   * The active item as it appears in `layout`. When `accepted` is false this
   * is the rejected candidate, useful for showing where a drop would land.
   */
  item: GridItem<T>
  /** Which strategy produced this result. */
  strategy: SolveStrategy
  /** True when siblings moved or resized to make room. */
  shiftedSiblings: boolean
}

export type InternalResult<T> = {
  item: GridItem<T>
  items: GridItem<T>[]
  shiftedSiblings?: boolean
}

export function findById<T>(items: readonly GridItem<T>[], id: string): GridItem<T> | undefined {
  return items.find((item) => item.id === id)
}

export function removeItem<T>(items: readonly GridItem<T>[], itemId: string): GridItem<T>[] {
  return items.filter((item) => item.id !== itemId)
}

/** Split siblings into solid items the solver sees and ghosts it re-merges later. */
export function partitionItems<T>(items: readonly GridItem<T>[], itemId: string) {
  const baseItems: GridItem<T>[] = []
  const ghostItems: GridItem<T>[] = []
  for (const entry of items) {
    if (entry.id === itemId) continue
    if (isGhost(entry)) ghostItems.push(entry)
    else baseItems.push(entry)
  }
  return { baseItems, ghostItems }
}

export function replaceItem<T>(items: readonly GridItem<T>[], item: GridItem<T>): GridItem<T>[] {
  const found = items.some((current) => current.id === item.id)
  if (!found) return [...items.map((current) => ({ ...current })), item]
  return items.map((current) => (current.id === item.id ? { ...item } : { ...current }))
}

export function capOversizedMinimums<T>(item: GridItem<T>): GridItem<T> {
  let next: GridItem<T> | null = null
  if (typeof item.minW === 'number' && item.minW > item.w)
    next = { ...(next ?? item), minW: item.w }
  if (typeof item.minH === 'number' && item.minH > item.h)
    next = { ...(next ?? item), minH: item.h }
  return next ?? item
}

export function restoreConstraints<T>(item: GridItem<T>, source: GridItem<T>): GridItem<T> {
  return {
    ...item,
    fixedHeight: source.fixedHeight,
    fixedWidth: source.fixedWidth,
    maxH: source.maxH,
    maxW: source.maxW,
    minH: source.minH,
    minW: source.minW,
    sizeMode: source.sizeMode,
  }
}

/**
 * Validate only the items that changed: they must sit inside bounds and must
 * not geometrically overlap any solid item. Gap-only violations between
 * pre-existing pairs are tolerated.
 */
export function changedItemsFit<T>(
  items: readonly GridItem<T>[],
  changedIds: ReadonlySet<string>,
  bounds: GridBounds,
): boolean {
  for (const item of items) {
    if (!changedIds.has(item.id)) continue
    const clamped = clampItem(item, bounds)
    const TOL = 1
    if (
      Math.abs(clamped.x - item.x) > TOL ||
      Math.abs(clamped.y - item.y) > TOL ||
      Math.abs(clamped.w - item.w) > TOL ||
      Math.abs(clamped.h - item.h) > TOL
    ) {
      return false
    }
    for (const other of items) {
      if (other.id === item.id || isGhost(other)) continue
      if (rectsOverlap(other, item)) return false
    }
  }
  return true
}

export function nearestValue(values: readonly number[], target: number, snapDistance: number) {
  let best = target
  let bestDistance = Number.POSITIVE_INFINITY
  for (const value of values) {
    const distance = Math.abs(value - target)
    if (distance > snapDistance || distance >= bestDistance) continue
    best = value
    bestDistance = distance
  }
  return best
}

function dedupe(values: number[]): number[] {
  return Array.from(new Set(values.map((value) => Math.round(value))))
}

/** Candidate positions near `item` aligned to sibling and canvas edges. */
export function snapCandidates<T>(
  item: GridItem<T>,
  items: readonly GridItem<T>[],
  bounds: GridBounds,
  gap: number,
  snapDistance: number,
): GridItem<T>[] {
  const lefts = [bounds.padding.left]
  const tops = [bounds.padding.top]
  const maxRight = boundsInnerRight(bounds)
  const maxBottom = bounds.height === null ? null : bounds.height - bounds.padding.bottom
  lefts.push(maxRight - item.w)
  if (maxBottom !== null) tops.push(maxBottom - item.h)

  for (const current of items) {
    if (current.id === item.id) continue
    lefts.push(current.x)
    lefts.push(itemRight(current) - item.w)
    lefts.push(current.x - gap - item.w)
    lefts.push(itemRight(current) + gap)
    tops.push(current.y)
    tops.push(itemBottom(current) - item.h)
    tops.push(current.y - gap - item.h)
    tops.push(itemBottom(current) + gap)
  }

  const snappedX = nearestValue(lefts, item.x, snapDistance)
  const snappedY = nearestValue(tops, item.y, snapDistance)
  const xs = dedupe([
    item.x,
    snappedX,
    ...lefts.filter((x) => Math.abs(x - item.x) <= snapDistance),
  ])
  const ys = dedupe([item.y, snappedY, ...tops.filter((y) => Math.abs(y - item.y) <= snapDistance)])
  const candidates: GridItem<T>[] = []
  const pushCandidate = (x: number, y: number) => {
    const candidate = clampItem({ ...item, x, y }, bounds)
    if (candidates.some((c) => c.x === candidate.x && c.y === candidate.y)) return
    candidates.push(candidate)
  }
  pushCandidate(snappedX, snappedY)
  pushCandidate(snappedX, item.y)
  pushCandidate(item.x, snappedY)
  pushCandidate(item.x, item.y)
  for (const x of xs) for (const y of ys) pushCandidate(x, y)
  return candidates
}

export function chooseOpenCandidate<T>(
  desired: GridItem<T>,
  items: readonly GridItem<T>[],
  bounds: GridBounds,
  gap: number,
  snapDistance: number,
): GridItem<T> | null {
  for (const candidate of snapCandidates(desired, items, bounds, gap, snapDistance)) {
    if (canPlaceItem(items, candidate, bounds, gap)) return candidate
  }
  return null
}

/** Push every gap-violating pair apart vertically until the layout is valid. */
export function pushOverlapsDown<T>(
  items: readonly GridItem<T>[],
  activeId: string,
  bounds: GridBounds,
  gap: number,
): GridItem<T>[] | null {
  const next = items.map((item) => ({ ...item }))
  const guardLimit = Math.max(1, next.length * next.length * 3)
  let guard = 0
  let changed = true

  while (changed && guard < guardLimit) {
    changed = false
    guard += 1
    for (let leftIndex = 0; leftIndex < next.length; leftIndex += 1) {
      const left = next[leftIndex]
      if (!left) continue
      for (let rightIndex = leftIndex + 1; rightIndex < next.length; rightIndex += 1) {
        const right = next[rightIndex]
        if (!right || !rectsViolateGap(left, right, gap)) continue
        const moving =
          left.id === activeId
            ? right
            : right.id === activeId
              ? left
              : left.y <= right.y
                ? right
                : left
        if (isLocked(moving) || isGhost(moving)) return null
        const source = moving === left ? right : left
        const moved = clampItem({ ...moving, y: itemBottom(source) + gap }, bounds)
        if (moved.x === moving.x && moved.y === moving.y) return null
        if (isFixedHeight(moving) && moved.h !== moving.h) return null
        if (isFixedWidth(moving) && moved.w !== moving.w) return null
        if (moving === left) next[leftIndex] = moved
        else next[rightIndex] = moved
        changed = true
      }
    }
  }
  if (next.some((item) => !canPlaceItem(next, item, bounds, gap))) return null
  return next
}

/** Every position aligned to a sibling or canvas edge where `item` could sit. */
export function edgeAlignedSlots<T>(
  item: GridItem<T>,
  baseItems: readonly GridItem<T>[],
  bounds: GridBounds,
  gap: number,
): GridItem<T>[] {
  const minX = bounds.padding.left
  const maxX = Math.max(minX, boundsInnerRight(bounds) - item.w)
  const minY = bounds.padding.top
  const maxY =
    bounds.height === null
      ? Number.POSITIVE_INFINITY
      : Math.max(minY, boundsInnerBottom(bounds) - item.h)

  const xs = new Set<number>([minX, maxX])
  const ys = new Set<number>([minY])
  for (const sibling of baseItems) {
    xs.add(sibling.x)
    xs.add(itemRight(sibling) + gap)
    xs.add(sibling.x - item.w - gap)
    xs.add(itemRight(sibling) - item.w)
    ys.add(sibling.y)
    ys.add(itemBottom(sibling) + gap)
    ys.add(sibling.y - item.h - gap)
    ys.add(itemBottom(sibling) - item.h)
  }

  const slots: GridItem<T>[] = []
  const seen = new Set<string>()
  for (const rawX of xs) {
    for (const rawY of ys) {
      const x = Math.max(minX, Math.min(rawX, maxX))
      const y = Math.max(minY, Math.min(rawY, maxY))
      const key = `${Math.round(x)},${Math.round(y)}`
      if (seen.has(key)) continue
      seen.add(key)
      slots.push(roundItem({ ...item, x, y }))
    }
  }
  return slots
}

/**
 * Like `edgeAlignedSlots`, but only the slots nearest to `pointer`. The x and
 * y candidates are each narrowed to the closest `perAxis` values before they
 * are combined, so the cost stays bounded for large item counts. With few
 * items (4n + 2 <= perAxis) the result equals the full slot set.
 */
export function nearestEdgeAlignedSlots<T>(
  item: GridItem<T>,
  baseItems: readonly GridItem<T>[],
  bounds: GridBounds,
  gap: number,
  pointer: { x: number; y: number },
  perAxis = 48,
): GridItem<T>[] {
  const minX = bounds.padding.left
  const maxX = Math.max(minX, boundsInnerRight(bounds) - item.w)
  const minY = bounds.padding.top
  const maxY =
    bounds.height === null
      ? Number.POSITIVE_INFINITY
      : Math.max(minY, boundsInnerBottom(bounds) - item.h)

  const xs = new Set<number>([minX, maxX])
  const ys = new Set<number>([minY])
  for (const sibling of baseItems) {
    xs.add(Math.max(minX, Math.min(sibling.x, maxX)))
    xs.add(Math.max(minX, Math.min(itemRight(sibling) + gap, maxX)))
    xs.add(Math.max(minX, Math.min(sibling.x - item.w - gap, maxX)))
    xs.add(Math.max(minX, Math.min(itemRight(sibling) - item.w, maxX)))
    ys.add(Math.max(minY, Math.min(sibling.y, maxY)))
    ys.add(Math.max(minY, Math.min(itemBottom(sibling) + gap, maxY)))
    ys.add(Math.max(minY, Math.min(sibling.y - item.h - gap, maxY)))
    ys.add(Math.max(minY, Math.min(itemBottom(sibling) - item.h, maxY)))
  }
  const nearestX = Array.from(xs)
    .sort((a, b) => Math.abs(a - pointer.x) - Math.abs(b - pointer.x))
    .slice(0, perAxis)
  const nearestY = Array.from(ys)
    .sort((a, b) => Math.abs(a - pointer.y) - Math.abs(b - pointer.y))
    .slice(0, perAxis)

  const slots: GridItem<T>[] = []
  const seen = new Set<string>()
  for (const x of nearestX) {
    for (const y of nearestY) {
      const key = `${Math.round(x)},${Math.round(y)}`
      if (seen.has(key)) continue
      seen.add(key)
      slots.push(roundItem({ ...item, x, y }))
    }
  }
  return slots.sort(
    (a, b) =>
      Math.hypot(pointer.x - a.x, pointer.y - a.y) - Math.hypot(pointer.x - b.x, pointer.y - b.y),
  )
}

export function closestValidSlot<T>(
  desired: GridItem<T>,
  slots: readonly GridItem<T>[],
  baseItems: readonly GridItem<T>[],
  bounds: GridBounds,
  gap: number,
  maxDistance: number = Number.POSITIVE_INFINITY,
): GridItem<T> | null {
  let best: GridItem<T> | null = null
  let bestDistance = Number.POSITIVE_INFINITY
  for (const slot of slots) {
    if (!canPlaceItem(baseItems, slot, bounds, gap)) continue
    const distance = Math.hypot(slot.x - desired.x, slot.y - desired.y)
    if (distance > maxDistance) continue
    if (distance < bestDistance) {
      best = slot
      bestDistance = distance
    }
  }
  return best
}

/** True when `item` is fixed on `axis` and flush with the canvas edge opposite `direction`. */
export function isEdgeAnchoredAgainstPush<T>(
  item: GridItem<T>,
  bounds: GridBounds,
  axis: GridAxis,
  direction: 'forward' | 'backward',
): boolean {
  const TOL = 2
  if (!isFixedOnAxis(item, axis)) return false
  if (axis === 'x') {
    const right = boundsInnerRight(bounds)
    const left = bounds.padding.left
    if (direction === 'backward' && Math.abs(item.x + item.w - right) <= TOL) return true
    if (direction === 'forward' && Math.abs(item.x - left) <= TOL) return true
    return false
  }
  if (bounds.height === null) return false
  const bottom = bounds.height - bounds.padding.bottom
  const top = bounds.padding.top
  if (direction === 'backward' && Math.abs(item.y + item.h - bottom) <= TOL) return true
  if (direction === 'forward' && Math.abs(item.y - top) <= TOL) return true
  return false
}

/** Shrink the axis-facing side of `source` so `active` fits beside it. */
export function trimCandidate<T>(
  source: GridItem<T>,
  active: GridItem<T>,
  gap: number,
  side: 'top' | 'right' | 'bottom' | 'left',
): GridItem<T> | null {
  const minW = source.minW ?? MIN_ITEM_SIZE
  const minH = source.minH ?? MIN_ITEM_SIZE
  const right = itemRight(source)
  const bottom = itemBottom(source)
  const g = Math.max(0, gap)
  if ((side === 'top' || side === 'bottom') && isFixedHeight(source)) return null
  if ((side === 'left' || side === 'right') && isFixedWidth(source)) return null
  if (side === 'top') {
    const y = itemBottom(active) + g
    const h = bottom - y
    if (h < minH) return null
    return { ...source, h, y }
  }
  if (side === 'bottom') {
    const h = active.y - g - source.y
    if (h < minH) return null
    return { ...source, h }
  }
  if (side === 'left') {
    const x = itemRight(active) + g
    const w = right - x
    if (w < minW) return null
    return { ...source, w, x }
  }
  const w = active.x - g - source.x
  if (w < minW) return null
  return { ...source, w }
}

/** Trim one overlapping neighbor horizontally so `active` fits at its position. */
export function tryPlaceByTrimmingNeighbor<T>({
  active,
  baseItems,
  bounds,
  gap,
}: {
  active: GridItem<T>
  baseItems: readonly GridItem<T>[]
  bounds: GridBounds
  gap: number
}): InternalResult<T> | null {
  const candidates = baseItems
    .filter((item) => rectsViolateGap(item, active, gap))
    .map((item) => ({ item, area: overlapArea(item, active) }))
    .filter((entry) => entry.area > 0)
    .sort((left, right) => right.area - left.area)

  for (const { item: target } of candidates) {
    if (isGhost(target) || isLocked(target) || isFixedWidth(target)) continue
    const others = baseItems.filter((item) => item.id !== target.id)
    const targetMinW = target.minW ?? MIN_ITEM_SIZE
    const targetRight = itemRight(target)
    const activeRight = itemRight(active)
    const trims: GridItem<T>[] = []
    const vOverlap = verticalOverlap(target, active)
    const requiredVerticalOverlap = Math.max(Math.min(target.h, active.h) * 0.5, active.h * 0.25)
    if (vOverlap < requiredVerticalOverlap) continue

    if (active.x > target.x) trims.push({ ...target, w: active.x - gap - target.x })
    if (activeRight < targetRight) {
      const x = activeRight + gap
      trims.push({ ...target, w: targetRight - x, x })
    }
    for (const trim of trims) {
      if (trim.w < targetMinW) continue
      const layout = [...others.map((c) => ({ ...c })), clampItem(trim, bounds), active]
      if (!layoutIsValid(layout, bounds, gap)) continue
      return { item: active, items: layout }
    }
  }
  return null
}

/**
 * True when every item other than `activeId` kept the size of each axis its
 * `sizeMode` fixes. Solvers use this as a final gate so no strategy can
 * resize a fixed-size bystander as a side effect.
 */
export function fixedAxesPreserved<T>(
  before: readonly GridItem<T>[],
  after: readonly GridItem<T>[],
  activeId: string,
): boolean {
  const previous = new Map(before.map((item) => [item.id, item]))
  for (const item of after) {
    if (item.id === activeId) continue
    const source = previous.get(item.id)
    if (!source) continue
    if (isFixedWidth(source) && item.w !== source.w) return false
    if (isFixedHeight(source) && item.h !== source.h) return false
  }
  return true
}

export function emitTrace(
  onTrace: TraceCallback | undefined,
  operation: 'move' | 'resize' | 'place' | 'transfer',
  strategy: SolveStrategy,
  item: GridItem,
  accepted: boolean,
) {
  if (!onTrace) return
  onTrace({
    operation,
    strategy,
    itemId: item.id,
    accepted,
    x: item.x,
    y: item.y,
    w: item.w,
    h: item.h,
  })
}
