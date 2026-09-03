import { describe, expect, it } from 'bun:test'

import {
  applyGap,
  normalizeCanvas,
  projectLayout,
  roundItemRects,
  type GridItem,
  type GridLayout,
} from 'gridla'

const item = (
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  extra: Partial<GridItem> = {},
): GridItem => ({
  id,
  x,
  y,
  w,
  h,
  minW: 1,
  minH: 1,
  ...extra,
})

const byId = (items: Array<GridItem>, id: string) => {
  const found = items.find((entry) => entry.id === id)
  if (!found) throw new Error(`Missing item: ${id}`)
  return found
}

const overlap = (left: GridItem, right: GridItem) =>
  left.x < right.x + right.w &&
  left.x + left.w > right.x &&
  left.y < right.y + right.h &&
  left.y + left.h > right.y

describe('segment projection', () => {
  it('keeps fixed trailing controls pinned while flexible neighbors resize', () => {
    const layout: GridLayout = {
      canvas: {
        width: 1000,
        height: 80,
        padding: { top: 0, right: 0, bottom: 0, left: 0 },
        heightMode: 'bounded',
      },
      items: [
        item('feed-a', 0, 0, 950, 80),
        item('controls', 962, 0, 38, 80, {
          sizeMode: 'fixed-w',
        }),
      ],
    }

    const projected = projectLayout(
      layout,
      {
        ...layout.canvas,
        width: 1200,
      },
      { strategy: 'segments' },
    )

    const feed = byId(projected.items, 'feed-a')
    const controls = byId(projected.items, 'controls')

    expect(controls.w).toBe(38)
    expect(controls.x + controls.w).toBe(1200)
    expect(controls.x - (feed.x + feed.w)).toBe(12)
  })

  it('reflows adjacent minimum-width items instead of overlapping them', () => {
    const layout: GridLayout = {
      canvas: {
        width: 1200,
        height: 720,
        padding: { top: 0, right: 0, bottom: 0, left: 0 },
        heightMode: 'bounded',
      },
      items: [
        item('selector', 0, 0, 100, 720, { minW: 100 }),
        item('header', 100, 0, 1000, 720, { minW: 100 }),
        item('settings', 1100, 0, 100, 720, { minW: 100 }),
      ],
    }

    const projected = projectLayout(
      layout,
      {
        ...layout.canvas,
        width: 1088,
      },
      { strategy: 'segments' },
    )

    expect(
      projected.items.some((left, index) =>
        projected.items.slice(index + 1).some((right) => overlap(left, right)),
      ),
    ).toBe(false)
    expect(
      byId(projected.items, 'settings').x + byId(projected.items, 'settings').w,
    ).toBeLessThanOrEqual(1088)
  })

  it('projects oversized minimum-height constraints into the live layout', () => {
    const layout: GridLayout = {
      canvas: {
        width: 1200,
        height: 720,
        padding: { top: 0, right: 0, bottom: 0, left: 0 },
        heightMode: 'bounded',
      },
      items: [
        item('selector', 0, 0, 100, 720, { minH: 720 }),
        item('header', 100, 0, 1000, 720, { minH: 720 }),
        item('settings', 1100, 0, 100, 720, { minH: 720 }),
      ],
    }

    const projected = projectLayout(
      layout,
      {
        ...layout.canvas,
        height: 31,
      },
      { strategy: 'segments' },
    )

    for (const projectedItem of projected.items) {
      expect(projectedItem.h).toBe(31)
      expect(projectedItem.minH).toBe(31)
      expect(projectedItem.y + projectedItem.h).toBeLessThanOrEqual(31)
    }
  })

  it('commits rendered rects as the new canonical canvas without scaling them', () => {
    const canvas = {
      width: 722,
      height: 418,
      padding: { top: 6, right: 6, bottom: 6, left: 6 },
      heightMode: 'scrollable' as const,
    }
    const committed = {
      canvas: normalizeCanvas(canvas),
      items: roundItemRects([item('a', 12.2, 4.6, 220.4, 91.5)]),
    }

    expect(committed.canvas).toMatchObject({ width: 722, height: 418 })
    expect(committed.items[0]).toMatchObject({
      x: 12,
      y: 5,
      w: 220,
      h: 92,
    })
  })

  it('applies the configured container gap to adjacent items', () => {
    const layout: GridLayout = {
      canvas: {
        width: 1200,
        height: 600,
        padding: { top: 0, right: 0, bottom: 0, left: 0 },
        heightMode: 'bounded',
      },
      items: [item('feed-a', 0, 0, 600, 600), item('feed-b', 600, 0, 600, 600)],
    }

    const projected = applyGap(layout, 18)
    const feedA = byId(projected.items, 'feed-a')
    const feedB = byId(projected.items, 'feed-b')

    expect(feedB.x - (feedA.x + feedA.w)).toBe(18)
    expect(feedA.x).toBe(0)
    expect(feedB.x + feedB.w).toBe(1200)
  })

  it('lets a container gap change remove an existing gap', () => {
    const layout: GridLayout = {
      canvas: {
        width: 1200,
        height: 600,
        padding: { top: 0, right: 0, bottom: 0, left: 0 },
        heightMode: 'bounded',
      },
      items: [item('feed-a', 0, 0, 591, 600), item('feed-b', 609, 0, 591, 600)],
    }

    const projected = applyGap(layout, 0)
    const feedA = byId(projected.items, 'feed-a')
    const feedB = byId(projected.items, 'feed-b')

    expect(feedB.x - (feedA.x + feedA.w)).toBe(0)
    expect(feedB.x + feedB.w).toBe(1200)
  })

  it('rewrites a touching multi-row canon to use the new gap (gap=0 → gap=12)', () => {
    // Items canonically touch (gap=0 in canon) below a fixed-h header.
    // Switching the gap to 12 must produce a coherent layout: row 1
    // (chart row) and row 2 (feed row) shrink to make room for two
    // 12-px gaps under the fixed-h=90 header, x-axis members shrink to
    // absorb the inter-column gaps, and the total layout still fits the
    // 1200x720 canvas. Earlier per-band shrink-grow passes mutated each
    // item across many overlapping bands and produced nonsense.
    const layout: GridLayout = {
      canvas: {
        width: 1200,
        height: 720,
        padding: { top: 0, right: 0, bottom: 0, left: 0 },
        heightMode: 'bounded',
      },
      items: [
        item('header', 0, 0, 1200, 90, {
          sizeMode: 'fixed-h',
          fixedHeight: 90,
          minH: 90,
          maxH: 90,
          minW: 100,
        }),
        item('chart', 0, 90, 600, 330, { minW: 100 }),
        item('ticker', 600, 90, 200, 330, { minW: 100 }),
        item('panel', 800, 90, 200, 330, { minW: 100 }),
        item('form', 1000, 90, 200, 330, { minW: 100 }),
        item('feed-a', 0, 420, 1000, 300, { minW: 100 }),
        item('details', 1000, 420, 200, 300, { minW: 100 }),
      ],
    }

    const projected = applyGap(layout, 12)
    const find = (id: string) => byId(projected.items, id)

    // Header is fixed-h: stays anchored to the top with h=90.
    expect(find('header')).toMatchObject({ x: 0, y: 0, w: 1200, h: 90 })

    // y-axis: header(90) + gap(12) + row1 + gap(12) + row2 = 720,
    // so row1 + row2 = 606. Canon ratio 330/300 ⇒ row1 ≈ 317,
    // row2 ≈ 289. Row 1 starts at y=102; row 2 at y≈431.
    const chart = find('chart')
    const feedA = find('feed-a')
    expect(chart.y).toBe(102)
    expect(chart.h).toBeGreaterThan(314)
    expect(chart.h).toBeLessThan(320)
    expect(feedA.y).toBe(chart.y + chart.h + 12)
    expect(feedA.y + feedA.h).toBe(720)

    // Row-1 siblings share top and bottom with chart.
    for (const id of ['ticker', 'panel', 'form']) {
      const sibling = find(id)
      expect(sibling.y).toBe(chart.y)
      expect(sibling.h).toBe(chart.h)
    }
    // Row-2 siblings share top and bottom with feed-a.
    expect(find('details').y).toBe(feedA.y)
    expect(find('details').h).toBe(feedA.h)

    // x-axis row 1: 4 items, 3 inter-gaps=36, so content=1164.
    // chart canon 600 → 600/1200 * 1164 = 582. Others 200 → 194.
    expect(chart.x).toBe(0)
    expect(chart.w).toBeGreaterThan(578)
    expect(chart.w).toBeLessThan(586)
    expect(find('ticker').x).toBe(chart.x + chart.w + 12)
    expect(find('panel').x).toBe(find('ticker').x + find('ticker').w + 12)
    expect(find('form').x).toBe(find('panel').x + find('panel').w + 12)
    expect(find('form').x + find('form').w).toBe(1200)

    // x-axis row 2: feed-a 1000 → 990, details 200 → 198,
    // one gap of 12 between.
    expect(feedA.x).toBe(0)
    expect(find('details').x).toBe(feedA.x + feedA.w + 12)
    expect(find('details').x + find('details').w).toBe(1200)
  })

  it('produces a similar layout when stepping gap through 1 → 6 → 12 cumulatively', () => {
    // Regression: switching the container gap several times accumulated
    // nonsense (feed-a x jumped to 420, sizes shrunk in odd ways). After
    // each step the canonical positions must still be a clean multi-row
    // layout with the new gap.
    const layout: GridLayout = {
      canvas: {
        width: 1200,
        height: 720,
        padding: { top: 0, right: 0, bottom: 0, left: 0 },
        heightMode: 'bounded',
      },
      items: [
        item('header', 0, 0, 1200, 90, {
          sizeMode: 'fixed-h',
          fixedHeight: 90,
          minH: 90,
          maxH: 90,
          minW: 100,
        }),
        item('chart', 0, 90, 600, 330, { minW: 100 }),
        item('ticker', 600, 90, 200, 330, { minW: 100 }),
        item('panel', 800, 90, 200, 330, { minW: 100 }),
        item('form', 1000, 90, 200, 330, { minW: 100 }),
        item('feed-a', 0, 420, 1000, 300, { minW: 100 }),
        item('details', 1000, 420, 200, 300, { minW: 100 }),
      ],
    }
    let next = applyGap(layout, 1)
    next = applyGap(next, 6)
    next = applyGap(next, 12)
    const find = (id: string) => byId(next.items, id)

    // Same invariants as the single-step case, with a slightly larger
    // tolerance for cumulative rounding.
    const chart = find('chart')
    const feedA = find('feed-a')
    expect(find('header')).toMatchObject({ x: 0, y: 0, w: 1200, h: 90 })
    expect(chart.x).toBe(0)
    expect(chart.y).toBe(102)
    expect(feedA.x).toBe(0)
    expect(feedA.y).toBe(chart.y + chart.h + 12)
    expect(feedA.y + feedA.h).toBe(720)
    // Row 1 ends exactly at canvas right.
    expect(find('form').x + find('form').w).toBe(1200)
    // Row 2 ends exactly at canvas right.
    expect(find('details').x + find('details').w).toBe(1200)
    // All row-1 items share the chart bottom.
    for (const id of ['ticker', 'panel', 'form']) {
      expect(find(id).y + find(id).h).toBe(chart.y + chart.h)
    }
    // details shares the feed-a bottom.
    expect(find('details').y + find('details').h).toBe(feedA.y + feedA.h)
  })

  it('keeps independent columns below a full-width header from being stacked', () => {
    const layout: GridLayout = {
      canvas: {
        width: 1112,
        height: 794,
        padding: { top: 18, right: 18, bottom: 18, left: 18 },
        heightMode: 'bounded',
      },
      items: [
        item('header', 18, 18, 1076, 38),
        item('feed-a', 18, 73, 542, 703),
        item('feed-b', 578, 74, 516, 665),
      ],
    }

    const projected = applyGap(layout, 18)
    const header = byId(projected.items, 'header')
    const feedA = byId(projected.items, 'feed-a')
    const feedB = byId(projected.items, 'feed-b')

    expect(header).toMatchObject({ x: 18, y: 18, w: 1076, h: 38 })
    expect(feedA).toMatchObject({ x: 18, y: 74, w: 542, h: 702 })
    expect(feedB).toMatchObject({ x: 578, y: 74, w: 516, h: 665 })
  })

  it('rewrites a MIXED-gap canon row when the gap is switched', () => {
    // Row 1 (chart, ticker, panel, form) has mixed authored x-gaps —
    // chart and ticker touch (canonGap=0), ticker and panel are 1 px
    // apart, panel and form touch (canonGap=0). Without relaxed gap
    // detection, the chain repack rejects every candidate gap because
    // lane 1 (ticker) has only a "short" member (ends 1 px before the
    // lane boundary) and the per-lane EXACT-anchor rule marked that lane
    // unanchored. The X chain was silently skipped; switching the gap to
    // 18 left horizontal sibling distances unchanged.
    const layout: GridLayout = {
      canvas: {
        width: 2263,
        height: 1024,
        padding: { top: 0, right: 0, bottom: 0, left: 0 },
        heightMode: 'bounded',
      },
      items: [
        item('header', 0, 0, 2263, 90, {
          sizeMode: 'fixed-h',
          fixedHeight: 90,
          minH: 90,
          maxH: 90,
          minW: 100,
          policy: { movement: 'locked' },
        }),
        // Row 1: chart .. ticker .. panel .. form. Mixed gaps.
        item('chart', 0, 91, 1131, 488, { minW: 100 }),
        item('ticker', 1131, 91, 376, 488, { minW: 100 }),
        item('panel', 1508, 91, 377, 488, { minW: 100 }),
        item('form', 1885, 91, 378, 488, { minW: 100 }),
        // Row 2: feed-a .. details (1-px gap).
        item('feed-a', 0, 580, 1884, 444, { minW: 100 }),
        item('details', 1885, 580, 378, 444, { minW: 100 }),
      ],
    }

    const projected = applyGap(layout, 18)
    const find = (id: string) => byId(projected.items, id)

    // Row 1: four items with three 18-px x-gaps. They must visibly
    // separate from each other (was: still touching after the switch).
    const chart = find('chart')
    const ticker = find('ticker')
    const panel = find('panel')
    const form = find('form')
    expect(ticker.x - (chart.x + chart.w)).toBe(18)
    expect(panel.x - (ticker.x + ticker.w)).toBe(18)
    expect(form.x - (panel.x + panel.w)).toBe(18)
    // Row 1 still spans the full canvas width.
    expect(chart.x).toBe(0)
    expect(form.x + form.w).toBe(2263)
    // Row 2: feed-a .. details with 18-px gap, also spans canvas.
    const feedA = find('feed-a')
    const details = find('details')
    expect(details.x - (feedA.x + feedA.w)).toBe(18)
    expect(feedA.x).toBe(0)
    expect(details.x + details.w).toBe(2263)
    // Y axis: header 90 + 18 gap → chart row → 18 gap → feed row.
    expect(chart.y).toBe(90 + 18)
    expect(feedA.y).toBe(chart.y + chart.h + 18)
    expect(feedA.y + feedA.h).toBe(1024)
  })
})

describe('applyGap detects the authored spacing', () => {
  const canvas = normalizeCanvas({
    width: 960,
    height: 600,
    padding: { top: 16, right: 16, bottom: 16, left: 16 },
    heightMode: 'bounded',
  })
  // A 16px dashboard: 16 is not in the historical recognized list.
  const authored: GridLayout = {
    canvas,
    items: [
      item('chart', 16, 16, 600, 280),
      item('stat-1', 632, 16, 312, 132),
      item('stat-2', 632, 164, 312, 132),
      item('table', 16, 312, 928, 272),
    ],
  }

  it('re-spaces both axes without recognizedGaps', () => {
    const spaced = applyGap(authored, 32)
    const chart = byId(spaced.items, 'chart')
    const stat1 = byId(spaced.items, 'stat-1')
    const stat2 = byId(spaced.items, 'stat-2')
    const table = byId(spaced.items, 'table')
    expect(stat1.x - (chart.x + chart.w)).toBe(32)
    expect(stat2.y - (stat1.y + stat1.h)).toBe(32)
    expect(table.y - (chart.y + chart.h)).toBe(32)
    expect(table.y - (stat2.y + stat2.h)).toBe(32)
    // Canvas-spanning chains still fill the canvas.
    expect(stat1.x + stat1.w).toBe(944)
    expect(table.y + table.h).toBe(584)
    // The column and the tall neighbor stay aligned.
    expect(stat2.y + stat2.h).toBe(chart.y + chart.h)
  })

  it('is stable at the authored gap', () => {
    expect(applyGap(authored, 16).items).toEqual(authored.items)
  })

  it('leaves deliberate white space alone', () => {
    const sparse: GridLayout = {
      canvas,
      items: [item('a', 16, 16, 300, 100), item('b', 416, 16, 300, 100)],
    }
    expect(applyGap(sparse, 8).items).toEqual(sparse.items)
  })
})
