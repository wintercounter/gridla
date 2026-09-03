/**
 * Move solver. Given a requested position for one item, infer intent from
 * how the item overlaps its siblings and return a layout that honors it.
 *
 * Strategies run in order; each has a clear gate so behavior is predictable:
 *
 *  0. origin: requested position is within 4px of the current position.
 *  0b. reorder-column: item is part of a tight column; reorder it.
 *  1. push-x / push-y: slide overlapping siblings along one axis.
 *  1c. reorder-row: item is part of a tight row; reorder it.
 *  2. swap: item covers a sibling by >= 50% of the smaller area.
 *  2b. group-swap: item covers a whole row or column of siblings.
 *  2c. insert-column / insert-row: item arrives from another lane.
 *  2d. shrink-neighbor: trim a much larger neighbor to make room.
 *  3. snap: nearest edge-aligned free slot within `snapDistance`.
 *  3b. fit-open-slot: resize into an empty pocket between siblings.
 *  4. free: requested rect is clear.
 *  5. push-shrink-x / push-shrink-y: push then shrink a row or column.
 *  6. push-down: push overlapping siblings downward.
 *  7. fallback-snap: nearest valid slot within the item's own size.
 *  8. rejected.
 */

import {
  boundsInnerBottom,
  boundsInnerRight,
  canPlaceItem,
  clampItem,
  cloneItems,
  horizontalOverlap,
  itemArea,
  itemBottom,
  itemRight,
  overlapArea,
  rectsOverlap,
  rectsViolateGap,
  roundItem,
  verticalOverlap,
} from '../geometry'
import {
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
  type GridPoint,
} from '../model'
import {
  changedItemsFit,
  closestValidSlot,
  edgeAlignedSlots,
  emitTrace,
  findById,
  fixedAxesPreserved,
  isEdgeAnchoredAgainstPush,
  partitionItems,
  pushOverlapsDown,
  replaceItem,
  resolveOptions,
  snapCandidates,
  trimCandidate,
  type InternalResult,
  type SolveOptions,
  type SolveResult,
} from './shared'
import { boundsFromCanvas } from '../geometry'

// ---------------------------------------------------------------------------
// Push
// ---------------------------------------------------------------------------

function pushAttempt<T>(
  active: GridItem<T>,
  baseItems: readonly GridItem<T>[],
  bounds: GridBounds,
  gap: number,
  axis: GridAxis,
  direction: 'forward' | 'backward',
): GridItem<T>[] | null {
  const isX = axis === 'x'
  const minStart = isX ? bounds.padding.left : bounds.padding.top
  const maxEnd = isX ? boundsInnerRight(bounds) : boundsInnerBottom(bounds)
  const startKey = isX ? 'x' : 'y'
  const sizeKey = isX ? 'w' : 'h'
  const crossOverlap = isX ? verticalOverlap : horizontalOverlap

  const next = baseItems.map((item) => ({ ...item }))
  const activeStart = active[startKey]
  const activeEnd = active[startKey] + active[sizeKey]
  const overlapsActive = (item: GridItem<T>) => {
    if (crossOverlap(item, active) <= 0) return false
    const itemStart = item[startKey]
    const itemEnd = item[startKey] + item[sizeKey]
    return itemStart < activeEnd + gap && itemEnd + gap > activeStart
  }

  if (next.some((item) => isLocked(item) && overlapsActive(item))) return null

  const directOverlaps = next
    .filter((item) => !isGhost(item) && !isLocked(item) && overlapsActive(item))
    .sort((a, b) =>
      direction === 'forward' ? a[startKey] - b[startKey] : b[startKey] - a[startKey],
    )
  for (const item of directOverlaps) {
    if (isEdgeAnchoredAgainstPush(item, bounds, axis, direction)) return null
  }
  let cursor = direction === 'forward' ? activeEnd + gap : activeStart - gap
  for (const item of directOverlaps) {
    if (direction === 'forward') {
      const newStart = cursor
      if (newStart + item[sizeKey] > maxEnd) return null
      if (isX) item.x = newStart
      else item.y = newStart
      cursor = newStart + item[sizeKey] + gap
    } else {
      const newStart = cursor - item[sizeKey]
      if (newStart < minStart) return null
      if (isX) item.x = newStart
      else item.y = newStart
      cursor = newStart - gap
    }
  }

  for (let iter = 0; iter < 16; iter += 1) {
    let changed = false
    const sorted = next
      .slice()
      .sort((a, b) =>
        direction === 'forward' ? a[startKey] - b[startKey] : b[startKey] - a[startKey],
      )
    for (let i = 0; i < sorted.length; i += 1) {
      const item = sorted[i]
      if (isGhost(item) || isLocked(item)) continue
      for (let j = 0; j < sorted.length; j += 1) {
        if (i === j) continue
        const other = sorted[j]
        if (crossOverlap(item, other) <= 0) continue
        const itemStart = item[startKey]
        const itemEnd = item[startKey] + item[sizeKey]
        const otherStart = other[startKey]
        const otherEnd = other[startKey] + other[sizeKey]
        if (itemStart < otherEnd + gap && itemEnd + gap > otherStart) {
          const itemDist = direction === 'forward' ? itemStart - activeStart : activeEnd - itemEnd
          const otherDist =
            direction === 'forward' ? otherStart - activeStart : activeEnd - otherEnd
          const pushed = itemDist >= otherDist ? item : other
          if (isGhost(pushed) || isLocked(pushed)) return null
          if (isEdgeAnchoredAgainstPush(pushed, bounds, axis, direction)) return null
          const inner = pushed === item ? other : item
          if (direction === 'forward') {
            const newStart = inner[startKey] + inner[sizeKey] + gap
            if (newStart + pushed[sizeKey] > maxEnd) return null
            if (newStart !== pushed[startKey]) {
              if (isX) pushed.x = newStart
              else pushed.y = newStart
              changed = true
            }
          } else {
            const newStart = inner[startKey] - gap - pushed[sizeKey]
            if (newStart < minStart) return null
            if (newStart !== pushed[startKey]) {
              if (isX) pushed.x = newStart
              else pushed.y = newStart
              changed = true
            }
          }
        }
      }
    }
    if (!changed) break
  }

  const allItems = [...next, active]
  for (let i = 0; i < allItems.length; i += 1) {
    for (let j = i + 1; j < allItems.length; j += 1) {
      if (rectsViolateGap(allItems[i], allItems[j], gap)) return null
    }
  }
  return next
}

function tryPushSiblings<T>(
  active: GridItem<T>,
  baseItems: readonly GridItem<T>[],
  bounds: GridBounds,
  gap: number,
  axis: GridAxis,
): GridItem<T>[] | null {
  return (
    pushAttempt(active, baseItems, bounds, gap, axis, 'forward') ??
    pushAttempt(active, baseItems, bounds, gap, axis, 'backward')
  )
}

/**
 * Push siblings forward along `axis`; when the chain hits the canvas edge,
 * shrink the pushed siblings proportionally (down to `min` or 40% of size).
 */
export function pushAndShrinkSiblings<T>(
  active: GridItem<T>,
  baseItems: readonly GridItem<T>[],
  bounds: GridBounds,
  gap: number,
  axis: GridAxis,
  snapDistance: number,
): GridItem<T>[] | null {
  const isX = axis === 'x'
  const maxEnd = isX ? boundsInnerRight(bounds) : boundsInnerBottom(bounds)
  const startKey = isX ? 'x' : 'y'
  const sizeKey = isX ? 'w' : 'h'
  const crossSizeKey = isX ? 'h' : 'w'
  const minKey = isX ? 'minW' : 'minH'
  const crossOverlap = isX ? verticalOverlap : horizontalOverlap
  const FLOOR = 0.4
  const SUBSTANTIAL_CROSS_RATIO = 0.5
  const substantialCrossOverlap = (a: GridItem<T>, b: GridItem<T>): boolean => {
    const overlap = crossOverlap(a, b)
    if (overlap <= 0) return false
    const minCross = Math.min(a[crossSizeKey], b[crossSizeKey])
    if (minCross <= 0) return false
    return overlap / minCross >= SUBSTANTIAL_CROSS_RATIO
  }

  const next = baseItems.map((item) => ({ ...item }))
  const activeStart = active[startKey]
  const activeEnd = active[startKey] + active[sizeKey]
  const overlapsActive = (item: GridItem<T>) => {
    if (!substantialCrossOverlap(item, active)) return false
    const itemStart = item[startKey]
    const itemEnd = item[startKey] + item[sizeKey]
    return itemStart < activeEnd + gap && itemEnd + gap > activeStart
  }

  if (next.some((item) => isLocked(item) && overlapsActive(item))) return null

  const directOverlaps = next
    .filter((item) => !isGhost(item) && !isLocked(item) && overlapsActive(item))
    .sort((a, b) => a[startKey] - b[startKey])

  const significantOverlap = directOverlaps.some((item) => {
    const itemStart = item[startKey]
    const itemEnd = item[startKey] + item[sizeKey]
    return Math.min(activeEnd, itemEnd) - Math.max(activeStart, itemStart) > snapDistance
  })
  if (!significantOverlap) return null

  const minSize = (item: GridItem<T>) =>
    isFixedOnAxis(item, axis)
      ? item[sizeKey]
      : Math.max(MIN_ITEM_SIZE, item[minKey] ?? MIN_ITEM_SIZE, item[sizeKey] * FLOOR)

  const chain: GridItem<T>[] = []
  const chainSet = new Set<string>()
  for (const item of directOverlaps) {
    chainSet.add(item.id)
    chain.push(item)
  }
  let grew = true
  while (grew) {
    grew = false
    for (const sib of next) {
      if (chainSet.has(sib.id) || sib.id === active.id) continue
      if (isGhost(sib) || isLocked(sib)) continue
      if (sib[startKey] < activeStart) continue
      for (const member of chain) {
        if (sib.id === member.id) continue
        if (!substantialCrossOverlap(sib, member)) continue
        chainSet.add(sib.id)
        chain.push(sib)
        grew = true
        break
      }
    }
  }
  chain.sort((a, b) => a[startKey] - b[startKey])

  type Planned = {
    item: GridItem<T>
    origStart: number
    origSize: number
    newStart: number
    newSize: number
    pushed: boolean
  }
  const planned: Planned[] = chain.map((item) => ({
    item,
    origStart: item[startKey],
    origSize: item[sizeKey],
    newStart: item[startKey],
    newSize: item[sizeKey],
    pushed: false,
  }))
  let cursor = activeEnd + gap
  for (const p of planned) {
    p.newStart = Math.max(cursor, p.origStart)
    p.pushed = p.newStart > p.origStart + 0.5
    cursor = p.newStart + p.newSize + gap
  }

  const chainTail = planned[planned.length - 1]
  const overflow = chainTail.newStart + chainTail.newSize - maxEnd
  if (overflow > 0.5) {
    const pushedItems = planned.filter((p) => p.pushed)
    if (pushedItems.length === 0) return null
    let need = overflow
    const MAX_ITER = chain.length + 4
    for (let iter = 0; iter < MAX_ITER && need > 0.5; iter += 1) {
      let flexTotal = 0
      for (const p of pushedItems) if (p.newSize > minSize(p.item)) flexTotal += p.newSize
      if (flexTotal <= 0) break
      let applied = 0
      for (const p of pushedItems) {
        const ms = minSize(p.item)
        if (p.newSize <= ms) continue
        const share = need * (p.newSize / flexTotal)
        const clamped = Math.max(ms, p.newSize - share)
        applied += p.newSize - clamped
        p.newSize = clamped
      }
      need -= applied
      if (applied < 0.01) break
    }
    if (need > 0.5) return null
    cursor = activeEnd + gap
    for (const p of planned) {
      p.newStart = cursor
      cursor = p.newStart + p.newSize + gap
    }
  }

  for (const p of planned) {
    const size = Math.max(minSize(p.item), Math.round(p.newSize))
    const start = Math.round(p.newStart)
    if (isX) {
      p.item.x = start
      p.item.w = size
    } else {
      p.item.y = start
      p.item.h = size
    }
  }

  const allItems = [...next, active]
  for (let i = 0; i < allItems.length; i += 1) {
    for (let j = i + 1; j < allItems.length; j += 1) {
      if (rectsViolateGap(allItems[i], allItems[j], gap)) return null
    }
  }
  return next
}

// ---------------------------------------------------------------------------
// Reorder / insert
// ---------------------------------------------------------------------------

function withinBoundsAndNoOverlap<T>(
  next: readonly GridItem<T>[],
  bounds: GridBounds,
  activeId?: string,
) {
  for (const it of next) {
    if (activeId !== undefined && it.id === activeId) continue
    if (it.x < bounds.padding.left - 1) return false
    if (it.y < bounds.padding.top - 1) return false
    if (it.x + it.w > boundsInnerRight(bounds) + 1) return false
    if (bounds.height !== null && it.y + it.h > bounds.height - bounds.padding.bottom + 1)
      return false
  }
  for (let i = 0; i < next.length; i += 1) {
    for (let j = i + 1; j < next.length; j += 1) {
      const a = next[i]
      const b = next[j]
      if (isGhost(a) || isGhost(b)) continue
      if (rectsOverlap(a, b)) return false
    }
  }
  return true
}

function tryChainRowReorder<T>({
  active,
  baseItems,
  bounds,
  currentItems,
}: {
  active: GridItem<T>
  baseItems: readonly GridItem<T>[]
  bounds: GridBounds
  currentItems: readonly GridItem<T>[]
}): InternalResult<T> | null {
  const origin = findById(currentItems, active.id)
  if (!origin) return null
  const TOL = 4
  const members = baseItems
    .filter(
      (it) =>
        !isGhost(it) &&
        !isLocked(it) &&
        Math.abs(it.y - origin.y) <= TOL &&
        Math.abs(it.h - origin.h) <= TOL,
    )
    .sort((a, b) => a.x - b.x)
  if (members.length < 2) return null

  const activeBottom = itemBottom(active)
  const yOverlapsChain = members.some(
    (it) => Math.min(activeBottom, itemBottom(it)) - Math.max(active.y, it.y) >= active.h * 0.5,
  )
  if (!yOverlapsChain) return null

  const currentLogicalIndex = members.filter((it) => it.x < origin.x).length
  const desiredCenter = active.x + active.w / 2
  let newLogicalIndex = members.length
  for (let i = 0; i < members.length; i += 1) {
    if (desiredCenter < members[i].x + members[i].w / 2) {
      newLogicalIndex = i
      break
    }
  }
  if (newLogicalIndex === currentLogicalIndex) return null

  const reordered = [...members]
  reordered.splice(newLogicalIndex, 0, origin)
  const fullChain = [...members, origin].sort((a, b) => a.x - b.x)
  const chainLeft = fullChain[0].x
  const chainRight = itemRight(fullChain[fullChain.length - 1])
  const chainWidth = chainRight - chainLeft
  let totalItemW = 0
  for (const it of reordered) totalItemW += it.w
  const numGaps = reordered.length - 1
  const totalGapBudget = chainWidth - totalItemW
  if (totalGapBudget < 0) return null
  const evenGap = numGaps > 0 ? Math.floor(totalGapBudget / numGaps) : totalGapBudget
  const remainderGap = numGaps > 0 ? totalGapBudget - evenGap * numGaps : 0

  let cursor = chainLeft
  const newPositions = new Map<string, number>()
  for (let i = 0; i < reordered.length; i += 1) {
    newPositions.set(reordered[i].id, cursor)
    cursor += reordered[i].w
    if (i < numGaps) {
      cursor += evenGap
      if (i === 0) cursor += remainderGap
    }
  }
  const next = currentItems.map((it) => {
    const newX = newPositions.get(it.id)
    return newX === undefined ? { ...it } : { ...it, x: newX }
  })
  if (!withinBoundsAndNoOverlap(next, bounds)) return null
  const newActive = findById(next, active.id)
  if (!newActive) return null
  return { item: newActive, items: next }
}

function tryChainColumnReorder<T>({
  active,
  baseItems,
  bounds,
  currentItems,
  gap,
}: {
  active: GridItem<T>
  baseItems: readonly GridItem<T>[]
  bounds: GridBounds
  currentItems: readonly GridItem<T>[]
  gap: number
}): InternalResult<T> | null {
  const origin = findById(currentItems, active.id)
  if (!origin) return null
  const TOL = 4
  const members = baseItems
    .filter(
      (it) =>
        !isGhost(it) &&
        !isLocked(it) &&
        Math.abs(it.x - origin.x) <= TOL &&
        Math.abs(it.w - origin.w) <= TOL,
    )
    .sort((a, b) => a.y - b.y)
  if (members.length < 2) return null
  // Heights are equalized across the column; a fixed-height member cannot take part.
  if (members.some((it) => isFixedHeight(it)) || isFixedHeight(origin)) return null

  const activeRight = itemRight(active)
  const xOverlapsChain = members.some(
    (it) => Math.min(activeRight, itemRight(it)) - Math.max(active.x, it.x) >= active.w * 0.25,
  )
  if (!xOverlapsChain) return null

  const currentLogicalIndex = members.filter((it) => it.y < origin.y).length
  const desiredCenter = active.y + active.h / 2
  let newLogicalIndex = members.length
  for (let i = 0; i < members.length; i += 1) {
    if (desiredCenter < members[i].y + members[i].h / 2) {
      newLogicalIndex = i
      break
    }
  }

  const innerTop = bounds.padding.top
  const innerBottom = boundsInnerBottom(bounds)
  const EDGE_TOL = 2
  const activeBottom = active.y + active.h
  if (
    Number.isFinite(innerBottom) &&
    activeBottom >= innerBottom - EDGE_TOL &&
    members.length > 0
  ) {
    newLogicalIndex = members.length
  } else if (active.y <= innerTop + EDGE_TOL) {
    newLogicalIndex = 0
  }
  if (newLogicalIndex === currentLogicalIndex) return null

  const reordered = [...members]
  reordered.splice(newLogicalIndex, 0, origin)
  const fullChain = [...members, origin].sort((a, b) => a.y - b.y)
  const chainTop = fullChain[0].y
  const chainBottom = itemBottom(fullChain[fullChain.length - 1])
  const chainHeight = chainBottom - chainTop

  const N = reordered.length
  const numGaps = N - 1
  const contentBudget = chainHeight - numGaps * gap
  if (contentBudget < N) return null
  const equalH = Math.floor(contentBudget / N)
  const lastH = contentBudget - equalH * (N - 1)
  if (reordered.some((it, i) => (it.minH ?? MIN_ITEM_SIZE) > (i === N - 1 ? lastH : equalH)))
    return null
  const newHeights = new Map<string, number>()
  for (let i = 0; i < N; i += 1) newHeights.set(reordered[i].id, i === N - 1 ? lastH : equalH)

  let cursor = chainTop
  const newPositions = new Map<string, number>()
  for (let i = 0; i < N; i += 1) {
    const it = reordered[i]
    newPositions.set(it.id, cursor)
    cursor += newHeights.get(it.id) ?? it.h
    if (i < numGaps) cursor += gap
  }
  const next = currentItems.map((it) => {
    const newY = newPositions.get(it.id)
    const newH = newHeights.get(it.id)
    if (newY === undefined || newH === undefined) return { ...it }
    return { ...it, y: newY, h: newH }
  })
  if (!withinBoundsAndNoOverlap(next, bounds)) return null
  const newActive = findById(next, active.id)
  if (!newActive) return null
  return { item: newActive, items: next }
}

function tryInsertIntoRow<T>({
  active,
  baseItems,
  bounds,
  currentItems,
  gap,
}: {
  active: GridItem<T>
  baseItems: readonly GridItem<T>[]
  bounds: GridBounds
  currentItems: readonly GridItem<T>[]
  gap: number
}): InternalResult<T> | null {
  const origin = findById(currentItems, active.id)
  if (!origin) return null
  const TOL = 4
  const activeCenterY = active.y + active.h / 2
  const activeCenterX = active.x + active.w / 2

  const inLaneByY = baseItems.filter(
    (s) =>
      !isGhost(s) &&
      !isLocked(s) &&
      s.id !== active.id &&
      activeCenterY >= s.y - TOL &&
      activeCenterY <= s.y + s.h + TOL,
  )
  if (inLaneByY.length === 0) return null

  const clusters = new Map<string, GridItem<T>[]>()
  for (const s of inLaneByY) {
    const key = `${Math.round(s.y / TOL)}-${Math.round(s.h / TOL)}`
    const arr = clusters.get(key) ?? []
    arr.push(s)
    clusters.set(key, arr)
  }
  let rowMembers: GridItem<T>[] = []
  for (const arr of clusters.values()) if (arr.length > rowMembers.length) rowMembers = arr
  if (rowMembers.length < 2) return null
  if (rowMembers.some((it) => isFixedHeight(it)) || isFixedHeight(active)) return null
  rowMembers.sort((a, b) => a.x - b.x)
  const rowY = rowMembers[0].y
  const rowH = rowMembers[0].h
  if (Math.abs(origin.y - rowY) <= TOL && Math.abs(origin.h - rowH) <= TOL) return null

  let insertAt = rowMembers.length
  for (let i = 0; i < rowMembers.length; i += 1) {
    if (activeCenterX < rowMembers[i].x + rowMembers[i].w / 2) {
      insertAt = i
      break
    }
  }
  // The item adopts the row's height; refuse when that breaks its own constraints.
  if (
    isFixedHeight(active) ||
    rowH < (active.minH ?? MIN_ITEM_SIZE) ||
    (active.maxH !== undefined && rowH > active.maxH)
  ) {
    return null
  }
  const adaptedActive: GridItem<T> = { ...active, y: rowY, h: rowH }
  const newChain = [...rowMembers.slice(0, insertAt), adaptedActive, ...rowMembers.slice(insertAt)]

  const rowLeft = rowMembers[0].x
  const rowRight = itemRight(rowMembers[rowMembers.length - 1])
  const rowExtent = rowRight - rowLeft
  const numGaps = newChain.length - 1
  const totalItemW = newChain.reduce((acc, it) => acc + it.w, 0)
  const overflow = totalItemW + numGaps * gap - rowExtent
  const FLOOR = 0.4
  const minSize = (it: GridItem<T>) =>
    isFixedWidth(it) ? it.w : Math.max(MIN_ITEM_SIZE, it.minW ?? MIN_ITEM_SIZE, it.w * FLOOR)

  const newWidths = newChain.map((it) => it.w)
  if (overflow > 0.5) {
    let need = overflow
    const MAX_ITER = newChain.length + 4
    for (let iter = 0; iter < MAX_ITER && need > 0.5; iter += 1) {
      let flexTotal = 0
      for (let i = 0; i < newChain.length; i += 1) {
        if (newWidths[i] > minSize(newChain[i])) flexTotal += newWidths[i]
      }
      if (flexTotal <= 0) break
      let applied = 0
      for (let i = 0; i < newChain.length; i += 1) {
        const ms = minSize(newChain[i])
        if (newWidths[i] <= ms) continue
        const share = need * (newWidths[i] / flexTotal)
        const clamped = Math.max(ms, newWidths[i] - share)
        applied += newWidths[i] - clamped
        newWidths[i] = clamped
      }
      need -= applied
      if (applied < 0.01) break
    }
    if (need > 0.5) return null
  }

  let cursor = rowLeft
  const positions = new Map<string, { x: number; w: number }>()
  for (let i = 0; i < newChain.length; i += 1) {
    const w = Math.max(1, Math.round(newWidths[i]))
    positions.set(newChain[i].id, { x: Math.round(cursor), w })
    cursor += w + gap
  }

  let placedActive: GridItem<T> | null = null
  const next: GridItem<T>[] = []
  for (const it of currentItems) {
    if (it.id === active.id) {
      const pos = positions.get(active.id)
      if (!pos) return null
      placedActive = { ...adaptedActive, x: pos.x, w: pos.w }
      next.push(placedActive)
      continue
    }
    const pos = positions.get(it.id)
    next.push(pos ? { ...it, x: pos.x, w: pos.w } : { ...it })
  }
  if (!placedActive) return null

  const minStart = bounds.padding.left
  const maxEnd = boundsInnerRight(bounds)
  for (const it of next) {
    if (it.id === active.id) continue
    if (it.x < minStart - 1) return null
    if (it.x + it.w > maxEnd + 1) return null
  }
  for (let i = 0; i < next.length; i += 1) {
    for (let j = i + 1; j < next.length; j += 1) {
      const a = next[i]
      const b = next[j]
      if (isGhost(a) || isGhost(b)) continue
      if (rectsOverlap(a, b)) return null
    }
  }
  return { item: placedActive, items: next }
}

function tryInsertIntoColumn<T>({
  active,
  baseItems,
  bounds,
  currentItems,
  gap,
}: {
  active: GridItem<T>
  baseItems: readonly GridItem<T>[]
  bounds: GridBounds
  currentItems: readonly GridItem<T>[]
  gap: number
}): InternalResult<T> | null {
  const origin = findById(currentItems, active.id)
  if (!origin) return null
  const TOL = 4
  const activeCenterX = active.x + active.w / 2
  const activeCenterY = active.y + active.h / 2

  const inLaneByX = baseItems.filter(
    (s) =>
      !isGhost(s) &&
      !isLocked(s) &&
      s.id !== active.id &&
      activeCenterX >= s.x - TOL &&
      activeCenterX <= s.x + s.w + TOL,
  )
  if (inLaneByX.length === 0) return null

  const clusters = new Map<string, GridItem<T>[]>()
  for (const s of inLaneByX) {
    const key = `${Math.round(s.x / TOL)}-${Math.round(s.w / TOL)}`
    const arr = clusters.get(key) ?? []
    arr.push(s)
    clusters.set(key, arr)
  }
  let columnMembers: GridItem<T>[] = []
  for (const arr of clusters.values()) if (arr.length > columnMembers.length) columnMembers = arr
  if (columnMembers.length < 2) return null
  if (columnMembers.some((it) => isFixedHeight(it)) || isFixedHeight(active)) return null
  columnMembers.sort((a, b) => a.y - b.y)
  const colX = columnMembers[0].x
  const colW = columnMembers[0].w
  if (Math.abs(origin.x - colX) <= TOL && Math.abs(origin.w - colW) <= TOL) return null
  if (active.w < colW * 0.5) return null

  let insertAt = columnMembers.length
  for (let i = 0; i < columnMembers.length; i += 1) {
    if (activeCenterY < columnMembers[i].y + columnMembers[i].h / 2) {
      insertAt = i
      break
    }
  }
  if (
    isFixedWidth(active) ||
    colW < (active.minW ?? MIN_ITEM_SIZE) ||
    (active.maxW !== undefined && colW > active.maxW)
  ) {
    return null
  }
  const adaptedActive: GridItem<T> = { ...active, x: colX, w: colW }
  const newChain = [
    ...columnMembers.slice(0, insertAt),
    adaptedActive,
    ...columnMembers.slice(insertAt),
  ]
  const colTop = columnMembers[0].y
  const colBottom = itemBottom(columnMembers[columnMembers.length - 1])
  const N = newChain.length
  const numGaps = N - 1
  const contentBudget = colBottom - colTop - numGaps * gap
  if (contentBudget < N) return null
  const equalH = Math.floor(contentBudget / N)
  const lastH = contentBudget - equalH * (N - 1)
  if (newChain.some((it, i) => (it.minH ?? MIN_ITEM_SIZE) > (i === N - 1 ? lastH : equalH)))
    return null

  let cursor = colTop
  const positions = new Map<string, { y: number; h: number }>()
  for (let i = 0; i < N; i += 1) {
    const h = i === N - 1 ? lastH : equalH
    positions.set(newChain[i].id, { y: Math.round(cursor), h })
    cursor += h + gap
  }

  let placedActive: GridItem<T> | null = null
  const next: GridItem<T>[] = []
  for (const it of currentItems) {
    if (it.id === active.id) {
      const pos = positions.get(active.id)
      if (!pos) return null
      placedActive = { ...adaptedActive, y: pos.y, h: pos.h }
      next.push(placedActive)
      continue
    }
    const pos = positions.get(it.id)
    next.push(pos ? { ...it, y: pos.y, h: pos.h } : { ...it })
  }
  if (!placedActive) return null

  const minStart = bounds.padding.top
  const maxEnd = boundsInnerBottom(bounds)
  for (const it of next) {
    if (it.id === active.id) continue
    if (it.y < minStart - 1) return null
    if (Number.isFinite(maxEnd) && it.y + it.h > maxEnd + 1) return null
  }
  for (let i = 0; i < next.length; i += 1) {
    for (let j = i + 1; j < next.length; j += 1) {
      const a = next[i]
      const b = next[j]
      if (isGhost(a) || isGhost(b)) continue
      if (rectsOverlap(a, b)) return null
    }
  }
  return { item: placedActive, items: next }
}

// ---------------------------------------------------------------------------
// Swap
// ---------------------------------------------------------------------------

function trySwapWithCollision<T>({
  active,
  baseItems,
  bounds,
  currentItems,
  excludeTargets,
}: {
  active: GridItem<T>
  baseItems: readonly GridItem<T>[]
  bounds: GridBounds
  currentItems: readonly GridItem<T>[]
  excludeTargets?: ReadonlySet<string>
}): (InternalResult<T> & { targetId: string }) | null {
  const origin = findById(currentItems, active.id)
  if (!origin) return null

  const candidates = baseItems
    .map((item) => ({ item, area: overlapArea(item, active) }))
    .filter(({ item, area }) => {
      if (isGhost(item) || isLocked(item) || area <= 0) return false
      if (excludeTargets?.has(item.id)) return false
      if (
        isEdgeAnchoredAgainstPush(item, bounds, 'x', 'backward') ||
        isEdgeAnchoredAgainstPush(item, bounds, 'x', 'forward') ||
        isEdgeAnchoredAgainstPush(item, bounds, 'y', 'backward') ||
        isEdgeAnchoredAgainstPush(item, bounds, 'y', 'forward')
      ) {
        return false
      }
      return area >= Math.min(itemArea(item), itemArea(active)) * 0.5
    })
    .sort((left, right) => right.area - left.area)

  for (const { item: target } of candidates) {
    const nextActiveA = clampItem({ ...active, x: target.x, y: target.y }, bounds)
    const nextTargetA = clampItem({ ...target, x: origin.x, y: origin.y }, bounds)
    const positionSwap = currentItems.map((item) => {
      if (item.id === active.id) return nextActiveA
      if (item.id === target.id) return nextTargetA
      return { ...item }
    })
    const swappedIds = new Set([active.id, target.id])
    const sizesPreserved =
      nextActiveA.w === active.w &&
      nextActiveA.h === active.h &&
      nextTargetA.w === target.w &&
      nextTargetA.h === target.h
    if (sizesPreserved && changedItemsFit(positionSwap, swappedIds, bounds)) {
      return { item: nextActiveA, items: positionSwap, targetId: target.id }
    }

    const sameRow =
      Math.min(itemBottom(origin), itemBottom(target)) - Math.max(origin.y, target.y) > 0
    const sameCol =
      Math.min(itemRight(origin), itemRight(target)) - Math.max(origin.x, target.x) > 0

    if (sameRow && origin.x !== target.x) {
      const activeIsLeading = origin.x < target.x
      const nextActiveX = activeIsLeading ? itemRight(target) - active.w : target.x
      const nextTargetX = activeIsLeading ? origin.x : itemRight(origin) - target.w
      const nextActiveB = clampItem({ ...active, x: nextActiveX, y: target.y }, bounds)
      const nextTargetB = clampItem({ ...target, x: nextTargetX, y: origin.y }, bounds)
      const rowSwap = currentItems.map((item) => {
        if (item.id === active.id) return nextActiveB
        if (item.id === target.id) return nextTargetB
        return { ...item }
      })
      if (changedItemsFit(rowSwap, swappedIds, bounds)) {
        return { item: nextActiveB, items: rowSwap, targetId: target.id }
      }
    }
    if (sameCol && origin.y !== target.y) {
      const activeIsLeading = origin.y < target.y
      const nextActiveY = activeIsLeading ? itemBottom(target) - active.h : target.y
      const nextTargetY = activeIsLeading ? origin.y : itemBottom(origin) - target.h
      const nextActiveB = clampItem({ ...active, x: target.x, y: nextActiveY }, bounds)
      const nextTargetB = clampItem({ ...target, x: origin.x, y: nextTargetY }, bounds)
      const colSwap = currentItems.map((item) => {
        if (item.id === active.id) return nextActiveB
        if (item.id === target.id) return nextTargetB
        return { ...item }
      })
      if (changedItemsFit(colSwap, swappedIds, bounds)) {
        return { item: nextActiveB, items: colSwap, targetId: target.id }
      }
    }
  }
  return null
}

function tryMultiSiblingSwap<T>({
  active,
  baseItems,
  bounds,
  currentItems,
}: {
  active: GridItem<T>
  baseItems: readonly GridItem<T>[]
  bounds: GridBounds
  currentItems: readonly GridItem<T>[]
}): InternalResult<T> | null {
  const origin = findById(currentItems, active.id)
  if (!origin) return null
  const overlapping = baseItems.filter(
    (item) => !isGhost(item) && !isLocked(item) && overlapArea(item, active) > 0,
  )
  if (overlapping.length < 2) return null
  const TOL = 4

  const yTops = overlapping.map((item) => item.y)
  const yBottoms = overlapping.map((item) => item.y + item.h)
  const minYTop = Math.min(...yTops)
  const maxYTop = Math.max(...yTops)
  const minYBottom = Math.min(...yBottoms)
  const maxYBottom = Math.max(...yBottoms)
  const yAligned = maxYTop - minYTop <= TOL && maxYBottom - minYBottom <= TOL
  const groupXStart = Math.min(...overlapping.map((item) => item.x))
  const groupXEnd = Math.max(...overlapping.map((item) => item.x + item.w))
  const xCovered = groupXStart <= active.x + TOL && groupXEnd + TOL >= active.x + active.w
  const originOutsideGroup = origin.y + origin.h <= minYTop + TOL || origin.y + TOL >= maxYBottom

  if (yAligned && xCovered && originOutsideGroup) {
    const dy = origin.y - minYTop
    const rowHeight = maxYBottom - minYTop
    const draggedDown = origin.y < minYTop
    const activeNewY = draggedDown ? minYTop + rowHeight - active.h : minYTop
    const overlappingIds = new Set(overlapping.map((item) => item.id))
    const nextActive = clampItem({ ...active, y: activeNewY }, bounds)
    const next = currentItems.map((item) => {
      if (item.id === active.id) return nextActive
      if (overlappingIds.has(item.id)) return clampItem({ ...item, y: item.y + dy }, bounds)
      return { ...item }
    })
    if (changedItemsFit(next, new Set([active.id, ...overlappingIds]), bounds)) {
      return { item: nextActive, items: next }
    }
  }

  const xStarts = overlapping.map((item) => item.x)
  const xEnds = overlapping.map((item) => item.x + item.w)
  const minXStart = Math.min(...xStarts)
  const maxXStart = Math.max(...xStarts)
  const minXEnd = Math.min(...xEnds)
  const maxXEnd = Math.max(...xEnds)
  const xAligned = maxXStart - minXStart <= TOL && maxXEnd - minXEnd <= TOL
  const groupYStart = Math.min(...overlapping.map((item) => item.y))
  const groupYEnd = Math.max(...overlapping.map((item) => item.y + item.h))
  const yCovered = groupYStart <= active.y + TOL && groupYEnd + TOL >= active.y + active.h
  const originOutsideGroupX = origin.x + origin.w <= minXStart + TOL || origin.x + TOL >= maxXEnd

  if (xAligned && yCovered && originOutsideGroupX) {
    const dx = origin.x - minXStart
    const colWidth = maxXEnd - minXStart
    const draggedRight = origin.x < minXStart
    const activeNewX = draggedRight ? minXStart + colWidth - active.w : minXStart
    const overlappingIds = new Set(overlapping.map((item) => item.id))
    const nextActive = clampItem({ ...active, x: activeNewX }, bounds)
    const next = currentItems.map((item) => {
      if (item.id === active.id) return nextActive
      if (overlappingIds.has(item.id)) return clampItem({ ...item, x: item.x + dx }, bounds)
      return { ...item }
    })
    if (changedItemsFit(next, new Set([active.id, ...overlappingIds]), bounds)) {
      return { item: nextActive, items: next }
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Shrink neighbor / fit open slot
// ---------------------------------------------------------------------------

function tryShrinkNeighborsForMove<T>({
  active,
  baseItems,
  bounds,
  currentItems,
  gap,
}: {
  active: GridItem<T>
  baseItems: readonly GridItem<T>[]
  bounds: GridBounds
  currentItems: readonly GridItem<T>[]
  gap: number
}): InternalResult<T> | null {
  const origin = findById(currentItems, active.id) ?? active
  const dx = active.x - origin.x
  const dy = active.y - origin.y
  if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return null
  const motionAlongY = Math.abs(dy) >= Math.abs(dx)

  const SHRINK_MIN_OVERLAP_RATIO = 0.25
  const targets = baseItems
    .map((item) => ({ item, area: overlapArea(item, active) }))
    .filter(({ item, area }) => {
      if (area <= 0 || isGhost(item) || isLocked(item)) return false
      const targetArea = itemArea(item)
      const activeArea = itemArea(active)
      const sizeEligible =
        targetArea >= activeArea * 1.5 || item.w >= active.w * 1.5 || item.h >= active.h * 1.5
      if (!sizeEligible) return false
      const minArea = Math.min(targetArea, activeArea)
      if (minArea <= 0) return false
      if (area / minArea < SHRINK_MIN_OVERLAP_RATIO) return false
      const insideOnBothAxes = active.w <= item.w + 1 && active.h <= item.h + 1
      return !insideOnBothAxes
    })
    .sort((left, right) => right.area - left.area)
  if (targets.length === 0) return null
  const target = targets[0].item

  const activeCenterX = active.x + active.w / 2
  const activeCenterY = active.y + active.h / 2
  const targetCenterX = target.x + target.w / 2
  const targetCenterY = target.y + target.h / 2
  const EXTEND_THRESHOLD_RATIO = 0.2
  const yExtendThreshold = active.h * EXTEND_THRESHOLD_RATIO
  const xExtendThreshold = active.w * EXTEND_THRESHOLD_RATIO
  let trimSide: 'top' | 'right' | 'bottom' | 'left'
  if (motionAlongY) {
    if (dy > 0 && target.y - active.y >= yExtendThreshold) trimSide = 'top'
    else if (dy < 0 && itemBottom(active) - itemBottom(target) >= yExtendThreshold)
      trimSide = 'bottom'
    else if (active.w > target.w) trimSide = activeCenterY < targetCenterY ? 'top' : 'bottom'
    else trimSide = activeCenterX < targetCenterX ? 'left' : 'right'
  } else {
    if (dx > 0 && target.x - active.x >= xExtendThreshold) trimSide = 'left'
    else if (dx < 0 && itemRight(active) - itemRight(target) >= xExtendThreshold) trimSide = 'right'
    else if (active.h > target.h) trimSide = activeCenterX < targetCenterX ? 'left' : 'right'
    else trimSide = activeCenterY < targetCenterY ? 'top' : 'bottom'
  }

  const adapted: GridItem<T> = { ...active }
  const minH = active.minH ?? MIN_ITEM_SIZE
  if (trimSide === 'left' || trimSide === 'right') {
    adapted.h = Math.max(minH, target.h)
    adapted.y = target.y
    adapted.x = trimSide === 'left' ? target.x : target.x + target.w - adapted.w
  }

  const trimmed = trimCandidate(target, adapted, gap, trimSide)
  if (!trimmed) return null
  if (rectsOverlap(trimmed, adapted)) return null

  const next = baseItems.map((entry) => (entry.id === target.id ? trimmed : { ...entry }))
  const clampedAdapted = clampItem(adapted, bounds)
  if (
    Math.abs(clampedAdapted.x - adapted.x) > 1 ||
    Math.abs(clampedAdapted.y - adapted.y) > 1 ||
    Math.abs(clampedAdapted.w - adapted.w) > 1 ||
    Math.abs(clampedAdapted.h - adapted.h) > 1
  ) {
    return null
  }
  for (const sibling of next) {
    if (sibling.id === adapted.id || isGhost(sibling)) continue
    if (rectsOverlap(sibling, adapted)) return null
  }
  return { item: adapted, items: [...next, adapted] }
}

function tryFitToOpenSlot<T>({
  active,
  baseItems,
  bounds,
  gap,
}: {
  active: GridItem<T>
  baseItems: readonly GridItem<T>[]
  bounds: GridBounds
  gap: number
}): GridItem<T> | null {
  const g = Math.max(0, gap)
  const innerLeft = bounds.padding.left
  const innerTop = bounds.padding.top
  const innerRight = boundsInnerRight(bounds)
  const innerBottom = boundsInnerBottom(bounds)
  const movable = baseItems.filter((s) => !isGhost(s))

  type Slot = { x: number; y: number; w: number; h: number }
  const candidates: Slot[] = []
  const pushIfClear = (slot: Slot, excludeIds: string[]) => {
    if (slot.w <= 0 || slot.h <= 0) return
    const blocked = movable.some((s) => {
      if (excludeIds.includes(s.id)) return false
      return (
        s.x < slot.x + slot.w && s.x + s.w > slot.x && s.y < slot.y + slot.h && s.y + s.h > slot.y
      )
    })
    if (!blocked) candidates.push(slot)
  }

  for (let i = 0; i < movable.length; i += 1) {
    for (let j = 0; j < movable.length; j += 1) {
      if (i === j) continue
      const a = movable[i]
      const b = movable[j]
      if (a.x + a.w >= b.x) continue
      const yTop = Math.max(a.y, b.y, innerTop)
      const yBottom = Math.min(a.y + a.h, b.y + b.h, innerBottom)
      if (yBottom <= yTop) continue
      const slotX = a.x + a.w + g
      const slotRight = b.x - g
      if (slotRight <= slotX) continue
      pushIfClear({ x: slotX, y: yTop, w: slotRight - slotX, h: yBottom - yTop }, [a.id, b.id])
    }
  }
  for (let i = 0; i < movable.length; i += 1) {
    for (let j = 0; j < movable.length; j += 1) {
      if (i === j) continue
      const a = movable[i]
      const b = movable[j]
      if (a.y + a.h >= b.y) continue
      const xLeft = Math.max(a.x, b.x, innerLeft)
      const xRight = Math.min(a.x + a.w, b.x + b.w, innerRight)
      if (xRight <= xLeft) continue
      const slotY = a.y + a.h + g
      const slotBottom = b.y - g
      if (slotBottom <= slotY) continue
      pushIfClear({ x: xLeft, y: slotY, w: xRight - xLeft, h: slotBottom - slotY }, [a.id, b.id])
    }
  }
  if (candidates.length === 0) return null

  const activeCx = active.x + active.w / 2
  const activeCy = active.y + active.h / 2
  let best: Slot | null = null
  let bestDistance = Number.POSITIVE_INFINITY
  // Only pockets close to the item's own size count as "its" hole; a much
  // larger opening would turn a small nudge into an unrequested resize.
  const FIT_MAX_RATIO = 1.5
  for (const slot of candidates) {
    if (slot.w > active.w * FIT_MAX_RATIO || slot.h > active.h * FIT_MAX_RATIO) continue
    if (
      activeCx < slot.x ||
      activeCx > slot.x + slot.w ||
      activeCy < slot.y ||
      activeCy > slot.y + slot.h
    ) {
      continue
    }
    const distance = Math.hypot(slot.x + slot.w / 2 - activeCx, slot.y + slot.h / 2 - activeCy)
    if (distance < bestDistance) {
      best = slot
      bestDistance = distance
    }
  }
  if (!best) return null
  const minW = active.minW ?? MIN_ITEM_SIZE
  const minH = active.minH ?? MIN_ITEM_SIZE
  if (best.w < minW || best.h < minH) return null
  return roundItem({ ...active, x: best.x, y: best.y, w: best.w, h: best.h })
}

// ---------------------------------------------------------------------------
// Public solver
// ---------------------------------------------------------------------------

/**
 * Input for `moveItem`.
 * @example moveItem({ layout, itemId: 'chart', position: { x: 240, y: 0 }, options: { gap: 8 } })
 */
export type MoveItemInput<T = unknown> = {
  layout: GridLayout<T>
  itemId: string
  /** Requested top-left position in canvas coordinates. */
  position: GridPoint
  options?: SolveOptions
}

/**
 * Move one item to a requested position. Siblings are pushed, swapped,
 * reordered, or shrunk as needed. Returns a new layout; inputs are not
 * mutated.
 */
export function moveItem<T = unknown>({
  layout,
  itemId,
  position,
  options,
}: MoveItemInput<T>): SolveResult<T> {
  const opts = resolveOptions(options)
  const { gap, snapDistance, snap, onTrace } = opts
  const currentItems = layout.items
  const bounds = boundsFromCanvas(layout.canvas)
  const origin = findById(currentItems, itemId)
  if (!origin) {
    throw new Error(`moveItem: item "${itemId}" is not in the layout`)
  }
  const item: GridItem<T> = { ...origin, x: position.x, y: position.y }

  const done = (
    strategy: SolveResult['strategy'],
    accepted: boolean,
    active: GridItem<T>,
    items: GridItem<T>[],
    shiftedSiblings = false,
  ): SolveResult<T> => {
    if (accepted && !fixedAxesPreserved(currentItems, items, itemId)) {
      emitTrace(onTrace, 'move', 'rejected', active, false)
      return {
        accepted: false,
        layout: { canvas: layout.canvas, items: cloneItems(currentItems) },
        item: active,
        strategy: 'rejected',
        shiftedSiblings: false,
      }
    }
    emitTrace(onTrace, 'move', strategy, active, accepted)
    return {
      accepted,
      layout: { canvas: layout.canvas, items },
      item: active,
      strategy,
      shiftedSiblings,
    }
  }

  const { baseItems, ghostItems } = partitionItems(currentItems, itemId)
  const innerLeft = bounds.padding.left
  const innerTop = bounds.padding.top
  const innerRight = Math.max(innerLeft, boundsInnerRight(bounds))
  const innerBottom =
    bounds.height === null
      ? Number.POSITIVE_INFINITY
      : Math.max(innerTop, boundsInnerBottom(bounds))
  const desired = roundItem({
    ...item,
    x: Math.max(innerLeft, Math.min(item.x, innerRight - item.w)),
    y:
      bounds.height === null
        ? Math.max(innerTop, item.y)
        : Math.max(innerTop, Math.min(item.y, innerBottom - item.h)),
  })

  const ORIGIN_SNAP_TOL = 4
  if (
    Math.abs(desired.x - origin.x) <= ORIGIN_SNAP_TOL &&
    Math.abs(desired.y - origin.y) <= ORIGIN_SNAP_TOL &&
    desired.w === origin.w &&
    desired.h === origin.h
  ) {
    return done('origin', true, origin, replaceItem(currentItems, origin))
  }

  const earlyColReordered = tryChainColumnReorder({
    active: desired,
    baseItems,
    bounds,
    currentItems,
    gap,
  })
  if (earlyColReordered) {
    return done('reorder-column', true, earlyColReordered.item, earlyColReordered.items, true)
  }

  const overlapsRowSibling = baseItems.some(
    (sibling) =>
      verticalOverlap(sibling, desired) > 0 &&
      sibling.x < desired.x + desired.w + gap &&
      sibling.x + sibling.w + gap > desired.x,
  )
  if (overlapsRowSibling) {
    const pushed = tryPushSiblings(desired, baseItems, bounds, gap, 'x')
    if (pushed) return done('push-x', true, desired, [...pushed, ...ghostItems, desired], true)
  }
  const overlapsColSibling = baseItems.some(
    (sibling) =>
      horizontalOverlap(sibling, desired) > 0 &&
      sibling.y < desired.y + desired.h + gap &&
      sibling.y + sibling.h + gap > desired.y,
  )
  if (overlapsColSibling) {
    const pushed = tryPushSiblings(desired, baseItems, bounds, gap, 'y')
    if (pushed) return done('push-y', true, desired, [...pushed, ...ghostItems, desired], true)
  }

  const chainReordered = tryChainRowReorder({ active: desired, baseItems, bounds, currentItems })
  if (chainReordered) {
    return done('reorder-row', true, chainReordered.item, chainReordered.items, true)
  }

  const swapped = trySwapWithCollision({ active: desired, baseItems, bounds, currentItems })
  if (swapped) {
    let workingItems: readonly GridItem<T>[] = swapped.items
    let activeNow = swapped.item
    const usedTargets = new Set<string>([swapped.targetId])
    const CASCADE_MAX_ITERS = 6
    for (let iter = 0; iter < CASCADE_MAX_ITERS; iter += 1) {
      const nextBase = workingItems.filter((entry) => entry.id !== itemId && !isGhost(entry))
      const next = trySwapWithCollision({
        active: desired,
        baseItems: nextBase,
        bounds,
        currentItems: workingItems,
        excludeTargets: usedTargets,
      })
      if (!next) break
      if (next.item.x === activeNow.x && next.item.y === activeNow.y) break
      workingItems = next.items
      activeNow = next.item
      usedTargets.add(next.targetId)
    }
    return done('swap', true, activeNow, [...workingItems], true)
  }

  const groupSwapped = tryMultiSiblingSwap({ active: desired, baseItems, bounds, currentItems })
  if (groupSwapped) return done('group-swap', true, groupSwapped.item, groupSwapped.items, true)

  const columnInserted = tryInsertIntoColumn({
    active: desired,
    baseItems,
    bounds,
    currentItems,
    gap,
  })
  if (columnInserted) {
    return done('insert-column', true, columnInserted.item, columnInserted.items, true)
  }

  const inserted = tryInsertIntoRow({ active: desired, baseItems, bounds, currentItems, gap })
  if (inserted) {
    return done('insert-row', true, inserted.item, inserted.items, true)
  }

  const shrunkNeighbor = tryShrinkNeighborsForMove({
    active: desired,
    baseItems,
    bounds,
    currentItems,
    gap,
  })
  if (shrunkNeighbor) {
    return done(
      'shrink-neighbor',
      true,
      shrunkNeighbor.item,
      [...shrunkNeighbor.items, ...ghostItems],
      true,
    )
  }

  const slots = snap ? edgeAlignedSlots(desired, baseItems, bounds, gap) : []
  const snapped = snap
    ? closestValidSlot(desired, slots, baseItems, bounds, gap, snapDistance)
    : null
  if (snapped) return done('snap', true, snapped, replaceItem(currentItems, snapped))

  const fitted = tryFitToOpenSlot({ active: desired, baseItems, bounds, gap })
  if (fitted && canPlaceItem(baseItems, fitted, bounds, gap)) {
    return done('fit-open-slot', true, fitted, replaceItem(currentItems, fitted))
  }

  if (canPlaceItem(baseItems, desired, bounds, gap)) {
    return done('free', true, desired, replaceItem(currentItems, desired))
  }

  const hasSignificantOverlapOnAxis = (axis: GridAxis): boolean => {
    for (const sibling of baseItems) {
      if (isGhost(sibling) || isLocked(sibling)) continue
      if (overlapArea(sibling, desired) <= 0) continue
      const overlap =
        axis === 'x'
          ? Math.min(itemRight(sibling), itemRight(desired)) - Math.max(sibling.x, desired.x)
          : Math.min(itemBottom(sibling), itemBottom(desired)) - Math.max(sibling.y, desired.y)
      if (overlap > snapDistance) return true
    }
    return false
  }
  if (overlapsRowSibling && hasSignificantOverlapOnAxis('x')) {
    const shrunk = pushAndShrinkSiblings(desired, baseItems, bounds, gap, 'x', snapDistance)
    if (shrunk)
      return done('push-shrink-x', true, desired, [...shrunk, ...ghostItems, desired], true)
  }
  if (overlapsColSibling && hasSignificantOverlapOnAxis('y')) {
    const shrunk = pushAndShrinkSiblings(desired, baseItems, bounds, gap, 'y', snapDistance)
    if (shrunk)
      return done('push-shrink-y', true, desired, [...shrunk, ...ghostItems, desired], true)
  }

  const preferred = snapCandidates(desired, baseItems, bounds, gap, snapDistance)[0] ?? desired
  const pushed = pushOverlapsDown(replaceItem(currentItems, preferred), preferred.id, bounds, gap)
  if (pushed) {
    return done('push-down', true, findById(pushed, preferred.id) ?? preferred, pushed, true)
  }

  const desiredOverlapsLocked = baseItems.some(
    (sibling) => isLocked(sibling) && rectsOverlap(sibling, desired),
  )
  if (desiredOverlapsLocked) {
    return done('rejected', false, desired, cloneItems(currentItems))
  }
  const FALLBACK_MAX = Math.max(desired.w, desired.h)
  const fallbackSnap = snap
    ? closestValidSlot(desired, slots, baseItems, bounds, gap, FALLBACK_MAX)
    : null
  if (fallbackSnap)
    return done('fallback-snap', true, fallbackSnap, replaceItem(currentItems, fallbackSnap))

  return done('rejected', false, desired, cloneItems(currentItems))
}
