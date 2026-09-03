/**
 * Deterministic synthetic fixtures for the benchmark suite. Every builder is
 * pure and seeded, so two runs on the same commit exercise identical geometry.
 */
import type { GridCanvas, GridItem, GridLayout, GridNode } from 'gridla'

export const CANVAS_WIDTH = 1600
export const CANVAS_HEIGHT = 1000

/** Item counts every per-size case is run at. */
export const ITEM_COUNTS = [8, 32, 128, 512] as const

/** Aspect ratio the tilers aim for when choosing a column count. */
const TARGET_ASPECT = CANVAS_WIDTH / CANVAS_HEIGHT

/** Gap between dashboard tiles, in pixels. */
export const DASHBOARD_GAP = 8

/** Width of one link in the collision chain, in pixels. */
export const CHAIN_ITEM_WIDTH = 40
export const CHAIN_ITEM_HEIGHT = 200

/** Small deterministic PRNG (mulberry32). Returns values in `[0, 1)`. */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function boundedCanvas(width = CANVAS_WIDTH, height = CANVAS_HEIGHT): GridCanvas {
  return {
    width,
    height,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    heightMode: 'bounded',
  }
}

function rect(id: string, x: number, y: number, w: number, h: number): GridItem {
  return { id, x, y, w, h }
}

/**
 * Tiled dashboard: a column grid with `DASHBOARD_GAP` between tiles. Some
 * tiles span two columns (chosen by the seeded PRNG) and a few carry size
 * constraints, so the projection and solver code paths see mixed input.
 *
 * The final grid cell is always left empty and item `tile-0` never spans, so
 * `freeDropTarget` is a guaranteed collision-free destination for it.
 */
export function dashboardLayout(itemCount: number, seed = 1): GridLayout {
  const random = createRandom(seed)
  const cols = Math.max(1, Math.ceil(Math.sqrt(itemCount * TARGET_ASPECT)))
  const rows = Math.ceil((itemCount + 1) / cols)
  const cellW = CANVAS_WIDTH / cols
  const cellH = CANVAS_HEIGHT / rows
  // Cells beyond `itemCount` are spare; keep one free, the rest may be spanned.
  let spanBudget = cols * rows - itemCount - 1

  const items: GridItem[] = []
  let cell = 0
  while (items.length < itemCount) {
    const col = cell % cols
    const row = Math.floor(cell / cols)
    const index = items.length
    let span = 1
    if (index > 0 && spanBudget > 0 && col < cols - 1 && random() < 0.2) {
      span = 2
      spanBudget -= 1
    }
    const x = Math.round(col * cellW)
    const y = Math.round(row * cellH)
    const w = Math.round((col + span) * cellW) - x - DASHBOARD_GAP
    const h = Math.round((row + 1) * cellH) - y - DASHBOARD_GAP
    const item = rect(`tile-${index}`, x, y, w, h)
    const roll = random()
    if (roll < 0.1) {
      item.minW = Math.round(w * 0.5)
      item.minH = Math.round(h * 0.5)
    } else if (roll < 0.15) {
      item.sizeMode = 'fixed-h'
    }
    items.push(item)
    cell += span
  }

  return { canvas: boundedCanvas(), items }
}

/** Top-left of the empty cell `dashboardLayout` reserves. */
export function freeDropTarget(itemCount: number): { x: number; y: number } {
  const cols = Math.max(1, Math.ceil(Math.sqrt(itemCount * TARGET_ASPECT)))
  const rows = Math.ceil((itemCount + 1) / cols)
  const lastCell = cols * rows - 1
  return {
    x: Math.round((lastCell % cols) * (CANVAS_WIDTH / cols)),
    y: Math.round(Math.floor(lastCell / cols) * (CANVAS_HEIGHT / rows)),
  }
}

/**
 * Worst-case push cascade: one row of touching items with slack only at the
 * far right, so moving the first link right shoves every other link along.
 */
export function collisionChainLayout(itemCount: number): GridLayout {
  const width = Math.round(CHAIN_ITEM_WIDTH * itemCount * 1.25)
  const items: GridItem[] = []
  for (let index = 0; index < itemCount; index += 1) {
    items.push(
      rect(`link-${index}`, index * CHAIN_ITEM_WIDTH, 0, CHAIN_ITEM_WIDTH, CHAIN_ITEM_HEIGHT),
    )
  }
  return { canvas: boundedCanvas(width, CANVAS_HEIGHT), items }
}

/**
 * Row count for `packedLayout`: the divisor of `itemCount` closest to the
 * canvas aspect ratio, so every row holds the same number of equal cells.
 * Falls back to the nearest integer (uneven rows) when `itemCount` is prime.
 */
export function packedRowCount(itemCount: number): number {
  const ideal = Math.max(1, Math.sqrt(itemCount / TARGET_ASPECT))
  let best = Math.max(1, Math.round(ideal))
  let bestDistance = Number.POSITIVE_INFINITY
  for (let rows = 1; rows <= itemCount; rows += 1) {
    if (itemCount % rows !== 0) continue
    const distance = Math.abs(Math.log(rows / ideal))
    if (distance < bestDistance) {
      best = rows
      bestDistance = distance
    }
  }
  return best
}

/**
 * Fully packed canvas: rows of equal-height items whose widths add up to the
 * canvas width exactly, with no gaps. There is no free space anywhere, so any
 * move must swap, push, or shrink.
 */
export function packedLayout(itemCount: number): GridLayout {
  const rows = packedRowCount(itemCount)
  const base = Math.floor(itemCount / rows)
  const extra = itemCount % rows
  const rowH = CANVAS_HEIGHT / rows
  const items: GridItem[] = []
  for (let row = 0; row < rows; row += 1) {
    const perRow = base + (row < extra ? 1 : 0)
    const y = Math.round(row * rowH)
    const h = Math.round((row + 1) * rowH) - y
    for (let col = 0; col < perRow; col += 1) {
      const x = Math.round((col * CANVAS_WIDTH) / perRow)
      const w = Math.round(((col + 1) * CANVAS_WIDTH) / perRow) - x
      items.push(rect(`slot-${items.length}`, x, y, w, h))
    }
  }
  return { canvas: boundedCanvas(), items }
}

/** Layout of `count` tiles filling a container's canvas, used by `nestedTree`. */
function tiledChildren(ids: readonly string[], canvas: GridCanvas, gap: number): GridItem[] {
  const cols = Math.max(1, Math.ceil(Math.sqrt(ids.length)))
  const rows = Math.ceil(ids.length / cols)
  const cellW = canvas.width / cols
  const cellH = canvas.height / rows
  return ids.map((id, index) => {
    const col = index % cols
    const row = Math.floor(index / cols)
    const x = Math.round(col * cellW)
    const y = Math.round(row * cellH)
    return rect(
      id,
      x,
      y,
      Math.round((col + 1) * cellW) - x - (col < cols - 1 ? gap : 0),
      Math.round((row + 1) * cellH) - y - (row < rows - 1 ? gap : 0),
    )
  })
}

/**
 * Balanced tree of containers. Every node above the leaf level has `breadth`
 * children tiled inside a 1200x800 authored canvas. Total node count is
 * `sum(breadth^i, i = 0..depth)`; depth 3 breadth 4 gives 85 nodes.
 */
export function nestedTree(depth: number, breadth: number, gap = 6): GridNode {
  const build = (id: string, level: number): GridNode => {
    if (level >= depth) return { id }
    const childIds: string[] = []
    for (let index = 0; index < breadth; index += 1) childIds.push(`${id}-${index}`)
    const canvas = boundedCanvas(1200, 800)
    return {
      id,
      gap,
      layout: { canvas, items: tiledChildren(childIds, canvas, gap) },
      children: childIds.map((childId) => build(childId, level + 1)),
    }
  }
  return build('group', 0)
}

export function countNodes(node: GridNode): number {
  return 1 + (node.children ?? []).reduce((sum, child) => sum + countNodes(child), 0)
}

/**
 * `dashboardLayout` scaled into the top-left quadrant of the canvas, leaving
 * the rest empty. Dropping an item far from every chain is a pure free move.
 */
export function sparseLayout(itemCount: number): GridLayout {
  const layout = dashboardLayout(itemCount)
  return {
    canvas: layout.canvas,
    items: layout.items.map((item) => ({
      ...item,
      x: Math.round(item.x / 2),
      y: Math.round(item.y / 2),
      w: Math.max(1, Math.round(item.w / 2)),
      h: Math.max(1, Math.round(item.h / 2)),
    })),
  }
}

/** Same geometry as `dashboardLayout` on a canvas too short to hold it. */
export function overflowingLayout(itemCount: number): GridLayout {
  const layout = dashboardLayout(itemCount)
  return {
    canvas: boundedCanvas(CANVAS_WIDTH, Math.round(CANVAS_HEIGHT * 0.6)),
    items: layout.items,
  }
}
