import { describe, it } from 'bun:test'

import { preserveGaps, scaleItems, type GridCanvas, type GridItem } from 'gridla'

import { boundedCanvas } from '../fixtures/nodes'

/**
 * Comprehensive projection-consistency battery. For every layout the
 * caller defines, we re-project across many viewport sizes (shrink,
 * grow, asymmetric stretch) and assert a strict set of invariants:
 *
 *   1. Every item rect is integer (no float drift in the output).
 *   2. Items at the same authored X (or right / Y / bottom) land at
 *      the same target X (or right / Y / bottom). Cross-chain edge
 *      convergence — no row drifts 1 px from its neighbour row.
 *   3. Configured-gap slots stay at exactly `configGap` viewport
 *      pixels (tolerance: 1 px, accounting for rounding).
 *   4. Touching slots (authored gap = 0) stay at 0 viewport pixels.
 *   5. Items fill the canvas: leftmost item's x === canvas.padding.left,
 *      rightmost item's right === canvas.width − canvas.padding.right
 *      (same on the Y axis).
 *   6. No two items overlap in viewport coords.
 *
 * Every layout × every viewport combination runs as its own test so a
 * single failure surfaces with the exact case name.
 */
describe('projection consistency battery', () => {
  type LayoutCase = {
    name: string
    sourceCanvas: GridCanvas
    items: GridItem[]
    configGap: number
  }

  function collectSharedEdges(items: readonly GridItem[]): {
    leftXs: Set<number>
    rightXs: Set<number>
    topYs: Set<number>
    bottomYs: Set<number>
  } {
    const leftCount = new Map<number, number>()
    const rightCount = new Map<number, number>()
    const topCount = new Map<number, number>()
    const bottomCount = new Map<number, number>()
    for (const entry of items) {
      leftCount.set(entry.x, (leftCount.get(entry.x) ?? 0) + 1)
      rightCount.set(entry.x + entry.w, (rightCount.get(entry.x + entry.w) ?? 0) + 1)
      topCount.set(entry.y, (topCount.get(entry.y) ?? 0) + 1)
      bottomCount.set(entry.y + entry.h, (bottomCount.get(entry.y + entry.h) ?? 0) + 1)
    }
    const pickShared = (map: Map<number, number>) => {
      const set = new Set<number>()
      for (const [v, n] of map) if (n >= 2) set.add(v)
      return set
    }
    return {
      leftXs: pickShared(leftCount),
      rightXs: pickShared(rightCount),
      topYs: pickShared(topCount),
      bottomYs: pickShared(bottomCount),
    }
  }

  function project(
    items: readonly GridItem[],
    source: GridCanvas,
    target: GridCanvas,
    configGap: number,
  ): GridItem[] {
    const projected = scaleItems(items, source, target, configGap)
    preserveGaps(projected, items, configGap, target, source)
    return projected
  }

  function check(condition: boolean, message: string) {
    if (!condition) throw new Error(message)
  }

  function assertProjectionInvariants(
    layoutName: string,
    target: GridCanvas,
    canonical: readonly GridItem[],
    projected: readonly GridItem[],
    configGap: number,
  ) {
    const byId = new Map(projected.map((p) => [p.id, p]))

    // 1. Every output rect is integer.
    for (const p of projected) {
      check(Number.isInteger(p.x), `${layoutName} ${p.id}.x not integer`)
      check(Number.isInteger(p.y), `${layoutName} ${p.id}.y not integer`)
      check(Number.isInteger(p.w), `${layoutName} ${p.id}.w not integer`)
      check(Number.isInteger(p.h), `${layoutName} ${p.id}.h not integer`)
    }

    // 2. Items sharing an authored edge land at the same target edge.
    const shared = collectSharedEdges(canonical)
    const groupByCanonical = (key: 'x' | 'y' | 'right' | 'bottom') => {
      const groups = new Map<number, string[]>()
      for (const c of canonical) {
        const v = key === 'x' ? c.x : key === 'y' ? c.y : key === 'right' ? c.x + c.w : c.y + c.h
        const sharedSet =
          key === 'x'
            ? shared.leftXs
            : key === 'y'
              ? shared.topYs
              : key === 'right'
                ? shared.rightXs
                : shared.bottomYs
        if (!sharedSet.has(v)) continue
        const list = groups.get(v) ?? []
        list.push(c.id)
        groups.set(v, list)
      }
      return groups
    }
    for (const [edge, ids] of groupByCanonical('x')) {
      const xs = ids.map((id) => byId.get(id)!.x)
      const range = Math.max(...xs) - Math.min(...xs)
      check(range === 0, `${layoutName} shared authored x=${edge} drifted: ${xs.join(',')}`)
    }
    for (const [edge, ids] of groupByCanonical('right')) {
      const rs = ids.map((id) => {
        const t = byId.get(id)!
        return t.x + t.w
      })
      const range = Math.max(...rs) - Math.min(...rs)
      check(range === 0, `${layoutName} shared authored right=${edge} drifted: ${rs.join(',')}`)
    }
    for (const [edge, ids] of groupByCanonical('y')) {
      const ys = ids.map((id) => byId.get(id)!.y)
      const range = Math.max(...ys) - Math.min(...ys)
      check(range === 0, `${layoutName} shared authored y=${edge} drifted: ${ys.join(',')}`)
    }
    for (const [edge, ids] of groupByCanonical('bottom')) {
      const bs = ids.map((id) => {
        const t = byId.get(id)!
        return t.y + t.h
      })
      const range = Math.max(...bs) - Math.min(...bs)
      check(range === 0, `${layoutName} shared authored bottom=${edge} drifted: ${bs.join(',')}`)
    }

    // 3+4. Gap preservation: for every pair of items adjacent along an
    // axis with the same perpendicular range, the viewport gap matches
    // the authored gap within 1 px (rounding tolerance).
    const buildAdjacentPairs = (axis: 'x' | 'y') => {
      const pairs: Array<{ a: GridItem; b: GridItem; canonGap: number }> = []
      const startKey = axis === 'x' ? 'x' : 'y'
      const sizeKey = axis === 'x' ? 'w' : 'h'
      const perpStart = axis === 'x' ? 'y' : 'x'
      const perpSize = axis === 'x' ? 'h' : 'w'
      for (const a of canonical) {
        for (const b of canonical) {
          if (a.id >= b.id) continue
          // perpendicular overlap → same row/column
          const aPS = a[perpStart]
          const aPE = aPS + a[perpSize]
          const bPS = b[perpStart]
          const bPE = bPS + b[perpSize]
          const overlap = Math.min(aPE, bPE) - Math.max(aPS, bPS)
          if (overlap <= 0) continue
          // adjacent if b starts right after a ends (within 32 px)
          const aEnd = a[startKey] + a[sizeKey]
          const bStart = b[startKey]
          if (bStart < aEnd) continue
          if (bStart - aEnd > 32) continue
          pairs.push({ a, b, canonGap: bStart - aEnd })
        }
      }
      return pairs
    }
    for (const axis of ['x', 'y'] as const) {
      const startKey = axis === 'x' ? 'x' : 'y'
      const sizeKey = axis === 'x' ? 'w' : 'h'
      for (const { a, b, canonGap } of buildAdjacentPairs(axis)) {
        const ta = byId.get(a.id)!
        const tb = byId.get(b.id)!
        const targetGap = tb[startKey] - (ta[startKey] + ta[sizeKey])
        // Touching (canonGap=0) stays touching. Configured-gap slots
        // stay at exactly `configGap`. Other gaps scale with the
        // canvas but we don't enforce — only the two preserved cases
        // are user-facing invariants.
        if (canonGap === 0) {
          check(
            Math.abs(targetGap) <= 1,
            `${layoutName} axis=${axis} ${a.id}↔${b.id} canonGap=0 but targetGap=${targetGap}`,
          )
        } else if (canonGap === configGap) {
          check(
            Math.abs(targetGap - configGap) <= 1,
            `${layoutName} axis=${axis} ${a.id}↔${b.id} canonGap=${canonGap} but targetGap=${targetGap}`,
          )
        }
      }
    }

    // 5. Items fill the canvas on each axis where the authored layout
    // does.
    const padLeft = target.padding.left
    const padRight = target.padding.right
    const padTop = target.padding.top
    const padBottom = target.padding.bottom
    const innerWidth = target.width - padLeft - padRight
    const innerHeight = target.height - padTop - padBottom

    const canonInnerWidth =
      canonical.length === 0 ? 0 : Math.max(...canonical.map((c) => c.x + c.w))
    const canonStartX = canonical.length === 0 ? 0 : Math.min(...canonical.map((c) => c.x))
    if (canonStartX === 0 && canonInnerWidth === innerWidth + padLeft) {
      const projMinX = Math.min(...projected.map((p) => p.x))
      const projMaxRight = Math.max(...projected.map((p) => p.x + p.w))
      check(projMinX === padLeft, `${layoutName} leftmost x: ${projMinX} !== ${padLeft}`)
      check(
        projMaxRight === target.width - padRight,
        `${layoutName} rightmost edge fill: ${projMaxRight} !== ${target.width - padRight}`,
      )
    }
    const canonInnerHeight =
      canonical.length === 0 ? 0 : Math.max(...canonical.map((c) => c.y + c.h))
    const canonStartY = canonical.length === 0 ? 0 : Math.min(...canonical.map((c) => c.y))
    if (canonStartY === 0 && canonInnerHeight === innerHeight + padTop) {
      const projMinY = Math.min(...projected.map((p) => p.y))
      const projMaxBottom = Math.max(...projected.map((p) => p.y + p.h))
      check(projMinY === padTop, `${layoutName} topmost y: ${projMinY} !== ${padTop}`)
      check(
        projMaxBottom === target.height - padBottom,
        `${layoutName} bottommost edge fill: ${projMaxBottom} !== ${target.height - padBottom}`,
      )
    }

    // 6. No two items overlap (geometric overlap on both axes).
    for (let i = 0; i < projected.length; i += 1) {
      for (let j = i + 1; j < projected.length; j += 1) {
        const a = projected[i]!
        const b = projected[j]!
        const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
        const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
        check(
          !(overlapX > 0 && overlapY > 0),
          `${layoutName} items ${a.id} and ${b.id} overlap in viewport (${overlapX}×${overlapY} px)`,
        )
      }
    }
  }

  // ----- Layout cases -----

  const layoutCases: readonly LayoutCase[] = [
    {
      name: 'two-column row, touching',
      configGap: 0,
      sourceCanvas: boundedCanvas(1200, 720, 0),
      items: [
        { id: 'left', x: 0, y: 0, w: 600, h: 720 },
        { id: 'right', x: 600, y: 0, w: 600, h: 720 },
      ],
    },
    {
      name: 'two-column row, 18-px gap',
      configGap: 18,
      sourceCanvas: boundedCanvas(1200, 720, 0),
      items: [
        { id: 'left', x: 0, y: 0, w: 591, h: 720 },
        { id: 'right', x: 609, y: 0, w: 591, h: 720 },
      ],
    },
    {
      name: 'side-panel chain (4 columns, configured 1-px gaps, mixed widths)',
      configGap: 1,
      sourceCanvas: boundedCanvas(1505, 720, 0),
      items: [
        { id: 'main', x: 0, y: 0, w: 600, h: 720 },
        { id: 'p1', x: 601, y: 0, w: 300, h: 720 },
        { id: 'p2', x: 902, y: 0, w: 300, h: 720 },
        { id: 'p3', x: 1203, y: 0, w: 302, h: 720 },
      ],
    },
    {
      name: 'side-panel chain mixed touching + gapped',
      configGap: 1,
      sourceCanvas: boundedCanvas(1200, 720, 0),
      items: [
        { id: 'a', x: 0, y: 0, w: 400, h: 720 },
        // a-b touching
        { id: 'b', x: 400, y: 0, w: 200, h: 720 },
        // b-c gap=1
        { id: 'c', x: 601, y: 0, w: 200, h: 720 },
        // c-d touching
        { id: 'd', x: 801, y: 0, w: 200, h: 720 },
        // d-e gap=1
        { id: 'e', x: 1002, y: 0, w: 198, h: 720 },
      ],
    },
    {
      name: 'vertical chain: 4 stacked rows with 1-px gaps',
      configGap: 1,
      sourceCanvas: boundedCanvas(1200, 800, 0),
      items: [
        { id: 'r1', x: 0, y: 0, w: 1200, h: 199 },
        { id: 'r2', x: 0, y: 200, w: 1200, h: 199 },
        { id: 'r3', x: 0, y: 400, w: 1200, h: 199 },
        { id: 'r4', x: 0, y: 600, w: 1200, h: 200 },
      ],
    },
    {
      name: 'vertical chain: 3 stacked rows, all touching',
      configGap: 0,
      sourceCanvas: boundedCanvas(1200, 720, 0),
      items: [
        { id: 'top', x: 0, y: 0, w: 1200, h: 200 },
        { id: 'mid', x: 0, y: 200, w: 1200, h: 320 },
        { id: 'bot', x: 0, y: 520, w: 1200, h: 200 },
      ],
    },
    {
      name: 'vertical chain: fixed-h header + 5 flex rows with 1-px gaps',
      configGap: 1,
      sourceCanvas: boundedCanvas(1200, 900, 0),
      items: [
        { id: 'header', x: 0, y: 0, w: 1200, h: 64, sizeMode: 'fixed-h', fixedHeight: 64 },
        { id: 'r1', x: 0, y: 65, w: 1200, h: 166 },
        { id: 'r2', x: 0, y: 232, w: 1200, h: 166 },
        { id: 'r3', x: 0, y: 399, w: 1200, h: 166 },
        { id: 'r4', x: 0, y: 566, w: 1200, h: 166 },
        { id: 'r5', x: 0, y: 733, w: 1200, h: 167 },
      ],
    },
    {
      name: 'vertical chain: mixed touching + gapped (5 rows)',
      configGap: 1,
      sourceCanvas: boundedCanvas(1200, 900, 0),
      items: [
        { id: 'r1', x: 0, y: 0, w: 1200, h: 200 },
        // r1-r2 touching
        { id: 'r2', x: 0, y: 200, w: 1200, h: 100 },
        // r2-r3 gap=1
        { id: 'r3', x: 0, y: 301, w: 1200, h: 200 },
        // r3-r4 touching
        { id: 'r4', x: 0, y: 501, w: 1200, h: 199 },
        // r4-r5 gap=1
        { id: 'r5', x: 0, y: 701, w: 1200, h: 199 },
      ],
    },
    {
      name: 'three-column row, 1-px gaps',
      configGap: 1,
      sourceCanvas: boundedCanvas(1200, 720, 0),
      items: [
        { id: 'a', x: 0, y: 0, w: 399, h: 720 },
        { id: 'b', x: 400, y: 0, w: 399, h: 720 },
        { id: 'c', x: 800, y: 0, w: 400, h: 720 },
      ],
    },
    {
      name: 'two-row grid, 4 + 2 items',
      configGap: 1,
      sourceCanvas: boundedCanvas(1200, 720, 0),
      items: [
        { id: 'tl', x: 0, y: 0, w: 599, h: 359 },
        { id: 'tr', x: 600, y: 0, w: 600, h: 359 },
        { id: 'bl', x: 0, y: 360, w: 799, h: 360 },
        { id: 'br', x: 800, y: 360, w: 400, h: 360 },
      ],
    },
    {
      name: 'fixed-h header + flex rows',
      configGap: 0,
      sourceCanvas: boundedCanvas(1200, 900, 0),
      items: [
        { id: 'header', x: 0, y: 0, w: 1200, h: 60, sizeMode: 'fixed-h', fixedHeight: 60 },
        { id: 'body1', x: 0, y: 60, w: 800, h: 420 },
        { id: 'body2', x: 800, y: 60, w: 400, h: 420 },
        { id: 'foot1', x: 0, y: 480, w: 600, h: 420 },
        { id: 'foot2', x: 600, y: 480, w: 600, h: 420 },
      ],
    },
    {
      name: 'workspace-style: header + top4 + bottom2',
      configGap: 1,
      sourceCanvas: boundedCanvas(2263, 1024, 0),
      items: [
        {
          id: 'header',
          x: 0,
          y: 0,
          w: 2263,
          h: 90,
          sizeMode: 'fixed-h',
          fixedHeight: 90,
          policy: { movement: 'locked' },
        },
        { id: 'chart', x: 0, y: 91, w: 1131, h: 488 },
        { id: 'panel-a', x: 1131, y: 91, w: 376, h: 488 },
        { id: 'panel-b', x: 1508, y: 91, w: 377, h: 488 },
        { id: 'form', x: 1885, y: 91, w: 378, h: 488 },
        { id: 'feed', x: 0, y: 580, w: 1884, h: 444 },
        { id: 'details', x: 1885, y: 580, w: 378, h: 444 },
      ],
    },
    {
      name: 'eight uniform tiles',
      configGap: 6,
      sourceCanvas: boundedCanvas(1600, 900, 0),
      items: Array.from({ length: 8 }, (_, i) => {
        const col = i % 4
        const row = Math.floor(i / 4)
        return {
          id: `t${i}`,
          x: col * 400,
          y: row * 450,
          w: col === 3 ? 400 : 394,
          h: 450,
        }
      }),
    },
    {
      name: 'asymmetric padding source / no padding target',
      configGap: 0,
      sourceCanvas: {
        width: 1200,
        height: 720,
        padding: { top: 18, right: 18, bottom: 18, left: 18 },
        heightMode: 'bounded',
      },
      items: [
        { id: 'left', x: 18, y: 18, w: 582, h: 684 },
        { id: 'right', x: 600, y: 18, w: 582, h: 684 },
      ],
    },
    {
      name: 'three-row column-spanning panel layout',
      configGap: 1,
      sourceCanvas: boundedCanvas(1200, 900, 0),
      items: [
        { id: 'chart', x: 0, y: 0, w: 800, h: 599 },
        { id: 'spanning-panel', x: 801, y: 0, w: 399, h: 900 },
        { id: 'feed', x: 0, y: 600, w: 800, h: 300 },
      ],
    },
    {
      name: 'settings pinned to right edge (fixed-w)',
      configGap: 1,
      sourceCanvas: boundedCanvas(1200, 720, 0),
      items: [
        { id: 'left', x: 0, y: 0, w: 1037, h: 720 },
        { id: 'settings', x: 1038, y: 0, w: 162, h: 720, sizeMode: 'fixed-w', fixedWidth: 162 },
      ],
    },
  ]

  // Viewport size set: identity, shrink, grow, asymmetric. The fractional
  // case is the one that exposed the original drift bug.
  const viewportSizes: ReadonlyArray<{ w: number; h: number }> = [
    { w: 800, h: 600 }, // shrink
    { w: 1024, h: 768 },
    { w: 1280, h: 800 },
    { w: 1440, h: 900 },
    { w: 1600, h: 1024 },
    { w: 1858, h: 1024 }, // an earlier reported viewport
    { w: 1920, h: 1080 },
    { w: 2263, h: 1024 }, // the authored canvas (identity for the workspace layout)
    { w: 2560, h: 1440 },
    { w: 3035, h: 1024 }, // the reported viewport (the drift repro)
    { w: 1180, h: 720 }, // asymmetric, near-identity width
    { w: 1601, h: 901 }, // odd numbers — round-half pitfall
  ]

  for (const layout of layoutCases) {
    for (const vp of viewportSizes) {
      const targetCanvas: GridCanvas = {
        width: vp.w,
        height: vp.h,
        padding: { top: 0, right: 0, bottom: 0, left: 0 },
        heightMode: 'bounded',
      }
      const caseName = `${layout.name} @ ${vp.w}×${vp.h}`
      it(caseName, () => {
        const projected = project(layout.items, layout.sourceCanvas, targetCanvas, layout.configGap)
        assertProjectionInvariants(
          caseName,
          targetCanvas,
          layout.items,
          projected,
          layout.configGap,
        )
      })
    }
  }
})
