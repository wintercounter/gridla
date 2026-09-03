/**
 * Place solver. Inserts a new item into a layout.
 *
 * Two forms:
 *
 * - Position form (`position` or `item.x/y`): the requested top-left is the
 *   intent. Strategies: open snap candidate, adjacent fit, stack below
 *   blockers, trim a neighbor, push down, nearest open slot.
 * - Pointer form (`pointer`): the pointer location is the intent and the
 *   item is centered on it. Strategies: pointer-centered fit, minimal slide,
 *   push down, scaled-down retries, shrink siblings, and finally an
 *   overlapping placement so the caller can still show a preview.
 */

import {
  boundsFromCanvas,
  boundsInnerBottom,
  boundsInnerRight,
  canPlaceItem,
  clampItem,
  cloneItems,
  createItem,
  itemBottom,
  itemRight,
  overlapArea,
  rectsViolateGap,
  roundItem,
  verticalOverlap,
} from '../geometry'
import {
  MIN_ITEM_SIZE,
  type GridBounds,
  type GridItem,
  type GridItemSize,
  type GridLayout,
  type GridPoint,
} from '../model'
import {
  chooseOpenCandidate,
  emitTrace,
  findById,
  nearestEdgeAlignedSlots,
  pushOverlapsDown,
  removeItem,
  resolveOptions,
  snapCandidates,
  tryPlaceByTrimmingNeighbor,
  type InternalResult,
  type SolveOptions,
  type SolveResult,
} from './shared'

/** Slots per size step for which the pointer form also tries a push-down. */
const MAX_PUSH_ATTEMPTS = 128

// ---------------------------------------------------------------------------
// Position form strategies
// ---------------------------------------------------------------------------

function chooseFittedAdjacentCandidate<T>(
  desired: GridItem<T>,
  items: readonly GridItem<T>[],
  bounds: GridBounds,
  gap: number,
  snapDistance: number,
): GridItem<T> | null {
  const minW = Math.max(MIN_ITEM_SIZE, desired.minW ?? MIN_ITEM_SIZE)
  const minH = Math.max(MIN_ITEM_SIZE, desired.minH ?? MIN_ITEM_SIZE)
  const maxRight = boundsInnerRight(bounds)
  const maxBottom = boundsInnerBottom(bounds)
  const g = Math.max(0, gap)
  const candidates = items
    .map((item) => ({ item, area: overlapArea(item, desired) }))
    .sort((left, right) => right.area - left.area)

  for (const { item: target } of candidates) {
    const vOverlap = verticalOverlap(target, desired)
    if (vOverlap > Math.min(target.h, desired.h) * 0.25) {
      const y = Math.abs(desired.y - target.y) <= snapDistance ? target.y : desired.y
      if (desired.x >= target.x) {
        const x = itemRight(target) + g
        const w = Math.min(desired.w, maxRight - x)
        if (w >= minW) {
          const candidate = roundItem({ ...desired, w, x, y })
          if (canPlaceItem(items, candidate, bounds, gap)) return candidate
        }
      }
      if (desired.x <= target.x) {
        const w = Math.min(desired.w, target.x - g - bounds.padding.left)
        const x = target.x - g - w
        if (w >= minW && x >= bounds.padding.left) {
          const candidate = roundItem({ ...desired, w, x, y })
          if (canPlaceItem(items, candidate, bounds, gap)) return candidate
        }
      }
    }
    const hOverlap = Math.max(
      0,
      Math.min(itemRight(target), itemRight(desired)) - Math.max(target.x, desired.x),
    )
    if (hOverlap <= Math.min(target.w, desired.w) * 0.25) continue
    const x = Math.abs(desired.x - target.x) <= snapDistance ? target.x : desired.x
    if (desired.y >= target.y) {
      const y = itemBottom(target) + g
      const h = Math.min(desired.h, maxBottom - y)
      if (h >= minH) {
        const candidate = roundItem({ ...desired, h, x, y })
        if (canPlaceItem(items, candidate, bounds, gap)) return candidate
      }
    }
    if (desired.y <= target.y) {
      const h = Math.min(desired.h, target.y - g - bounds.padding.top)
      const y = target.y - g - h
      if (h >= minH && y >= bounds.padding.top) {
        const candidate = roundItem({ ...desired, h, x, y })
        if (canPlaceItem(items, candidate, bounds, gap)) return candidate
      }
    }
  }
  return null
}

function tryStackBelowBlockingItems<T>({
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
  const blockers = baseItems.filter(
    (item) =>
      item.y < active.y && rectsViolateGap(item, active, gap) && verticalOverlap(item, active) > 0,
  )
  if (blockers.length === 0) return null
  const stacked = clampItem(
    { ...active, y: Math.max(...blockers.map((item) => itemBottom(item))) + Math.max(0, gap) },
    bounds,
  )
  if (stacked.y === active.y) return null
  const pushed = pushOverlapsDown([...baseItems, stacked], stacked.id, bounds, gap)
  if (!pushed) return null
  return { item: findById(pushed, active.id) ?? stacked, items: pushed }
}

function nearestOpenSlot<T>(
  desired: GridItem<T>,
  items: readonly GridItem<T>[],
  bounds: GridBounds,
  gap: number,
): GridItem<T> | null {
  const step = Math.max(8, Math.min(24, Math.round(Math.max(1, gap || 8))))
  const maxRight = Math.max(bounds.padding.left, boundsInnerRight(bounds))
  const maxX = Math.max(bounds.padding.left, maxRight - desired.w)
  const heightLimit =
    bounds.height === null
      ? Math.max(
          desired.y + desired.h + 360,
          items.reduce((bottom, item) => Math.max(bottom, itemBottom(item)), 0) + desired.h + 360,
        )
      : Math.max(bounds.padding.top, bounds.height - bounds.padding.bottom - desired.h)
  const clampedDesired = clampItem(desired, bounds)
  let best: GridItem<T> | null = null
  let bestScore = Number.POSITIVE_INFINITY

  for (let y = bounds.padding.top; y <= heightLimit; y += step) {
    for (let x = bounds.padding.left; x <= maxX; x += step) {
      const candidate = clampItem({ ...clampedDesired, x, y }, bounds)
      if (!canPlaceItem(items, candidate, bounds, gap)) continue
      const score = Math.abs(candidate.x - desired.x) * 2 + Math.abs(candidate.y - desired.y)
      if (score >= bestScore) continue
      best = candidate
      bestScore = score
    }
  }
  return best
}

// ---------------------------------------------------------------------------
// Pointer form strategies
// ---------------------------------------------------------------------------

function slideOutOfOverlap<T>(
  slot: GridItem<T>,
  siblings: readonly GridItem<T>[],
  bounds: GridBounds,
  gap: number,
): GridItem<T> | null {
  let current = slot
  const maxDisplacement = Math.max(slot.w, slot.h) * 1.5
  for (let iter = 0; iter < siblings.length + 2; iter += 1) {
    const overlap = siblings.find((sibling) => rectsViolateGap(sibling, current, gap))
    if (!overlap) return current
    const options: GridItem<T>[] = [
      { ...current, x: itemRight(overlap) + gap },
      { ...current, x: overlap.x - current.w - gap },
      { ...current, y: itemBottom(overlap) + gap },
      { ...current, y: overlap.y - current.h - gap },
    ]
    let best: GridItem<T> | null = null
    let bestDist = Number.POSITIVE_INFINITY
    for (const option of options) {
      const clamped = clampItem(option, bounds)
      const dist = Math.hypot(clamped.x - slot.x, clamped.y - slot.y)
      if (dist > maxDisplacement) continue
      if (dist < bestDist) {
        best = clamped
        bestDist = dist
      }
    }
    if (!best) return null
    if (best.x === current.x && best.y === current.y) return null
    current = best
  }
  return null
}

function shrinkSiblingsForSlot<T>(
  incoming: GridItem<T>,
  siblings: readonly GridItem<T>[],
  bounds: GridBounds,
  gap: number,
  pointer: GridPoint,
): InternalResult<T> | null {
  const FLOOR = 0.5
  const slotX = Math.max(
    bounds.padding.left,
    Math.min(pointer.x - incoming.w / 2, boundsInnerRight(bounds) - incoming.w),
  )
  const maxYBound =
    bounds.height === null
      ? pointer.y
      : Math.max(bounds.padding.top, bounds.height - bounds.padding.bottom - incoming.h)
  const slotY = Math.max(bounds.padding.top, Math.min(pointer.y - incoming.h / 2, maxYBound))
  const slot: GridItem<T> = { ...incoming, x: slotX, y: slotY }

  const overlapping = siblings.filter((sibling) => rectsViolateGap(sibling, slot, gap))
  if (overlapping.length === 0) return null

  const next = siblings.map((sibling) => ({ ...sibling }))
  for (const sibling of overlapping) {
    const target = next.find((entry) => entry.id === sibling.id)
    if (!target) return null
    type Option = { axis: 'x' | 'y'; start: number; size: number }
    const options: Option[] = []
    if (sibling.y < slot.y && sibling.y + sibling.h > slot.y) {
      options.push({ axis: 'y', start: sibling.y, size: slot.y - gap - sibling.y })
    }
    if (sibling.y < slot.y + slot.h && sibling.y + sibling.h > slot.y + slot.h) {
      const start = slot.y + slot.h + gap
      options.push({ axis: 'y', start, size: sibling.y + sibling.h - start })
    }
    if (sibling.x < slot.x && sibling.x + sibling.w > slot.x) {
      options.push({ axis: 'x', start: sibling.x, size: slot.x - gap - sibling.x })
    }
    if (sibling.x < slot.x + slot.w && sibling.x + sibling.w > slot.x + slot.w) {
      const start = slot.x + slot.w + gap
      options.push({ axis: 'x', start, size: sibling.x + sibling.w - start })
    }
    const viable = options.filter(
      (opt) => opt.size > 0 && opt.size >= (opt.axis === 'y' ? sibling.h : sibling.w) * FLOOR,
    )
    if (viable.length === 0) return null
    const loss = (o: Option) => (o.axis === 'y' ? sibling.h : sibling.w) - o.size
    viable.sort((a, b) => loss(a) - loss(b))
    const best = viable[0]
    if (best.axis === 'y') {
      target.h = best.size
      target.y = best.start
    } else {
      target.w = best.size
      target.x = best.start
    }
  }
  if (!canPlaceItem(next, slot, bounds, gap)) return null
  return { item: slot, items: [...next, slot], shiftedSiblings: true }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Item description accepted by `placeItem`. Position is optional. */
export type NewGridItem<T = unknown> = GridItemSize & {
  id: string
  x?: number
  y?: number
  policy?: GridItem<T>['policy']
  data?: T
}

export type PlaceItemInput<T = unknown> = {
  layout: GridLayout<T>
  /** Item to insert. Its `id` must not already be in the layout unless replacing it. */
  item: NewGridItem<T>
  /** Requested top-left. Overrides `item.x`/`item.y`. */
  position?: GridPoint
  /** Pointer location in canvas coordinates. The item is centered on it. */
  pointer?: GridPoint
  options?: SolveOptions
}

function toItem<T>(input: NewGridItem<T>, x: number, y: number): GridItem<T> {
  const item = createItem<T>(input.id, input, x, y, input.data)
  if (input.policy) item.policy = input.policy
  return item
}

/**
 * Insert an item into the layout. Give a `position` for a top-left intent
 * or a `pointer` for a cursor-centered intent. Returns a new layout.
 */
export function placeItem<T = unknown>({
  layout,
  item: input,
  position,
  pointer,
  options,
}: PlaceItemInput<T>): SolveResult<T> {
  const { gap, snapDistance, onTrace } = resolveOptions(options)
  const bounds = boundsFromCanvas(layout.canvas)
  const siblings = removeItem(layout.items, input.id)

  const done = (
    strategy: SolveResult['strategy'],
    accepted: boolean,
    active: GridItem<T>,
    items: GridItem<T>[],
    shiftedSiblings = false,
  ): SolveResult<T> => {
    emitTrace(onTrace, 'place', strategy, active, accepted)
    return {
      accepted,
      layout: { canvas: layout.canvas, items },
      item: active,
      strategy,
      shiftedSiblings,
    }
  }
  const withSiblings = (active: GridItem<T>) => [...siblings.map((s) => ({ ...s })), active]

  if (pointer) {
    const base = toItem(input, 0, 0)
    const centered = (sized: GridItem<T>) =>
      clampItem({ ...sized, x: pointer.x - sized.w / 2, y: pointer.y - sized.h / 2 }, bounds)

    const pointerSlot = centered(base)
    if (canPlaceItem(siblings, pointerSlot, bounds, gap)) {
      return done('pointer', true, pointerSlot, withSiblings(pointerSlot))
    }
    const slid = slideOutOfOverlap(pointerSlot, siblings, bounds, gap)
    if (slid && canPlaceItem(siblings, slid, bounds, gap)) {
      return done('pointer-slide', true, slid, withSiblings(slid))
    }
    const pushedAtPointer = pushOverlapsDown(withSiblings(pointerSlot), pointerSlot.id, bounds, gap)
    if (pushedAtPointer) {
      return done(
        'pointer-push',
        true,
        findById(pushedAtPointer, pointerSlot.id) ?? pointerSlot,
        pushedAtPointer,
        true,
      )
    }

    const attempt = (sized: GridItem<T>): SolveResult<T> | null => {
      // Only the slots nearest the pointer are worth trying: the candidate set
      // grows with the square of the item count and a far slot is never a
      // good answer to "drop here".
      const sorted = nearestEdgeAlignedSlots(sized, siblings, bounds, gap, pointer)
      if (sorted.length === 0) return null
      let pushAttempts = 0
      for (const slot of sorted) {
        if (canPlaceItem(siblings, slot, bounds, gap)) {
          return done('pointer-scaled', true, slot, withSiblings(slot))
        }
        // Pushing siblings is quadratic in the item count; only try it for
        // the slots closest to the pointer.
        if (pushAttempts >= MAX_PUSH_ATTEMPTS) continue
        pushAttempts += 1
        const pushed = pushOverlapsDown(withSiblings(slot), slot.id, bounds, gap)
        if (pushed) {
          return done('pointer-scaled', true, findById(pushed, slot.id) ?? slot, pushed, true)
        }
      }
      return null
    }
    const FLOOR = 0.5
    for (const scale of [1, 0.9, 0.75, 0.6, FLOOR]) {
      const sized: GridItem<T> = {
        ...base,
        w: Math.max(base.minW ?? 1, base.w * scale),
        h: Math.max(base.minH ?? 1, base.h * scale),
      }
      const found = attempt(sized)
      if (found) return found
    }
    for (const axis of ['w', 'h'] as const) {
      for (const scale of [0.9, 0.75, 0.6, FLOOR]) {
        const sized: GridItem<T> = {
          ...base,
          w: axis === 'w' ? Math.max(base.minW ?? 1, base.w * scale) : base.w,
          h: axis === 'h' ? Math.max(base.minH ?? 1, base.h * scale) : base.h,
        }
        const found = attempt(sized)
        if (found) return found
      }
    }
    for (const scale of [1, 0.9, 0.75, FLOOR]) {
      const sized: GridItem<T> = {
        ...base,
        w: Math.max(base.minW ?? 1, base.w * scale),
        h: Math.max(base.minH ?? 1, base.h * scale),
      }
      const found = shrinkSiblingsForSlot(sized, siblings, bounds, gap, pointer)
      if (found) return done('pointer-shrink-siblings', true, found.item, found.items, true)
    }
    const fallbackSlot = centered(base)
    return done('pointer-overlap', true, fallbackSlot, withSiblings(fallbackSlot))
  }

  const x = position?.x ?? input.x ?? bounds.padding.left
  const y = position?.y ?? input.y ?? bounds.padding.top
  const desired = clampItem(toItem(input, x, y), bounds)
  const preferred = snapCandidates(desired, siblings, bounds, gap, snapDistance)[0] ?? desired

  const open = chooseOpenCandidate(desired, siblings, bounds, gap, snapDistance)
  if (open) return done('open', true, open, withSiblings(open))

  const adjacent = chooseFittedAdjacentCandidate(desired, siblings, bounds, gap, snapDistance)
  if (adjacent) return done('adjacent', true, adjacent, withSiblings(adjacent))

  const stacked = tryStackBelowBlockingItems({ active: desired, baseItems: siblings, bounds, gap })
  if (stacked) return done('stack-below', true, stacked.item, stacked.items, true)

  const trimmed = tryPlaceByTrimmingNeighbor({
    active: preferred,
    baseItems: siblings,
    bounds,
    gap,
  })
  if (trimmed) return done('trim-neighbor', true, trimmed.item, trimmed.items, true)

  const pushed = pushOverlapsDown([...siblings, preferred], preferred.id, bounds, gap)
  if (pushed) {
    return done('push-down', true, findById(pushed, preferred.id) ?? preferred, pushed, true)
  }

  const openSlot = nearestOpenSlot(desired, siblings, bounds, gap)
  if (openSlot) return done('nearest-open-slot', true, openSlot, withSiblings(openSlot))

  return done('rejected', false, desired, cloneItems(layout.items))
}
