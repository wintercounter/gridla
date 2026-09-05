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

import { canvasArb, deepFreeze, gappedLayoutArb, idsOf, rectOf, snapshot } from './arbitraries'

/**
 * Property-based invariants for `projectLayout` under both strategies:
 * bounds, fixed-axis preservation, id conservation, identity on the source
 * canvas, A→B→A round trips for free items, and determinism.
 */

const TOL = 1

const strategyArb: fc.Arbitrary<ProjectionStrategy> = fc.constantFrom('chain', 'segments')

/**
 * Round-trip tolerance for free items when B is larger than A. Each
 * projection rounds every edge to whole pixels, so two projections can drift
 * an edge by a pixel each; the pixel budget below is what the generator
 * observed as the ceiling across the canvas/gap ranges used here.
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
) {
  return strategy === 'chain'
    ? projectLayout(layout, target, { strategy, gap })
    : projectLayout(layout, target, { strategy })
}

describe('projection invariants', () => {
  it('projected items stay inside the target inner bounds', () => {
    fc.assert(
      fc.property(gappedLayoutArb, canvasArb, strategyArb, ({ gap, layout }, target, strategy) => {
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
      fc.property(gappedLayoutArb, canvasArb, strategyArb, ({ gap, layout }, target, strategy) => {
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
      fc.property(gappedLayoutArb, canvasArb, strategyArb, ({ gap, layout }, target, strategy) => {
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
      fc.property(gappedLayoutArb, ({ gap, layout }) => {
        const normalized = normalizeLayout(layout)
        const same = projectLayout(normalized, normalized.canvas, { strategy: 'chain', gap })
        expect(same.canvas).toEqual(normalized.canvas)
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
