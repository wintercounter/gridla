/**
 * Chain projection engine (default).
 *
 * Items that overlap on the perpendicular axis form a chain. Within a chain,
 * fixed items keep their pixel size, configured gaps stay fixed, empty space
 * scales, and free items absorb the rest proportionally. A second pass
 * restores exact gaps, anchors fixed items to canvas edges, and snaps shared
 * canonical edges to identical target values.
 */

import { canvasesEqual, roundValue } from '../geometry'
import {
  MIN_ITEM_SIZE,
  isFixedHeight,
  isFixedOnAxis,
  isFixedWidth,
  isLocked,
  type GridAxis,
  type GridCanvas,
  type GridItem,
} from '../model'

/**
 * Pin `w`/`h` and min/max to `fixedWidth`/`fixedHeight` when the size mode
 * fixes that axis. Items without explicit fixed dimensions pass through.
 */
export function syncFixedDimensions<T>(items: readonly GridItem<T>[]): GridItem<T>[] {
  return items.map((item) => {
    const width =
      isFixedWidth(item) &&
      typeof item.fixedWidth === 'number' &&
      Number.isFinite(item.fixedWidth) &&
      item.fixedWidth > 0
        ? item.fixedWidth
        : null
    const height =
      isFixedHeight(item) &&
      typeof item.fixedHeight === 'number' &&
      Number.isFinite(item.fixedHeight) &&
      item.fixedHeight > 0
        ? item.fixedHeight
        : null
    if (width === null && height === null) return item
    return {
      ...item,
      ...(width === null ? {} : { maxW: width, minW: width, w: width }),
      ...(height === null ? {} : { h: height, maxH: height, minH: height }),
    }
  })
}

function buildAxisChains<T>(items: readonly GridItem<T>[], axis: GridAxis): GridItem<T>[][] {
  const perpStart = axis === 'y' ? 'x' : 'y'
  const perpSize = axis === 'y' ? 'w' : 'h'

  const parent = new Map<string, string>()
  for (const item of items) parent.set(item.id, item.id)
  const find = (id: string): string => {
    let cur = id
    while (parent.get(cur) !== cur) cur = parent.get(cur) as string
    let walk = id
    while (parent.get(walk) !== cur) {
      const next = parent.get(walk) as string
      parent.set(walk, cur)
      walk = next
    }
    return cur
  }
  const union = (a: string, b: string) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent.set(ra, rb)
  }

  for (let i = 0; i < items.length; i += 1) {
    const a = items[i]
    const aStart = a[perpStart]
    const aEnd = aStart + a[perpSize]
    for (let j = i + 1; j < items.length; j += 1) {
      const b = items[j]
      const bStart = b[perpStart]
      const bEnd = bStart + b[perpSize]
      if (aStart < bEnd && bStart < aEnd) union(a.id, b.id)
    }
  }

  const byRoot = new Map<string, GridItem<T>[]>()
  for (const item of items) {
    const root = find(item.id)
    let bucket = byRoot.get(root)
    if (!bucket) {
      bucket = []
      byRoot.set(root, bucket)
    }
    bucket.push(item)
  }
  return Array.from(byRoot.values())
}

function projectChainAlongAxis<T>({
  axis,
  chain,
  gap,
  sourceInner,
  sourcePadStart,
  targetInner,
  targetPadStart,
  updates,
}: {
  axis: GridAxis
  chain: readonly GridItem<T>[]
  gap: number
  sourceInner: number
  sourcePadStart: number
  targetInner: number
  targetPadStart: number
  updates: Map<string, GridItem<T>>
}) {
  const isY = axis === 'y'
  const axisStart = isY ? 'y' : 'x'
  const axisSize = isY ? 'h' : 'w'
  const axisMin = isY ? 'minH' : 'minW'
  if (chain.length === 0) return

  const sorted = [...chain].sort((a, b) => a[axisStart] - b[axisStart])

  const slots: number[] = []
  let prevEnd = 0
  for (const item of sorted) {
    const innerStart = item[axisStart] - sourcePadStart
    slots.push(Math.max(0, innerStart - prevEnd))
    prevEnd = innerStart + item[axisSize]
  }
  slots.push(Math.max(0, sourceInner - prevEnd))

  const SLOT_TOL = 2
  const isFixedSlot = (slot: number): boolean => {
    if (Math.abs(slot) <= SLOT_TOL) return true
    if (gap > 0 && Math.abs(slot - gap) <= SLOT_TOL) return true
    return false
  }

  let sumFixed = 0
  let sumFree = 0
  const meta: Array<{ isFixed: boolean; item: GridItem<T> }> = []
  for (const item of sorted) {
    const isFixed = isFixedOnAxis(item, axis)
    meta.push({ isFixed, item })
    if (isFixed) sumFixed += item[axisSize]
    else sumFree += item[axisSize]
  }

  let sumFixedSlots = 0
  let sumFreeSlots = 0
  const slotFixed: boolean[] = []
  for (const slot of slots) {
    const fixed = isFixedSlot(slot)
    slotFixed.push(fixed)
    if (fixed) sumFixedSlots += slot
    else sumFreeSlots += slot
  }

  const flexBudget = Math.max(0, targetInner - sumFixed - sumFixedSlots)
  const flexTotal = sumFree + sumFreeSlots
  const itemAvailable = Math.max(MIN_ITEM_SIZE, targetInner - sumFixed - sumFixedSlots)
  const newItemSizes: number[] = []
  let itemTotal = 0
  for (const { item, isFixed } of meta) {
    const originalSize = item[axisSize]
    let newSize: number
    if (isFixed || flexTotal === 0) {
      newSize = originalSize
    } else {
      const proposed = flexBudget * (originalSize / flexTotal)
      const declaredMin = item[axisMin] ?? MIN_ITEM_SIZE
      const effectiveMin = Math.min(declaredMin, itemAvailable)
      newSize = Math.min(itemAvailable, Math.max(effectiveMin, proposed))
    }
    newItemSizes.push(newSize)
    itemTotal += newSize
  }
  const freeSlotBudget = Math.max(0, targetInner - itemTotal - sumFixedSlots)
  const newSlotSizes: number[] = []
  for (let i = 0; i < slots.length; i += 1) {
    if (slotFixed[i]) newSlotSizes.push(slots[i])
    else if (sumFreeSlots > 0) newSlotSizes.push(freeSlotBudget * (slots[i] / sumFreeSlots))
    else newSlotSizes.push(0)
  }

  let cursor = 0
  for (let i = 0; i < meta.length; i += 1) {
    cursor += newSlotSizes[i]
    const { item } = meta[i]
    const newSize = newItemSizes[i]
    const existing = updates.get(item.id) ?? { ...item }
    updates.set(item.id, {
      ...existing,
      [axisStart]: targetPadStart + cursor,
      [axisSize]: newSize,
    } as GridItem<T>)
    cursor += newSize
  }
}

function projectItemsAlongAxis<T>(
  items: readonly GridItem<T>[],
  source: GridCanvas,
  target: GridCanvas,
  axis: GridAxis,
  gap: number,
): GridItem<T>[] {
  const isY = axis === 'y'
  const sourceSize = isY ? source.height : source.width
  const targetSize = isY ? target.height : target.width
  const sourcePadStart = isY ? source.padding.top : source.padding.left
  const sourcePadEnd = isY ? source.padding.bottom : source.padding.right
  const targetPadStart = isY ? target.padding.top : target.padding.left
  const targetPadEnd = isY ? target.padding.bottom : target.padding.right

  if (
    sourceSize === targetSize &&
    sourcePadStart === targetPadStart &&
    sourcePadEnd === targetPadEnd
  ) {
    return items.map((item) => ({ ...item }))
  }

  const sourceInner = Math.max(1, sourceSize - sourcePadStart - sourcePadEnd)
  const targetInner = Math.max(1, targetSize - targetPadStart - targetPadEnd)

  const updates = new Map<string, GridItem<T>>()
  for (const item of items) updates.set(item.id, { ...item })

  for (const chain of buildAxisChains(items, axis)) {
    projectChainAlongAxis({
      axis,
      chain,
      gap,
      sourceInner,
      sourcePadStart,
      targetInner,
      targetPadStart,
      updates,
    })
  }
  return items.map((item) => updates.get(item.id) ?? item)
}

/**
 * Flex/fill projection of items from `sourceCanvas` to `targetCanvas`.
 * Returns fractional positions; call `preserveGaps` afterwards to snap gaps
 * and round.
 */
export function scaleItems<T>(
  items: readonly GridItem<T>[],
  sourceCanvas: GridCanvas,
  targetCanvas: GridCanvas,
  gap = 0,
): GridItem<T>[] {
  const canonical = syncFixedDimensions(items)
  const innerW = Math.max(
    1,
    targetCanvas.width - targetCanvas.padding.left - targetCanvas.padding.right,
  )
  const innerH = Math.max(
    1,
    targetCanvas.height - targetCanvas.padding.top - targetCanvas.padding.bottom,
  )
  const clampH = targetCanvas.heightMode !== 'scrollable'
  const clamp = (item: GridItem<T>): GridItem<T> => ({
    ...item,
    h: clampH && !isFixedHeight(item) ? Math.min(item.h, innerH) : item.h,
    w: isFixedWidth(item) ? item.w : Math.min(item.w, innerW),
  })
  if (canvasesEqual(sourceCanvas, targetCanvas)) {
    return canonical.map((item) => clamp({ ...item }))
  }
  const afterY = projectItemsAlongAxis(canonical, sourceCanvas, targetCanvas, 'y', gap)
  const afterX = projectItemsAlongAxis(afterY, sourceCanvas, targetCanvas, 'x', gap)
  return afterX.map((item) => clamp(item))
}

/**
 * Ratio-scale a free-floating rect within the padded inner area of one canvas
 * to another. Used for items that do not participate in chains.
 */
export function projectFloatingRect(
  rect: { x: number; y: number; w: number; h: number },
  sourceCanvas: GridCanvas,
  targetCanvas: GridCanvas,
): { x: number; y: number; w: number; h: number } {
  const sourceInnerW = Math.max(
    1,
    sourceCanvas.width - sourceCanvas.padding.left - sourceCanvas.padding.right,
  )
  const sourceInnerH = Math.max(
    1,
    sourceCanvas.height - sourceCanvas.padding.top - sourceCanvas.padding.bottom,
  )
  const targetInnerW = Math.max(
    1,
    targetCanvas.width - targetCanvas.padding.left - targetCanvas.padding.right,
  )
  const targetInnerH = Math.max(
    1,
    targetCanvas.height - targetCanvas.padding.top - targetCanvas.padding.bottom,
  )
  const ratioX = targetInnerW / sourceInnerW
  const ratioY = targetInnerH / sourceInnerH
  const innerX = rect.x - sourceCanvas.padding.left
  const innerY = rect.y - sourceCanvas.padding.top
  return {
    h: rect.h * ratioY,
    w: rect.w * ratioX,
    x: targetCanvas.padding.left + innerX * ratioX,
    y: targetCanvas.padding.top + innerY * ratioY,
  }
}

// ---------------------------------------------------------------------------
// Gap preservation
// ---------------------------------------------------------------------------

function restoreFixedAxisSizes<T>(
  scaledById: Map<string, GridItem<T>>,
  canonical: readonly GridItem<T>[],
) {
  for (const canon of canonical) {
    const target = scaledById.get(canon.id)
    if (!target) continue
    if (isFixedWidth(canon)) target.w = canon.w
    if (isFixedHeight(canon)) target.h = canon.h
  }
}

function alignFreeEdgesToChainEdges<T>(
  scaledById: Map<string, GridItem<T>>,
  canonical: readonly GridItem<T>[],
  xChainMembers: ReadonlySet<string>,
  yChainMembers: ReadonlySet<string>,
) {
  const edgeXMap = new Map<number, number>()
  const edgeRightMap = new Map<number, number>()
  const edgeYMap = new Map<number, number>()
  const edgeBottomMap = new Map<number, number>()
  for (const canon of canonical) {
    const target = scaledById.get(canon.id)
    if (!target) continue
    if (xChainMembers.has(canon.id)) {
      if (!edgeXMap.has(canon.x)) edgeXMap.set(canon.x, target.x)
      const right = canon.x + canon.w
      if (!edgeRightMap.has(right)) edgeRightMap.set(right, target.x + target.w)
    }
    if (yChainMembers.has(canon.id)) {
      if (!edgeYMap.has(canon.y)) edgeYMap.set(canon.y, target.y)
      const bottom = canon.y + canon.h
      if (!edgeBottomMap.has(bottom)) edgeBottomMap.set(bottom, target.y + target.h)
    }
  }
  for (const canon of canonical) {
    const target = scaledById.get(canon.id)
    if (!target) continue
    const leftTarget = edgeXMap.get(canon.x)
    const rightTarget = edgeRightMap.get(canon.x + canon.w)
    if (leftTarget !== undefined && rightTarget !== undefined) {
      target.x = Math.round(leftTarget)
      target.w = Math.max(1, Math.round(rightTarget) - Math.round(leftTarget))
    } else if (leftTarget !== undefined) {
      target.x = Math.round(leftTarget)
    } else if (rightTarget !== undefined) {
      target.x = Math.round(rightTarget) - target.w
    } else {
      target.x = Math.round(target.x)
      target.w = Math.max(1, Math.round(target.w))
    }
    const topTarget = edgeYMap.get(canon.y)
    const bottomTarget = edgeBottomMap.get(canon.y + canon.h)
    if (topTarget !== undefined && bottomTarget !== undefined) {
      target.y = Math.round(topTarget)
      target.h = Math.max(1, Math.round(bottomTarget) - Math.round(topTarget))
    } else if (topTarget !== undefined) {
      target.y = Math.round(topTarget)
    } else if (bottomTarget !== undefined) {
      target.y = Math.round(bottomTarget) - target.h
    } else {
      target.y = Math.round(target.y)
      target.h = Math.max(1, Math.round(target.h))
    }
  }
}

function anchorAgainstFixedSiblings<T>(
  scaledById: Map<string, GridItem<T>>,
  canonical: readonly GridItem<T>[],
  gap: number,
) {
  const TOL = 2
  const allowedGaps = gap > 0 ? [0, gap] : [0]
  const matchedGap = (g: number): number | null => {
    for (const candidate of allowedGaps) if (Math.abs(g - candidate) <= TOL) return candidate
    return null
  }
  const isWallY = (item: GridItem<T>) => isFixedHeight(item) || isLocked(item)
  const isWallX = (item: GridItem<T>) => isFixedWidth(item) || isLocked(item)

  for (const canon of canonical) {
    const target = scaledById.get(canon.id)
    if (!target) continue
    if (!isWallY(canon)) {
      let bestSib: GridItem<T> | null = null
      let bestGap = 0
      for (const sib of canonical) {
        if (sib.id === canon.id || !isWallY(sib)) continue
        const sibBottom = sib.y + sib.h
        const matched = matchedGap(canon.y - sibBottom)
        if (matched === null) continue
        const overlap = Math.min(canon.x + canon.w, sib.x + sib.w) - Math.max(canon.x, sib.x)
        if (overlap <= 0) continue
        if (!bestSib || sibBottom > bestSib.y + bestSib.h) {
          bestSib = sib
          bestGap = matched
        }
      }
      if (bestSib) {
        const anchorTarget = scaledById.get(bestSib.id)
        if (anchorTarget) target.y = anchorTarget.y + anchorTarget.h + bestGap
      }
    }
    if (!isWallX(canon)) {
      let bestSib: GridItem<T> | null = null
      let bestGap = 0
      for (const sib of canonical) {
        if (sib.id === canon.id || !isWallX(sib)) continue
        const sibRight = sib.x + sib.w
        const matched = matchedGap(canon.x - sibRight)
        if (matched === null) continue
        const overlap = Math.min(canon.y + canon.h, sib.y + sib.h) - Math.max(canon.y, sib.y)
        if (overlap <= 0) continue
        if (!bestSib || sibRight > bestSib.x + bestSib.w) {
          bestSib = sib
          bestGap = matched
        }
      }
      if (bestSib) {
        const anchorTarget = scaledById.get(bestSib.id)
        if (anchorTarget) target.x = anchorTarget.x + anchorTarget.w + bestGap
      }
    }
  }
}

function anchorFixedSizeItems<T>(
  scaledById: Map<string, GridItem<T>>,
  canonical: readonly GridItem<T>[],
  canvas: GridCanvas,
  sourceCanvas: GridCanvas,
) {
  const TOL = 2
  const sourceRight = sourceCanvas.width - sourceCanvas.padding.right
  const sourceBottom = sourceCanvas.height - sourceCanvas.padding.bottom
  const sourceLeft = sourceCanvas.padding.left
  const sourceTop = sourceCanvas.padding.top
  const targetRight = canvas.width - canvas.padding.right
  const targetBottom = canvas.height - canvas.padding.bottom
  const targetLeft = canvas.padding.left
  const targetTop = canvas.padding.top
  for (const canon of canonical) {
    const target = scaledById.get(canon.id)
    if (!target) continue
    if (isFixedWidth(canon)) {
      if (Math.abs(canon.x + canon.w - sourceRight) <= TOL) target.x = targetRight - target.w
      else if (Math.abs(canon.x - sourceLeft) <= TOL) target.x = targetLeft
    }
    if (isFixedHeight(canon)) {
      if (Math.abs(canon.y + canon.h - sourceBottom) <= TOL) target.y = targetBottom - target.h
      else if (Math.abs(canon.y - sourceTop) <= TOL) target.y = targetTop
    }
  }
}

function redistributeChains<T>(
  scaledById: Map<string, GridItem<T>>,
  canonical: readonly GridItem<T>[],
  gap: number,
  canvas: GridCanvas,
  sourceCanvas: GridCanvas,
  axis: GridAxis,
  chainMembers: Set<string>,
) {
  const TOL = 2
  const startKey = axis === 'x' ? 'x' : 'y'
  const sizeKey = axis === 'x' ? 'w' : 'h'
  const padStart = axis === 'x' ? canvas.padding.left : canvas.padding.top
  const padEnd = axis === 'x' ? canvas.padding.right : canvas.padding.bottom
  const canvasExtent = axis === 'x' ? canvas.width : canvas.height
  const innerEnd = canvasExtent - padEnd
  const sourcePadStart = axis === 'x' ? sourceCanvas.padding.left : sourceCanvas.padding.top
  const sourcePadEnd = axis === 'x' ? sourceCanvas.padding.right : sourceCanvas.padding.bottom
  const sourceCanvasExtent = axis === 'x' ? sourceCanvas.width : sourceCanvas.height
  const sourceInnerEnd = sourceCanvasExtent - sourcePadEnd
  const crossOverlap = (a: GridItem<T>, b: GridItem<T>): number =>
    axis === 'x'
      ? Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
      : Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const allowedGaps = gap > 0 ? [0, gap] : [0]
  const matchedGap = (canonGap: number): number | null => {
    for (const g of allowedGaps) if (Math.abs(canonGap - g) <= TOL) return g
    return null
  }
  const adjacency = new Map<string, Set<string>>()
  for (const item of canonical) adjacency.set(item.id, new Set())
  for (let i = 0; i < canonical.length; i += 1) {
    for (let j = i + 1; j < canonical.length; j += 1) {
      const a = canonical[i]
      const b = canonical[j]
      const earlier = a[startKey] <= b[startKey] ? a : b
      const later = earlier === a ? b : a
      if (crossOverlap(earlier, later) <= 0) continue
      const canonGap = later[startKey] - (earlier[startKey] + earlier[sizeKey])
      if (matchedGap(canonGap) === null) continue
      adjacency.get(a.id)?.add(b.id)
      adjacency.get(b.id)?.add(a.id)
    }
  }

  const visited = new Set<string>()
  const canonById = new Map(canonical.map((item) => [item.id, item]))
  for (const root of canonical) {
    if (visited.has(root.id)) continue
    const stack: string[] = [root.id]
    const chainIds: string[] = []
    while (stack.length > 0) {
      const id = stack.pop()
      if (id === undefined || visited.has(id)) continue
      visited.add(id)
      chainIds.push(id)
      for (const n of adjacency.get(id) ?? []) if (!visited.has(n)) stack.push(n)
    }
    if (chainIds.length < 2) continue
    const chainCanon = chainIds
      .map((id) => canonById.get(id))
      .filter((item): item is GridItem<T> => Boolean(item))
      .sort((a, b) => a[startKey] - b[startKey])
    if (chainCanon.length < 2) continue

    type Lane = { start: number; size: number; fixed: boolean; members: GridItem<T>[] }
    const byStart = new Map<number, GridItem<T>[]>()
    const laneStartsSet: number[] = []
    for (const canon of chainCanon) {
      const s = canon[startKey]
      let arr = byStart.get(s)
      if (!arr) {
        arr = []
        byStart.set(s, arr)
        laneStartsSet.push(s)
      }
      arr.push(canon)
    }
    const laneStarts = laneStartsSet.slice().sort((a, b) => a - b)
    if (laneStarts.length < 2) continue

    let chainCanonicalEnd = -Infinity
    for (const m of chainCanon) {
      const end = m[startKey] + m[sizeKey]
      if (end > chainCanonicalEnd) chainCanonicalEnd = end
    }

    const laneGapAfter: number[] = []
    let allPairsMatched = true
    for (let i = 0; i < laneStarts.length - 1; i += 1) {
      const nextStart = laneStarts[i + 1]
      let laneEndCanon = -Infinity
      for (const m of chainCanon) {
        if (m[startKey] !== laneStarts[i]) continue
        const end = m[startKey] + m[sizeKey]
        if (end > nextStart + TOL) continue
        if (end > laneEndCanon) laneEndCanon = end
      }
      if (laneEndCanon === -Infinity) {
        laneGapAfter.push(0)
        continue
      }
      const pairGap = nextStart - laneEndCanon
      let snapped: number | null = null
      let bestDist = Infinity
      for (const g of allowedGaps) {
        const d = Math.abs(pairGap - g)
        if (d <= TOL && d < bestDist) {
          bestDist = d
          snapped = g
        }
      }
      if (snapped === null) {
        allPairsMatched = false
        break
      }
      laneGapAfter.push(snapped)
    }
    if (!allPairsMatched) continue

    const laneSizes = laneStarts.map((s, i) =>
      i + 1 < laneStarts.length ? laneStarts[i + 1] - s - laneGapAfter[i] : chainCanonicalEnd - s,
    )
    if (laneSizes.some((sz) => sz <= 0)) continue

    const spansAttempt = new Map<string, number>()
    let allFit = true
    for (const m of chainCanon) {
      const startIdx = laneStarts.indexOf(m[startKey])
      if (startIdx < 0) {
        allFit = false
        break
      }
      const canonEnd = m[startKey] + m[sizeKey]
      let matched = false
      let count = 0
      for (let k = startIdx; k < laneStarts.length; k += 1) {
        count += 1
        const laneEnd =
          k + 1 < laneStarts.length ? laneStarts[k + 1] - laneGapAfter[k] : chainCanonicalEnd
        if (Math.abs(canonEnd - laneEnd) <= TOL) {
          matched = true
          break
        }
        if (canonEnd < laneEnd - TOL) break
      }
      if (!matched) {
        allFit = false
        break
      }
      spansAttempt.set(m.id, count)
    }
    if (!allFit) continue

    const lanes: Lane[] = laneStarts.map((start, i) => {
      const members = byStart.get(start) ?? []
      const nonSpanning = members.filter((m) => (spansAttempt.get(m.id) ?? 1) === 1)
      const fixed = nonSpanning.length > 0 && nonSpanning.every((m) => isFixedOnAxis(m, axis))
      return { fixed, members, size: laneSizes[i], start }
    })

    const firstScaled = scaledById.get(lanes[0].members[0].id)
    const lastScaled = scaledById.get(lanes[lanes.length - 1].members[0].id)
    if (!firstScaled || !lastScaled) continue
    const firstTouchesStart = Math.abs(lanes[0].start - sourcePadStart) <= TOL
    const lastTouchesEnd = Math.abs(chainCanonicalEnd - sourceInnerEnd) <= TOL

    for (const lane of lanes) for (const member of lane.members) chainMembers.add(member.id)

    if (firstTouchesStart && lastTouchesEnd) {
      const chainSpanTarget = innerEnd - padStart
      let gapsTotal = 0
      for (const g of laneGapAfter) gapsTotal += g
      let fixedTotal = 0
      let flexibleCanonical = 0
      for (const lane of lanes) {
        if (lane.fixed) fixedTotal += lane.size
        else flexibleCanonical += lane.size
      }
      const flexibleSpanTarget = chainSpanTarget - gapsTotal - fixedTotal
      if (flexibleSpanTarget > 0 && flexibleCanonical > 0) {
        const newLaneSizes = lanes.map((lane) =>
          lane.fixed ? lane.size : (lane.size / flexibleCanonical) * flexibleSpanTarget,
        )
        let cursor = padStart
        for (let li = 0; li < lanes.length; li += 1) {
          const lane = lanes[li]
          const newLaneSize = newLaneSizes[li]
          for (const member of lane.members) {
            const target = scaledById.get(member.id)
            if (!target) continue
            const span = spansAttempt.get(member.id) ?? 1
            let memberSize: number
            if (span > 1) {
              memberSize = 0
              for (let k = 0; k < span && li + k < lanes.length; k += 1) {
                memberSize += newLaneSizes[li + k]
                if (k > 0) memberSize += laneGapAfter[li + k - 1]
              }
            } else if (lane.fixed) {
              memberSize = member[sizeKey]
            } else {
              memberSize = (member[sizeKey] / lane.size) * newLaneSize
            }
            if (axis === 'x') {
              target.x = cursor
              target.w = Math.max(1, memberSize)
            } else {
              target.y = cursor
              target.h = Math.max(1, memberSize)
            }
          }
          cursor += newLaneSize
          if (li < laneGapAfter.length) cursor += laneGapAfter[li]
        }
        continue
      }
    }

    if (!firstTouchesStart && lastTouchesEnd) {
      const lastLane = lanes[lanes.length - 1]
      const lastMemberScaled = scaledById.get(lastLane.members[0].id)
      let cursor = lastMemberScaled?.[startKey] ?? innerEnd - lastLane.size
      for (let li = lanes.length - 2; li >= 0; li -= 1) {
        const lane = lanes[li]
        const memberScaled = scaledById.get(lane.members[0].id)
        const scaledSize = memberScaled ? memberScaled[sizeKey] : lane.size
        cursor = cursor - laneGapAfter[li] - scaledSize
        for (const member of lane.members) {
          const target = scaledById.get(member.id)
          if (!target) continue
          if (axis === 'x') target.x = cursor
          else target.y = cursor
        }
      }
      continue
    }

    const headTarget = firstTouchesStart ? padStart : firstScaled[startKey]
    let cursor = headTarget
    for (let li = 0; li < lanes.length; li += 1) {
      const lane = lanes[li]
      for (const member of lane.members) {
        const target = scaledById.get(member.id)
        if (!target) continue
        if (axis === 'x') target.x = cursor
        else target.y = cursor
      }
      const firstMemberScaled = scaledById.get(lane.members[0].id)
      const laneScaledSize = firstMemberScaled ? firstMemberScaled[sizeKey] : lane.size
      cursor += laneScaledSize
      if (li < laneGapAfter.length) cursor += laneGapAfter[li]
    }
  }
}

/**
 * Restore configured gaps and canvas-edge anchors after `scaleItems`, then
 * round to whole pixels. Mutates `scaled` in place.
 */
export function preserveGaps<T>(
  scaled: GridItem<T>[],
  canonical: readonly GridItem<T>[],
  gap: number,
  canvas: GridCanvas,
  sourceCanvas: GridCanvas,
): void {
  if (scaled.length === 0) return
  const canonicalItems = syncFixedDimensions(canonical)
  const scaledById = new Map(scaled.map((item) => [item.id, item]))

  anchorFixedSizeItems(scaledById, canonicalItems, canvas, sourceCanvas)
  anchorAgainstFixedSiblings(scaledById, canonicalItems, gap)

  if (scaled.length < 2) return
  const xChainMembers = new Set<string>()
  const yChainMembers = new Set<string>()
  redistributeChains(scaledById, canonicalItems, gap, canvas, sourceCanvas, 'x', xChainMembers)
  redistributeChains(scaledById, canonicalItems, gap, canvas, sourceCanvas, 'y', yChainMembers)
  alignFreeEdgesToChainEdges(scaledById, canonicalItems, xChainMembers, yChainMembers)
  restoreFixedAxisSizes(scaledById, canonicalItems)
  anchorFixedSizeItems(scaledById, canonicalItems, canvas, sourceCanvas)
}

/** Full chain projection: scale, then preserve gaps. */
export function projectItemsByChain<T>(
  items: readonly GridItem<T>[],
  sourceCanvas: GridCanvas,
  targetCanvas: GridCanvas,
  gap = 0,
): GridItem<T>[] {
  const projected = scaleItems(items, sourceCanvas, targetCanvas, gap)
  preserveGaps(projected, items, gap, targetCanvas, sourceCanvas)
  return projected
}

/** Round every item's rect to whole pixels. */
export function roundItemRects<T>(items: readonly GridItem<T>[]): GridItem<T>[] {
  return items.map((item) => ({
    ...item,
    x: roundValue(item.x),
    y: roundValue(item.y),
    w: roundValue(item.w),
    h: roundValue(item.h),
  }))
}
