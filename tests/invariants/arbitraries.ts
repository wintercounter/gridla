import * as fc from 'fast-check'

import { renderLayoutForRect } from 'gridla'

import type {
  GridCanvas,
  GridItem,
  GridLayout,
  GridNode,
  GridPadding,
  GridPoint,
  GridRect,
  GridResizeEdge,
  GridSizeMode,
  ProjectionStrategy,
} from 'gridla'

/**
 * Generators shared by the invariant suites. Layouts are built by tiling rows
 * and columns with random gaps, so generated items never overlap and always
 * sit inside the canvas. Everything is integer-valued so counterexamples are
 * readable and reproducible.
 */

export const GAPS = [0, 6, 12, 18] as const

export type Gap = (typeof GAPS)[number]

// ---------------------------------------------------------------------------
// Canvases
// ---------------------------------------------------------------------------

const paddingValue = fc.integer({ min: 0, max: 24 })

export const paddingArb: fc.Arbitrary<GridPadding> = fc.oneof(
  paddingValue.map((p) => ({ top: p, right: p, bottom: p, left: p })),
  fc.record({ top: paddingValue, right: paddingValue, bottom: paddingValue, left: paddingValue }),
)

export const canvasArb: fc.Arbitrary<GridCanvas> = fc.record({
  width: fc.integer({ min: 200, max: 2400 }),
  height: fc.integer({ min: 200, max: 1600 }),
  padding: paddingArb,
  heightMode: fc.constantFrom('bounded', 'scrollable'),
})

export const boundedCanvasArb: fc.Arbitrary<GridCanvas> = canvasArb.map((canvas) => ({
  ...canvas,
  heightMode: 'bounded',
}))

export function innerWidth(canvas: GridCanvas): number {
  return canvas.width - canvas.padding.left - canvas.padding.right
}

export function innerHeight(canvas: GridCanvas): number {
  return canvas.height - canvas.padding.top - canvas.padding.bottom
}

// ---------------------------------------------------------------------------
// Tiled item sets
// ---------------------------------------------------------------------------

const sizeModeArb: fc.Arbitrary<GridSizeMode | undefined> = fc.option(
  fc.constantFrom<GridSizeMode>('free', 'fixed-w', 'fixed-h', 'fixed'),
  { nil: undefined },
)

type TileCell = {
  weight: number
  gapPct: number
  minW: number
  minH: number
  sizeMode: GridSizeMode | undefined
}

type TileRow = {
  weight: number
  gapPct: number
  cells: TileCell[]
}

export type TileSpec = {
  rows: TileRow[]
  /** Index of the locked item (mod item count), if any. */
  lockedIndex: number | undefined
  /** Index of the ghost item (mod item count), if any. */
  ghostIndex: number | undefined
}

const cellArb: fc.Arbitrary<TileCell> = fc.record({
  weight: fc.integer({ min: 2, max: 6 }),
  gapPct: fc.integer({ min: 0, max: 25 }),
  minW: fc.integer({ min: 20, max: 80 }),
  minH: fc.integer({ min: 20, max: 80 }),
  sizeMode: sizeModeArb,
})

const rowArb: fc.Arbitrary<TileRow> = fc.record({
  weight: fc.integer({ min: 2, max: 6 }),
  gapPct: fc.integer({ min: 0, max: 25 }),
  cells: fc.array(cellArb, { minLength: 1, maxLength: 4 }),
})

export const tileSpecArb: fc.Arbitrary<TileSpec> = fc
  .record({
    rows: fc.array(rowArb, { minLength: 1, maxLength: 3 }),
    lockedIndex: fc.option(fc.nat(), { nil: undefined }),
    ghostIndex: fc.option(fc.nat(), { nil: undefined }),
  })
  .filter((spec) => spec.rows.reduce((n, row) => n + row.cells.length, 0) >= 2)

/**
 * Split `total` pixels among weighted slots. Each slot keeps a trailing gap
 * (at least `gap` between neighbours, plus a random share) so the tiles never
 * touch closer than the solver gap.
 */
function splitAxis(
  total: number,
  start: number,
  parts: readonly { weight: number; gapPct: number }[],
  gap: number,
): { start: number; size: number }[] {
  const units = parts.reduce((sum, part) => sum + part.weight, 0)
  const out: { start: number; size: number }[] = []
  let cursor = start
  let used = 0
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i]!
    const isLast = i === parts.length - 1
    const slot = isLast ? total - used : Math.floor((total * part.weight) / units)
    used += slot
    const wanted = Math.floor((slot * part.gapPct) / 100)
    const trailing = Math.min(slot - 1, isLast ? wanted : Math.max(gap, wanted))
    const size = Math.max(1, slot - trailing)
    out.push({ start: cursor, size })
    cursor += slot
  }
  return out
}

/** Lay `spec` out on `canvas` so no two items are closer than `gap`. */
export function tileItems(
  canvas: GridCanvas,
  spec: TileSpec,
  gap: number,
  idPrefix = 'item',
): GridItem[] {
  const items: GridItem[] = []
  const rows = splitAxis(innerHeight(canvas), canvas.padding.top, spec.rows, gap)
  spec.rows.forEach((row, rowIndex) => {
    const band = rows[rowIndex]!
    const cols = splitAxis(innerWidth(canvas), canvas.padding.left, row.cells, gap)
    row.cells.forEach((cell, colIndex) => {
      const col = cols[colIndex]!
      const item: GridItem = {
        id: `${idPrefix}-${items.length}`,
        x: col.start,
        y: band.start,
        w: col.size,
        h: band.size,
        minW: Math.min(cell.minW, col.size),
        minH: Math.min(cell.minH, band.size),
      }
      if (cell.sizeMode !== undefined) item.sizeMode = cell.sizeMode
      items.push(item)
    })
  })
  const count = items.length
  if (spec.lockedIndex !== undefined) {
    items[spec.lockedIndex % count]!.policy = { movement: 'locked' }
  }
  if (spec.ghostIndex !== undefined) {
    let index = spec.ghostIndex % count
    if (spec.lockedIndex !== undefined && index === spec.lockedIndex % count) {
      index = (index + 1) % count
    }
    const target = items[index]!
    target.policy = { ...target.policy, collision: 'ignore' }
  }
  return items
}

/**
 * The gap a tiling can actually honour: `gap` when every row and column can
 * hold its cells plus a gap each, otherwise 0. Tiny rects (nested containers
 * rebased to a few pixels) would otherwise author gaps smaller than the
 * configured one, which the engine is entitled to enforce.
 */
export function effectiveGap(canvas: GridCanvas, spec: TileSpec, gap: number): number {
  const cols = Math.max(...spec.rows.map((row) => row.cells.length))
  const fitsW = innerWidth(canvas) >= cols * (gap + 1)
  const fitsH = innerHeight(canvas) >= spec.rows.length * (gap + 1)
  return fitsW && fitsH ? gap : 0
}

/** A valid layout whose items respect `gap` between neighbours. */
export function layoutArbFor(gap: number, canvas: fc.Arbitrary<GridCanvas> = canvasArb) {
  return fc
    .tuple(canvas, tileSpecArb)
    .map(([c, spec]): GridLayout => ({ canvas: c, items: tileItems(c, spec, gap) }))
}

export const gapArb: fc.Arbitrary<Gap> = fc.constantFrom(...GAPS)

/** A gap plus a layout that honours it. */
export const gappedLayoutArb: fc.Arbitrary<{ gap: Gap; layout: GridLayout }> = gapArb.chain((gap) =>
  layoutArbFor(gap).map((layout) => ({ gap, layout })),
)

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

/** Percent of the inner canvas, slightly overshooting on both ends. */
const percentArb = fc.integer({ min: -10, max: 110 })

export type MoveOp = { kind: 'move'; index: number; px: number; py: number }
export type ResizeOp = {
  kind: 'resize'
  index: number
  edge: GridResizeEdge
  dx: number
  dy: number
}
export type PlaceOp = {
  kind: 'place'
  w: number
  h: number
  minW: number
  minH: number
  sizeMode: GridSizeMode | undefined
  via: 'position' | 'pointer'
  px: number
  py: number
}
export type RemoveOp = { kind: 'remove'; index: number }
export type Op = MoveOp | ResizeOp | PlaceOp | RemoveOp

export const moveOpArb: fc.Arbitrary<MoveOp> = fc.record({
  kind: fc.constant('move'),
  index: fc.nat(),
  px: percentArb,
  py: percentArb,
})

export const resizeOpArb: fc.Arbitrary<ResizeOp> = fc.record({
  kind: fc.constant('resize'),
  index: fc.nat(),
  edge: fc.constantFrom<GridResizeEdge>('n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'),
  dx: fc.integer({ min: -400, max: 400 }),
  dy: fc.integer({ min: -400, max: 400 }),
})

export const placeOpArb: fc.Arbitrary<PlaceOp> = fc.record({
  kind: fc.constant('place'),
  w: fc.integer({ min: 40, max: 600 }),
  h: fc.integer({ min: 40, max: 600 }),
  minW: fc.integer({ min: 20, max: 80 }),
  minH: fc.integer({ min: 20, max: 80 }),
  sizeMode: sizeModeArb,
  via: fc.constantFrom('position', 'pointer'),
  px: percentArb,
  py: percentArb,
})

export const removeOpArb: fc.Arbitrary<RemoveOp> = fc.record({
  kind: fc.constant('remove'),
  index: fc.nat(),
})

export const opArb: fc.Arbitrary<Op> = fc.oneof(moveOpArb, resizeOpArb, placeOpArb, removeOpArb)

export const opSequenceArb: fc.Arbitrary<Op[]> = fc.array(opArb, { minLength: 1, maxLength: 6 })

/** Resolve a percent pair to canvas coordinates. */
export function resolvePoint(canvas: GridCanvas, px: number, py: number): GridPoint {
  return {
    x: Math.round(canvas.padding.left + (innerWidth(canvas) * px) / 100),
    y: Math.round(canvas.padding.top + (innerHeight(canvas) * py) / 100),
  }
}

/** Pick an item by wrapping `index` around the current item count. */
export function pickItem<T>(items: readonly GridItem<T>[], index: number): GridItem<T> {
  const item = items[index % items.length]
  if (!item) throw new Error('pickItem: empty layout')
  return item
}

// ---------------------------------------------------------------------------
// Fitting targets
// ---------------------------------------------------------------------------

function hasFixedWidth(layout: GridLayout): boolean {
  return layout.items.some((item) => item.sizeMode === 'fixed-w' || item.sizeMode === 'fixed')
}

function hasFixedHeight(layout: GridLayout): boolean {
  return layout.items.some((item) => item.sizeMode === 'fixed-h' || item.sizeMode === 'fixed')
}

/**
 * Minimum inner size a tiled layout needs: the widest row of `minW` sums and
 * the stack of per-row `minH` maxima. Rows are the tile bands (shared `y`).
 */
function minimumInner(layout: GridLayout): { w: number; h: number } {
  const rows = new Map<number, { w: number; h: number }>()
  for (const item of layout.items) {
    const row = rows.get(item.y) ?? { w: 0, h: 0 }
    row.w += item.minW ?? 1
    row.h = Math.max(row.h, item.minH ?? 1)
    rows.set(item.y, row)
  }
  let w = 0
  let h = 0
  for (const row of rows.values()) {
    w = Math.max(w, row.w)
    h += row.h
  }
  return { w, h }
}

/**
 * Grow `target` so `layout` can be projected into it without an impossible
 * request: an axis with fixed-size items keeps at least the source inner
 * size, and every axis can hold the authored minimums. Scrollable heights are
 * treated like bounded ones so the precondition stays conservative.
 */
export function fitTarget(layout: GridLayout, target: GridCanvas): GridCanvas {
  const need = minimumInner(layout)
  const padX = target.padding.left + target.padding.right
  const padY = target.padding.top + target.padding.bottom
  const needW = hasFixedWidth(layout) || need.w > innerWidth(target)
  const needH = hasFixedHeight(layout) || need.h > innerHeight(target)
  const width = needW ? Math.max(target.width, padX + innerWidth(layout.canvas)) : target.width
  const height = needH ? Math.max(target.height, padY + innerHeight(layout.canvas)) : target.height
  return { ...target, width, height }
}

export type ProjectionCase = {
  gap: Gap
  layout: GridLayout
  target: GridCanvas
  strategy: ProjectionStrategy
}

export const strategyArb: fc.Arbitrary<ProjectionStrategy> = fc.constantFrom('chain', 'segments')

/** A layout plus a random target canvas that can hold its fixed content. */
export const projectionCaseArb: fc.Arbitrary<ProjectionCase> = fc
  .tuple(gappedLayoutArb, canvasArb, strategyArb)
  .map(([{ gap, layout }, target, strategy]) => ({
    gap,
    layout,
    target: fitTarget(layout, target),
    strategy,
  }))

// ---------------------------------------------------------------------------
// Nested trees
// ---------------------------------------------------------------------------

export type ContainerSpec = {
  canvas: GridCanvas
  spec: TileSpec
  gap: Gap
  padding: GridPadding | undefined
}

const containerSpecArb: fc.Arbitrary<ContainerSpec> = fc.record({
  canvas: boundedCanvasArb,
  spec: tileSpecArb,
  gap: gapArb,
  padding: fc.option(paddingArb, { nil: undefined }),
})

export type TreeCase = {
  root: GridNode
  rootRect: GridRect
}

/**
 * Authored canvas for a container rendered into `rect`. When the authored
 * layout cannot fit the rect (fixed content or minimums larger than the
 * rendered inner size) the canvas is rebased to the rect so the projection is
 * an identity; otherwise the random canvas stays and gets projected.
 */
function fitContainer(
  spec: ContainerSpec,
  rect: GridRect,
  prefix: string,
): { canvas: GridCanvas; padding: GridPadding | undefined; items: GridItem[]; gap: number } {
  const gap = effectiveGap(spec.canvas, spec.spec, spec.gap)
  const items = tileItems(spec.canvas, spec.spec, gap, prefix)
  const padding = spec.padding ?? spec.canvas.padding
  const inner = {
    w: rect.w - padding.left - padding.right,
    h: rect.h - padding.top - padding.bottom,
  }
  const layout = { canvas: spec.canvas, items }
  const need = minimumInner(layout)
  const fitsW = (!hasFixedWidth(layout) || inner.w >= innerWidth(spec.canvas)) && need.w <= inner.w
  const fitsH =
    (!hasFixedHeight(layout) || inner.h >= innerHeight(spec.canvas)) && need.h <= inner.h
  if (fitsW && fitsH) return { canvas: spec.canvas, padding: spec.padding, items, gap }
  // Rebase to the rect. The rect may be tiny, so drop the padding rather
  // than let it exceed the rect and produce a negative inner size.
  const canvas: GridCanvas = {
    width: Math.max(1, Math.round(rect.w)),
    height: Math.max(1, Math.round(rect.h)),
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    heightMode: 'bounded',
  }
  const rebasedGap = effectiveGap(canvas, spec.spec, spec.gap)
  return {
    canvas,
    padding: undefined,
    items: tileItems(canvas, spec.spec, rebasedGap, prefix),
    gap: rebasedGap,
  }
}

/**
 * A two- or three-level tree: a root container whose children are leaves or
 * containers of leaves. Every container's layout is a tiled, non-overlapping
 * item set on its own bounded canvas, sized so its content can fit the rect
 * it renders into.
 */
export const treeArb: fc.Arbitrary<TreeCase> = fc
  .record({
    root: containerSpecArb,
    children: fc.array(fc.option(containerSpecArb, { nil: undefined }), {
      minLength: 12,
      maxLength: 12,
    }),
    rootRect: fc.record({
      x: fc.integer({ min: 0, max: 200 }),
      y: fc.integer({ min: 0, max: 200 }),
      w: fc.integer({ min: 200, max: 2400 }),
      h: fc.integer({ min: 200, max: 1600 }),
    }),
  })
  .map(({ root, children, rootRect }) => {
    const rootFit = fitContainer(root, rootRect, 'panel')
    const rootLayout: GridLayout = { canvas: rootFit.canvas, items: rootFit.items }
    const rendered = renderLayoutForRect(rootLayout, rootRect, rootFit.padding, rootFit.gap)
    const nodes: GridNode[] = rootFit.items.map((item, index) => {
      const child = children[index]
      if (!child) return { id: item.id }
      const projected = rendered.items.find((entry) => entry.id === item.id) ?? item
      const rect = { x: projected.x, y: projected.y, w: projected.w, h: projected.h }
      const fit = fitContainer(child, rect, `${item.id}-card`)
      const node: GridNode = {
        id: item.id,
        layout: { canvas: fit.canvas, items: fit.items },
        children: fit.items.map((grand) => ({ id: grand.id })),
        gap: fit.gap,
      }
      if (fit.padding) node.padding = fit.padding
      return node
    })
    const rootNode: GridNode = {
      id: 'root',
      layout: rootLayout,
      children: nodes,
      gap: rootFit.gap,
    }
    if (rootFit.padding) rootNode.padding = rootFit.padding
    return { root: rootNode, rootRect }
  })

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Recursively freeze a value so any in-place mutation throws. */
export function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.freeze(value)
  for (const key of Object.keys(value as object)) {
    deepFreeze((value as Record<string, unknown>)[key])
  }
  return value
}

/** Structural snapshot used for mutation and determinism checks. */
export function snapshot(value: unknown): string {
  return JSON.stringify(value)
}

export function rectOf(item: GridRect): GridRect {
  return { x: item.x, y: item.y, w: item.w, h: item.h }
}

export function idsOf(items: readonly { id: string }[]): string[] {
  return items.map((item) => item.id).sort()
}
