import { describe, expect, it } from 'bun:test'

import {
  preserveGaps,
  projectFloatingRect,
  projectLayout,
  scaleItems,
  type GridCanvas,
  type GridItem,
  type GridLayout,
} from 'gridla'

const canvas = (width: number, height: number, extra: Partial<GridCanvas> = {}): GridCanvas => ({
  width,
  height,
  padding: { top: 0, right: 0, bottom: 0, left: 0 },
  heightMode: 'bounded',
  ...extra,
})

const item = (
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  extra: Partial<GridItem> = {},
): GridItem => ({ id, x, y, w, h, minW: 1, minH: 1, ...extra })

const byId = (items: readonly GridItem[], id: string) => {
  const found = items.find((entry) => entry.id === id)
  if (!found) throw new Error(`Missing item: ${id}`)
  return found
}

const rect = ({ x, y, w, h }: GridItem) => ({ x, y, w, h })

describe('chain projection (default strategy)', () => {
  it('returns identical rects when the target canvas matches the source', () => {
    const layout: GridLayout = {
      canvas: canvas(1200, 720),
      items: [item('feed-a', 0, 0, 600, 720), item('feed-b', 600, 0, 600, 720)],
    }

    const projected = projectLayout(layout, canvas(1200, 720))

    expect(projected.canvas).toEqual(canvas(1200, 720))
    expect(projected.items.map(rect)).toEqual([
      { x: 0, y: 0, w: 600, h: 720 },
      { x: 600, y: 0, w: 600, h: 720 },
    ])
  })

  it('scales a free row proportionally when the width halves', () => {
    const layout: GridLayout = {
      canvas: canvas(1200, 300),
      items: [item('feed-a', 0, 0, 400, 300), item('feed-b', 400, 0, 800, 300)],
    }

    const projected = projectLayout(layout, canvas(600, 300))

    // 400:800 keeps its 1:2 ratio inside 600 px; heights are untouched
    // because the vertical extent did not change.
    expect(rect(byId(projected.items, 'feed-a'))).toEqual({ x: 0, y: 0, w: 200, h: 300 })
    expect(rect(byId(projected.items, 'feed-b'))).toEqual({ x: 200, y: 0, w: 400, h: 300 })
  })

  it('keeps a fixed-width item at its pixel width while its neighbor flexes', () => {
    const layout: GridLayout = {
      canvas: canvas(1200, 100),
      items: [
        item('feed-a', 0, 0, 900, 100),
        item('sidebar', 900, 0, 300, 100, { sizeMode: 'fixed-w', fixedWidth: 300 }),
      ],
    }

    const wider = projectLayout(layout, canvas(1500, 100))
    expect(rect(byId(wider.items, 'feed-a'))).toEqual({ x: 0, y: 0, w: 1200, h: 100 })
    expect(rect(byId(wider.items, 'sidebar'))).toEqual({ x: 1200, y: 0, w: 300, h: 100 })

    const narrower = projectLayout(layout, canvas(1000, 100))
    expect(rect(byId(narrower.items, 'feed-a'))).toEqual({ x: 0, y: 0, w: 700, h: 100 })
    expect(rect(byId(narrower.items, 'sidebar'))).toEqual({ x: 700, y: 0, w: 300, h: 100 })
  })

  it('keeps a fixed-height header in place while the rows below share the extra height', () => {
    const layout: GridLayout = {
      canvas: canvas(1200, 720),
      items: [
        item('header', 0, 0, 1200, 60, { sizeMode: 'fixed-h', fixedHeight: 60 }),
        item('chart', 0, 60, 1200, 330),
        item('feed-a', 0, 390, 1200, 330),
      ],
    }

    const projected = projectLayout(layout, canvas(1200, 1020))

    // 1020 - 60 (header) = 960 px of flexible height, split 1:1.
    expect(rect(byId(projected.items, 'header'))).toEqual({ x: 0, y: 0, w: 1200, h: 60 })
    expect(rect(byId(projected.items, 'chart'))).toEqual({ x: 0, y: 60, w: 1200, h: 480 })
    expect(rect(byId(projected.items, 'feed-a'))).toEqual({ x: 0, y: 540, w: 1200, h: 480 })
  })

  it('keeps the configured gap at exactly `gap` px when scaling up and down', () => {
    const layout: GridLayout = {
      canvas: canvas(1200, 300),
      items: [item('feed-a', 0, 0, 594, 300), item('feed-b', 606, 0, 594, 300)],
    }

    // Up: 1800 - 12 = 1788 flexible px, split 1:1.
    const wider = projectLayout(layout, canvas(1800, 300), { gap: 12 })
    const wideA = byId(wider.items, 'feed-a')
    const wideB = byId(wider.items, 'feed-b')
    expect(rect(wideA)).toEqual({ x: 0, y: 0, w: 894, h: 300 })
    expect(rect(wideB)).toEqual({ x: 906, y: 0, w: 894, h: 300 })
    expect(wideB.x - (wideA.x + wideA.w)).toBe(12)

    // Down: 600 - 12 = 588 flexible px, split 1:1.
    const narrower = projectLayout(layout, canvas(600, 300), { gap: 12 })
    const narrowA = byId(narrower.items, 'feed-a')
    const narrowB = byId(narrower.items, 'feed-b')
    expect(rect(narrowA)).toEqual({ x: 0, y: 0, w: 294, h: 300 })
    expect(rect(narrowB)).toEqual({ x: 306, y: 0, w: 294, h: 300 })
    expect(narrowB.x - (narrowA.x + narrowA.w)).toBe(12)
  })

  it('keeps a gap below a fixed-height header when the canvas shrinks vertically', () => {
    const layout: GridLayout = {
      canvas: canvas(1200, 720),
      items: [
        item('header', 0, 0, 1200, 90, { sizeMode: 'fixed-h', fixedHeight: 90 }),
        item('feed-a', 0, 102, 1200, 618),
      ],
    }

    const projected = projectLayout(layout, canvas(1200, 480), { gap: 12 })

    // 480 - 90 (header) - 12 (gap) = 378 px left for the feed.
    expect(rect(byId(projected.items, 'header'))).toEqual({ x: 0, y: 0, w: 1200, h: 90 })
    expect(rect(byId(projected.items, 'feed-a'))).toEqual({ x: 0, y: 102, w: 1200, h: 378 })
  })

  it('makes a canvas-spanning three-column chain fill the target exactly', () => {
    const layout: GridLayout = {
      canvas: canvas(1200, 400),
      items: [
        item('sidebar', 0, 0, 300, 400),
        item('chart', 312, 0, 500, 400),
        item('details', 824, 0, 376, 400),
      ],
    }

    const projected = projectLayout(layout, canvas(1000, 400), { gap: 12 })
    const sidebar = byId(projected.items, 'sidebar')
    const chart = byId(projected.items, 'chart')
    const details = byId(projected.items, 'details')

    // 1000 - 2 * 12 = 976 flexible px shared 300:500:376, rounded to the
    // shared edges: 248.98 → 249, 675.95 → 676, 687.95 → 688.
    expect(rect(sidebar)).toEqual({ x: 0, y: 0, w: 249, h: 400 })
    expect(rect(chart)).toEqual({ x: 261, y: 0, w: 415, h: 400 })
    expect(rect(details)).toEqual({ x: 688, y: 0, w: 312, h: 400 })
    expect(chart.x - (sidebar.x + sidebar.w)).toBe(12)
    expect(details.x - (chart.x + chart.w)).toBe(12)
    expect(details.x + details.w).toBe(1000)
  })

  it('keeps an end-anchored fixed-width item flush with the right edge', () => {
    const layout: GridLayout = {
      canvas: canvas(1200, 80),
      items: [
        item('feed-a', 0, 0, 1100, 80),
        item('controls', 1112, 0, 88, 80, { sizeMode: 'fixed-w', fixedWidth: 88 }),
      ],
    }

    const narrower = projectLayout(layout, canvas(900, 80), { gap: 12 })
    expect(rect(byId(narrower.items, 'feed-a'))).toEqual({ x: 0, y: 0, w: 800, h: 80 })
    expect(rect(byId(narrower.items, 'controls'))).toEqual({ x: 812, y: 0, w: 88, h: 80 })

    const wider = projectLayout(layout, canvas(1600, 80), { gap: 12 })
    expect(rect(byId(wider.items, 'feed-a'))).toEqual({ x: 0, y: 0, w: 1500, h: 80 })
    expect(rect(byId(wider.items, 'controls'))).toEqual({ x: 1512, y: 0, w: 88, h: 80 })
  })

  it('floors a shrinking item at its minimum width', () => {
    // The chain does not span the canvas (100 px free on each side), so
    // the min floor survives the redistribution pass.
    const layout: GridLayout = {
      canvas: canvas(1200, 200),
      items: [item('form', 100, 0, 500, 200, { minW: 400 }), item('note', 600, 0, 500, 200)],
    }

    const projected = projectLayout(layout, canvas(600, 200))

    // Proportional share would be 250 px each; `form` is floored at 400 and
    // `note` gives up the difference so the chain still fits the canvas.
    expect(rect(byId(projected.items, 'form'))).toEqual({ x: 0, y: 0, w: 400, h: 200 })
    expect(rect(byId(projected.items, 'note'))).toEqual({ x: 400, y: 0, w: 200, h: 200 })
  })

  it('caps a minimum width at the available inner width', () => {
    const layout: GridLayout = {
      canvas: canvas(1200, 200),
      items: [item('chart', 0, 0, 1000, 200, { minW: 800 })],
    }

    const projected = projectLayout(layout, canvas(600, 200))

    expect(rect(byId(projected.items, 'chart'))).toEqual({ x: 0, y: 0, w: 600, h: 200 })
  })

  it('does not clamp item height on a scrollable canvas', () => {
    const items = [item('feed-a', 0, 0, 1200, 900)]

    const scrollable = projectLayout(
      { canvas: canvas(1200, 720, { heightMode: 'scrollable' }), items },
      canvas(600, 720, { heightMode: 'scrollable' }),
    )
    expect(rect(scrollable.items[0])).toEqual({ x: 0, y: 0, w: 600, h: 900 })

    const bounded = projectLayout({ canvas: canvas(1200, 720), items }, canvas(600, 720))
    expect(rect(bounded.items[0])).toEqual({ x: 0, y: 0, w: 600, h: 720 })
  })

  it('moves items into the new padding when only padding changes', () => {
    const layout: GridLayout = {
      canvas: canvas(1200, 720),
      items: [item('feed-a', 0, 0, 594, 720), item('feed-b', 606, 0, 594, 720)],
    }

    const projected = projectLayout(
      layout,
      canvas(1200, 720, { padding: { top: 20, right: 20, bottom: 20, left: 20 } }),
      { gap: 12 },
    )

    // Inner area is 1160x680: (1160 - 12) / 2 = 574 px per column.
    expect(rect(byId(projected.items, 'feed-a'))).toEqual({ x: 20, y: 20, w: 574, h: 680 })
    expect(rect(byId(projected.items, 'feed-b'))).toEqual({ x: 606, y: 20, w: 574, h: 680 })
  })

  it('scales rows independently and lets trailing empty space scale with the row', () => {
    const layout: GridLayout = {
      canvas: canvas(1200, 720),
      items: [
        item('feed-a', 0, 0, 600, 300),
        item('feed-b', 600, 0, 600, 300),
        item('note', 0, 300, 400, 420),
      ],
    }

    const projected = projectLayout(layout, canvas(600, 720))

    expect(rect(byId(projected.items, 'feed-a'))).toEqual({ x: 0, y: 0, w: 300, h: 300 })
    expect(rect(byId(projected.items, 'feed-b'))).toEqual({ x: 300, y: 0, w: 300, h: 300 })
    // 400 px item + 800 px of empty space: the item keeps its third.
    expect(rect(byId(projected.items, 'note'))).toEqual({ x: 0, y: 300, w: 200, h: 420 })
  })

  it('composes scaleItems and preserveGaps into the projectLayout result', () => {
    const source = canvas(1200, 400)
    const target = canvas(1000, 400)
    const items = [
      item('sidebar', 0, 0, 300, 400),
      item('chart', 312, 0, 500, 400),
      item('details', 824, 0, 376, 400),
    ]

    const scaled = scaleItems(items, source, target, 12)
    // scaleItems keeps fractional sizes: 976 * 300 / 1176 ≈ 248.98.
    expect(byId(scaled, 'sidebar').w).toBeCloseTo((976 * 300) / 1176, 6)
    expect(byId(scaled, 'chart').x).toBeCloseTo((976 * 300) / 1176 + 12, 6)
    expect(byId(scaled, 'details').w).toBeCloseTo((976 * 376) / 1176, 6)

    preserveGaps(scaled, items, 12, target, source)
    const projected = projectLayout({ canvas: source, items }, target, { gap: 12 })
    expect(scaled.map(rect)).toEqual(projected.items.map(rect))
    expect(scaled.map(rect)).toEqual([
      { x: 0, y: 0, w: 249, h: 400 },
      { x: 261, y: 0, w: 415, h: 400 },
      { x: 688, y: 0, w: 312, h: 400 },
    ])
  })

  it('ratio-scales a floating rect inside the padded inner areas', () => {
    expect(
      projectFloatingRect({ x: 100, y: 50, w: 200, h: 100 }, canvas(1000, 500), canvas(2000, 1000)),
    ).toEqual({
      x: 200,
      y: 100,
      w: 400,
      h: 200,
    })

    // Inner areas 980x480 → 1960x960 (ratio 2 on both axes); the rect's
    // inner offset (100, 50) doubles and re-enters the new padding.
    expect(
      projectFloatingRect(
        { x: 110, y: 60, w: 200, h: 100 },
        canvas(1000, 500, { padding: { top: 10, right: 10, bottom: 10, left: 10 } }),
        canvas(2000, 1000, { padding: { top: 20, right: 20, bottom: 20, left: 20 } }),
      ),
    ).toEqual({ x: 220, y: 120, w: 400, h: 200 })
  })
})
