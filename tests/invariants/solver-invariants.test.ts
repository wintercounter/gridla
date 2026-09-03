import { describe, expect, it } from 'bun:test'
import fc from 'fast-check'

import {
  findLayoutViolations,
  isFixedHeight,
  isFixedWidth,
  isGhost,
  isLocked,
  moveItem,
  placeItem,
  rectsOverlap,
  resizeItem,
  type GridItem,
  type GridLayout,
  type SolveOptions,
  type SolveResult,
} from 'gridla'

import {
  deepFreeze,
  gapArb,
  gappedLayoutArb,
  idsOf,
  innerHeight,
  innerWidth,
  moveOpArb,
  opSequenceArb,
  pickItem,
  placeOpArb,
  rectOf,
  removeOpArb,
  resizeOpArb,
  resolvePoint,
  snapshot,
  type Gap,
  type Op,
} from './arbitraries'

/**
 * Property-based invariants for the flat solvers. Every accepted result must
 * leave the layout valid regardless of the requested move, resize, or drop:
 *
 *   (a) every item is inside the canvas inner bounds (±1px; scrollable
 *       canvases only bound x/w and the top edge)
 *   (b) no two solid items overlap (locked-vs-locked pairs excepted)
 *   (c) item ids are conserved (place adds one, remove removes one)
 *   (d) w/h >= 1 and authored minimums hold unless the canvas is smaller
 *   (e) fixed-size axes keep their pixel size
 *   (f) locked items that were not the active target keep their rect
 *   (g) inputs are not mutated
 *   (h) the same request on the same input yields the same output
 *
 * Rejected results must hand the input items back unchanged.
 */

type Applied = {
  result: SolveResult
  /** Id of the item the operation targeted (or the item that was placed). */
  activeId: string
}

const TOL = 1

function apply(layout: GridLayout, op: Op, step: number, options: SolveOptions): Applied | null {
  switch (op.kind) {
    case 'move': {
      const target = pickItem(layout.items, op.index)
      const position = resolvePoint(layout.canvas, op.px, op.py)
      return { result: moveItem({ layout, itemId: target.id, position, options }), activeId: target.id }
    }
    case 'resize': {
      const target = pickItem(layout.items, op.index)
      return {
        result: resizeItem({
          layout,
          itemId: target.id,
          edge: op.edge,
          delta: { x: op.dx, y: op.dy },
          options,
        }),
        activeId: target.id,
      }
    }
    case 'place': {
      const id = `placed-${step}`
      const item = {
        id,
        w: op.w,
        h: op.h,
        minW: Math.min(op.minW, op.w),
        minH: Math.min(op.minH, op.h),
        ...(op.sizeMode !== undefined ? { sizeMode: op.sizeMode } : {}),
      }
      const point = resolvePoint(layout.canvas, op.px, op.py)
      const result =
        op.via === 'position'
          ? placeItem({ layout, item, position: point, options })
          : placeItem({ layout, item, pointer: point, options })
      return { result, activeId: id }
    }
    case 'remove':
      return null
  }
}

function assertInsideCanvas(layout: GridLayout): void {
  const { canvas } = layout
  const right = canvas.width - canvas.padding.right
  const bottom = canvas.height - canvas.padding.bottom
  for (const item of layout.items) {
    expect(item.x).toBeGreaterThanOrEqual(canvas.padding.left - TOL)
    expect(item.x + item.w).toBeLessThanOrEqual(right + TOL)
    expect(item.y).toBeGreaterThanOrEqual(canvas.padding.top - TOL)
    if (canvas.heightMode === 'bounded') {
      expect(item.y + item.h).toBeLessThanOrEqual(bottom + TOL)
    }
  }
}

function assertNoOverlap(items: readonly GridItem[]): void {
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      const a = items[i]!
      const b = items[j]!
      if (isGhost(a) || isGhost(b)) continue
      if (isLocked(a) && isLocked(b)) continue
      expect(rectsOverlap(a, b)).toBe(false)
    }
  }
}

function assertSizes(before: GridLayout, after: GridLayout, activeId: string): void {
  const maxW = innerWidth(after.canvas)
  const maxH = innerHeight(after.canvas)
  const previous = new Map(before.items.map((item) => [item.id, item]))
  for (const item of after.items) {
    // (d) hard minimum plus authored minimum (unless the canvas is smaller)
    expect(item.w).toBeGreaterThanOrEqual(1)
    expect(item.h).toBeGreaterThanOrEqual(1)
    const authored = previous.get(item.id) ?? item
    const minW = Math.min(authored.minW ?? 1, maxW)
    const minH = Math.min(authored.minH ?? 1, maxH)
    expect(item.w).toBeGreaterThanOrEqual(minW)
    if (after.canvas.heightMode === 'bounded') expect(item.h).toBeGreaterThanOrEqual(minH)
    else expect(item.h).toBeGreaterThanOrEqual(authored.minH ?? 1)

    const prior = previous.get(item.id)
    if (!prior) continue
    // (e) fixed axes keep their pixel size
    if (isFixedWidth(prior)) expect(item.w).toBe(prior.w)
    if (isFixedHeight(prior)) expect(item.h).toBe(prior.h)
    // (f) locked bystanders never move or resize
    if (isLocked(prior) && item.id !== activeId) expect(rectOf(item)).toEqual(rectOf(prior))
  }
}

function assertAccepted(before: GridLayout, applied: Applied): void {
  const after = applied.result.layout
  assertInsideCanvas(after)
  assertNoOverlap(after.items)
  expect(findLayoutViolations(after)).toEqual([])
  assertSizes(before, after, applied.activeId)
  // the reported item is the one in the layout
  const reported = after.items.find((item) => item.id === applied.result.item.id)
  expect(reported).toBeDefined()
  expect(rectOf(reported!)).toEqual(rectOf(applied.result.item))
}

/**
 * Run one operation against a frozen copy of `layout`, checking mutation,
 * determinism, rejection semantics, and (when accepted) the layout invariants.
 * Returns the layout to continue from.
 */
function step(layout: GridLayout, op: Op, index: number, gap: Gap, snap: boolean): GridLayout {
  const frozen = deepFreeze(structuredClone(layout))
  const before = snapshot(frozen)
  const options: SolveOptions = { gap, snap }

  if (op.kind === 'remove') {
    if (frozen.items.length < 2) return frozen
    const target = pickItem(frozen.items, op.index)
    const next: GridLayout = {
      canvas: frozen.canvas,
      items: frozen.items.filter((item) => item.id !== target.id),
    }
    expect(next.items).toHaveLength(frozen.items.length - 1)
    expect(idsOf(next.items)).toEqual(idsOf(frozen.items).filter((id) => id !== target.id))
    return next
  }

  const first = apply(frozen, op, index, options)!
  const second = apply(frozen, op, index, options)!
  // (g) inputs untouched, (h) deterministic
  expect(snapshot(frozen)).toBe(before)
  expect(snapshot(second.result)).toBe(snapshot(first.result))

  const { result } = first
  if (!result.accepted) {
    expect(result.layout.items).toEqual(frozen.items)
    return frozen
  }

  // (c) ids conserved
  const expectedIds =
    op.kind === 'place' ? [...idsOf(frozen.items), first.activeId].sort() : idsOf(frozen.items)
  expect(idsOf(result.layout.items)).toEqual(expectedIds)
  expect(result.layout.canvas).toEqual(frozen.canvas)

  assertAccepted(frozen, first)
  return result.layout
}

const snapArb = fc.boolean()

describe('solver invariants', () => {
  it('moveItem keeps the layout valid', () => {
    fc.assert(
      fc.property(gappedLayoutArb, moveOpArb, snapArb, ({ gap, layout }, op, snap) => {
        step(layout, op, 0, gap, snap)
      }),
      { numRuns: 500 },
    )
  })

  it('resizeItem keeps the layout valid', () => {
    fc.assert(
      fc.property(gappedLayoutArb, resizeOpArb, snapArb, ({ gap, layout }, op, snap) => {
        step(layout, op, 0, gap, snap)
      }),
      { numRuns: 500 },
    )
  })

  it('placeItem keeps the layout valid', () => {
    fc.assert(
      fc.property(gappedLayoutArb, placeOpArb, snapArb, ({ gap, layout }, op, snap) => {
        step(layout, op, 0, gap, snap)
      }),
      { numRuns: 500 },
    )
  })

  it('removing an item drops exactly that id', () => {
    fc.assert(
      fc.property(gappedLayoutArb, removeOpArb, ({ gap, layout }, op) => {
        step(layout, op, 0, gap, true)
      }),
      { numRuns: 200 },
    )
  })

  it('random operation sequences keep every accepted intermediate layout valid', () => {
    fc.assert(
      fc.property(
        gappedLayoutArb,
        opSequenceArb,
        gapArb,
        snapArb,
        ({ layout }, ops, gap, snap) => {
          let current = layout
          ops.forEach((op, index) => {
            current = step(current, op, index, gap, snap)
          })
        },
      ),
      { numRuns: 200 },
    )
  })
})
