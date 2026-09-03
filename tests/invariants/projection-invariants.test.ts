import { describe, expect, it } from 'bun:test'
import fc from 'fast-check'

import {
  isFixedHeight,
  isFixedWidth,
  normalizeLayout,
  projectLayout,
  type GridCanvas,
  type GridLayout,
  type ProjectionStrategy,
} from 'gridla'

import {
  deepFreeze,
  gappedLayoutArb,
  idsOf,
  projectionCaseArb,
  rectOf,
  snapshot,
  strategyArb,
} from './arbitraries'

/**
 * Property-based invariants for `projectLayout` under both strategies:
 * bounds, fixed-axis preservation, id conservation, identity on the source
 * canvas, A→B→A round trips for free items, and determinism.
 *
 * Targets come from `projectionCaseArb`, which grows a random target just
 * enough that fixed-size content and authored minimums can fit; anything
 * smaller is an impossible request, not a projection defect.
 */

const TOL = 1

/**
 * Round-trip budget for free items when B is larger than A. Every projection
 * rounds each edge to a whole pixel, so a there-and-back trip may legitimately
 * move an edge by one pixel per pass. Sampling 12k random cases with the
 * segments strategy stayed within 1px in 99.97% of them; the remainder and
 * the chain strategy fail by a wide margin (see the pinned examples below),
 * so the budget is set from the rounding argument rather than the data.
 */
const ROUND_TRIP_TOL = 2

function assertInside(layout: GridLayout): void {
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

function project(
  layout: GridLayout,
  target: GridCanvas,
  strategy: ProjectionStrategy,
  gap: number,
): GridLayout {
  return strategy === 'chain'
    ? projectLayout(layout, target, { strategy, gap })
    : projectLayout(layout, target, { strategy })
}

const canvas = (width: number, height: number, padding = 0): GridCanvas => ({
  width,
  height,
  padding: { top: padding, right: padding, bottom: padding, left: padding },
  heightMode: 'bounded',
})

describe('projection invariants', () => {
  it('projected items stay inside the target inner bounds', () => {
    fc.assert(
      fc.property(projectionCaseArb, ({ gap, layout, target, strategy }) => {
        const frozen = deepFreeze(structuredClone(layout))
        const projected = project(frozen, target, strategy, gap)
        expect(projected.canvas.width).toBe(target.width)
        expect(projected.canvas.height).toBe(target.height)
        assertInside(projected)
      }),
      { numRuns: 500 },
    )
  })

  it('conserves ids and keeps fixed axes at their pixel size', () => {
    fc.assert(
      fc.property(projectionCaseArb, ({ gap, layout, target, strategy }) => {
        const frozen = deepFreeze(structuredClone(layout))
        const projected = project(frozen, target, strategy, gap)
        expect(idsOf(projected.items)).toEqual(idsOf(frozen.items))
        const previous = new Map(frozen.items.map((item) => [item.id, item]))
        for (const item of projected.items) {
          const source = previous.get(item.id)!
          if (isFixedWidth(source)) expect(item.w).toBe(source.w)
          if (isFixedHeight(source)) expect(item.h).toBe(source.h)
        }
      }),
      { numRuns: 500 },
    )
  })

  it('does not mutate its input and is deterministic', () => {
    fc.assert(
      fc.property(projectionCaseArb, ({ gap, layout, target, strategy }) => {
        const frozen = deepFreeze(structuredClone(layout))
        const frozenTarget = deepFreeze(structuredClone(target))
        const before = snapshot(frozen)
        const first = project(frozen, frozenTarget, strategy, gap)
        const second = project(frozen, frozenTarget, strategy, gap)
        expect(snapshot(frozen)).toBe(before)
        expect(snapshot(second)).toBe(snapshot(first))
      }),
      { numRuns: 500 },
    )
  })

  it('chain projection onto the same canvas is the identity for normalized layouts', () => {
    fc.assert(
      fc.property(gappedLayoutArb, ({ layout }) => {
        const normalized = normalizeLayout(layout)
        const same = projectLayout(normalized, normalized.canvas, { strategy: 'chain' })
        expect(same.canvas).toEqual(normalized.canvas)
        expect(same.items.map(rectOf)).toEqual(normalized.items.map(rectOf))
      }),
      { numRuns: 500 },
    )
  })

  it('chain projection onto the same canvas with the authored gap is the identity', () => {
    fc.assert(
      fc.property(gappedLayoutArb, ({ gap, layout }) => {
        const normalized = normalizeLayout(layout)
        const same = projectLayout(normalized, normalized.canvas, { strategy: 'chain', gap })
        expect(same.items.map(rectOf)).toEqual(normalized.items.map(rectOf))
      }),
      { numRuns: 500 },
    )
  })

  it('A→B→A round-trips free items within tolerance when B is larger than A', () => {
    fc.assert(
      fc.property(
        gappedLayoutArb,
        fc.integer({ min: 0, max: 1200 }),
        fc.integer({ min: 0, max: 800 }),
        strategyArb,
        ({ gap, layout }, extraW, extraH, strategy) => {
          const a = normalizeLayout(layout)
          const b: GridCanvas = {
            ...a.canvas,
            width: a.canvas.width + extraW,
            height: a.canvas.height + extraH,
          }
          const there = project(a, b, strategy, gap)
          const back = project(there, a.canvas, strategy, gap)
          const source = new Map(a.items.map((item) => [item.id, item]))
          for (const item of back.items) {
            const original = source.get(item.id)!
            if (isFixedWidth(original) || isFixedHeight(original)) continue
            expect(Math.abs(item.x - original.x)).toBeLessThanOrEqual(ROUND_TRIP_TOL)
            expect(Math.abs(item.y - original.y)).toBeLessThanOrEqual(ROUND_TRIP_TOL)
            expect(Math.abs(item.w - original.w)).toBeLessThanOrEqual(ROUND_TRIP_TOL)
            expect(Math.abs(item.h - original.h)).toBeLessThanOrEqual(ROUND_TRIP_TOL)
          }
        },
      ),
      { numRuns: 200 },
    )
  })
})

/**
 * Minimized counterexamples found by the properties above. Each pins one
 * engine behaviour that violates an invariant so the failure is reproducible
 * without a fast-check seed.
 */
describe('projection invariants: minimized counterexamples', () => {
  it('chain: growing the canvas by one pixel keeps a two-row layout roughly proportional', () => {
    // 200×200 → 200×201. Rows are 100px and 97px tall (3px bottom margin).
    // Observed: heights become 67 and 65, then 50 and 49 on the way back.
    const layout: GridLayout = {
      canvas: canvas(200, 200),
      items: [
        { id: 'stat-1', x: 0, y: 0, w: 100, h: 100, minW: 20, minH: 20 },
        { id: 'stat-2', x: 100, y: 0, w: 100, h: 100, minW: 20, minH: 20 },
        { id: 'feed-a', x: 0, y: 100, w: 200, h: 97, minW: 20, minH: 20 },
      ],
    }
    const there = projectLayout(layout, canvas(200, 201), { strategy: 'chain' })
    for (const item of there.items) {
      const source = layout.items.find((entry) => entry.id === item.id)!
      expect(Math.abs(item.h - source.h)).toBeLessThanOrEqual(ROUND_TRIP_TOL)
    }
  })

  it('chain: a row mate with a larger minH stays in its row and inside the canvas', () => {
    // Free-only layout projected to a canvas with 16px top padding (inner 184).
    // Observed: the minH:65 item is pushed to y=137 (its row mate sits at
    // y=75) and ends at 202 > 200.
    const layout: GridLayout = {
      canvas: canvas(200, 200),
      items: [
        { id: 'header', x: 0, y: 0, w: 200, h: 97, minW: 20, minH: 20 },
        { id: 'feed-a', x: 0, y: 100, w: 100, h: 100, minW: 20, minH: 20 },
        { id: 'feed-b', x: 100, y: 100, w: 100, h: 100, minW: 20, minH: 65 },
      ],
    }
    const target: GridCanvas = {
      ...canvas(200, 200),
      padding: { top: 16, right: 0, bottom: 0, left: 0 },
    }
    const projected = projectLayout(layout, target, { strategy: 'chain' })
    assertInside(projected)
    const a = projected.items.find((item) => item.id === 'feed-a')!
    const b = projected.items.find((item) => item.id === 'feed-b')!
    expect(Math.abs(a.y - b.y)).toBeLessThanOrEqual(TOL)
  })

  it('segments: a free item beside a full-width fixed item keeps a usable width', () => {
    // 200×300 → inner 200×182 (scrollable). Observed: the two free items in
    // the second row collapse to 1px wide and land at x=213/214, outside the
    // 213px inner right edge.
    const layout: GridLayout = {
      canvas: canvas(200, 300),
      items: [
        { id: 'chart', x: 0, y: 0, w: 200, h: 182, minW: 20, minH: 20, sizeMode: 'fixed' },
        { id: 'feed-a', x: 0, y: 200, w: 82, h: 100, minW: 20, minH: 20 },
        { id: 'feed-b', x: 100, y: 200, w: 100, h: 100, minW: 20, minH: 20 },
      ],
    }
    const target: GridCanvas = {
      width: 232,
      height: 200,
      padding: { top: 14, right: 19, bottom: 4, left: 13 },
      heightMode: 'scrollable',
    }
    const projected = projectLayout(layout, target, { strategy: 'segments' })
    assertInside(projected)
    for (const id of ['feed-a', 'feed-b']) {
      expect(projected.items.find((item) => item.id === id)!.w).toBeGreaterThanOrEqual(20)
    }
  })

  it('segments: growing only the height keeps x and width of stacked full-width rows', () => {
    // Three full-width rows, 200×200 → 200×320. Observed: two rows become
    // 100px wide and one of them moves to x=100.
    const layout: GridLayout = {
      canvas: canvas(200, 200),
      items: [
        { id: 'header', x: 0, y: 0, w: 200, h: 42, minW: 20, minH: 20 },
        { id: 'chart', x: 0, y: 54, w: 200, h: 36, minW: 20, minH: 20 },
        { id: 'feed-a', x: 0, y: 90, w: 200, h: 91, minW: 20, minH: 20 },
      ],
    }
    const projected = projectLayout(layout, canvas(200, 320), { strategy: 'segments' })
    for (const item of projected.items) {
      const source = layout.items.find((entry) => entry.id === item.id)!
      expect(item.x).toBe(source.x)
      expect(item.w).toBe(source.w)
    }
  })

  it('chain: identity projection with a gap does not stretch an item to the edge', () => {
    // Same canvas, gap 12. Observed: the 99px item one pixel short of the
    // right edge becomes 100px wide.
    const layout = normalizeLayout({
      canvas: canvas(200, 200),
      items: [
        { id: 'stat-1', x: 0, y: 0, w: 88, h: 88, minW: 20, minH: 20 },
        { id: 'stat-2', x: 100, y: 0, w: 99, h: 88, minW: 20, minH: 20 },
        { id: 'feed-a', x: 0, y: 100, w: 200, h: 100, minW: 20, minH: 20 },
      ],
    })
    const same = projectLayout(layout, layout.canvas, { strategy: 'chain', gap: 12 })
    expect(same.items.map(rectOf)).toEqual(layout.items.map(rectOf))
  })

  it('chain: identity projection keeps a fixed-width item 2px short of the right edge in place', () => {
    // Same canvas, no gap. Observed: the fixed-w item at x=0 (w=198) is
    // re-anchored to x=2 so it becomes flush with the right edge.
    const layout = normalizeLayout({
      canvas: canvas(200, 200),
      items: [
        { id: 'header', x: 0, y: 0, w: 198, h: 94, minW: 20, minH: 20, sizeMode: 'fixed-w' },
        { id: 'feed-a', x: 0, y: 100, w: 200, h: 100, minW: 20, minH: 20 },
      ],
    })
    const same = projectLayout(layout, layout.canvas, { strategy: 'chain' })
    expect(same.items.map(rectOf)).toEqual(layout.items.map(rectOf))
  })
})
