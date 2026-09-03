import {
  DEFAULT_CANVAS,
  MIN_ITEM_SIZE,
  isFixedHeight,
  isFixedWidth,
  isGhost,
  isLocked,
  type GridBounds,
  type GridCanvas,
  type GridEdges,
  type GridItem,
  type GridItemSize,
  type GridLayout,
  type GridPadding,
  type GridPoint,
  type GridRect,
  type GridResizeEdge,
} from './model'

// ---------------------------------------------------------------------------
// Rect helpers
// ---------------------------------------------------------------------------

/** Right edge of a rectangle (`x + w`). */
export function itemRight(item: Pick<GridRect, 'x' | 'w'>): number {
  return item.x + item.w
}

/** Bottom edge of a rectangle (`y + h`). */
export function itemBottom(item: Pick<GridRect, 'y' | 'h'>): number {
  return item.y + item.h
}

/** Area of a rectangle in square pixels (`w * h`). */
export function itemArea(item: Pick<GridRect, 'w' | 'h'>): number {
  return item.w * item.h
}

/** True when two rectangles share area. Touching edges do not count. */
export function rectsOverlap(left: GridRect, right: GridRect): boolean {
  return (
    left.x < itemRight(right) &&
    itemRight(left) > right.x &&
    left.y < itemBottom(right) &&
    itemBottom(left) > right.y
  )
}

/** True when two rectangles are closer than `gap` on both axes. */
export function rectsViolateGap(left: GridRect, right: GridRect, gap: number): boolean {
  const requiredGap = Math.max(0, gap)
  return (
    left.x < right.x + right.w + requiredGap &&
    left.x + left.w + requiredGap > right.x &&
    left.y < right.y + right.h + requiredGap &&
    left.y + left.h + requiredGap > right.y
  )
}

/** Area shared by two rectangles in square pixels. `0` when they do not overlap. */
export function overlapArea(left: GridRect, right: GridRect): number {
  const width = Math.max(0, Math.min(itemRight(left), itemRight(right)) - Math.max(left.x, right.x))
  const height = Math.max(
    0,
    Math.min(itemBottom(left), itemBottom(right)) - Math.max(left.y, right.y),
  )
  return width * height
}

export function verticalOverlap(left: GridRect, right: GridRect): number {
  return Math.max(0, Math.min(itemBottom(left), itemBottom(right)) - Math.max(left.y, right.y))
}

export function horizontalOverlap(left: GridRect, right: GridRect): number {
  return Math.max(0, Math.min(itemRight(left), itemRight(right)) - Math.max(left.x, right.x))
}

export function edgesIntersect(left: GridEdges, right: GridEdges): boolean {
  return (
    left.left < right.right &&
    left.right > right.left &&
    left.top < right.bottom &&
    left.bottom > right.top
  )
}

export function pointInEdges(point: GridPoint, rect: GridEdges): boolean {
  return (
    point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom
  )
}

/** True when the point lies inside the rectangle. Edges are inclusive. */
export function pointInRect(point: GridPoint, rect: GridRect): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.w &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.h
  )
}

/** Convert an `x`/`y`/`w`/`h` rectangle into `top`/`right`/`bottom`/`left` edges. */
export function rectToEdges(rect: GridRect): GridEdges {
  return { top: rect.y, right: rect.x + rect.w, bottom: rect.y + rect.h, left: rect.x }
}

/** Offset a rect by a container origin, producing viewport edges. */
export function rectToViewportEdges(origin: GridPoint, rect: GridRect): GridEdges {
  const left = origin.x + rect.x
  const top = origin.y + rect.y
  return { top, right: left + rect.w, bottom: top + rect.h, left }
}

/** Shallow-copy every item into a new array. `data` is shared, not cloned. */
export function cloneItems<T>(items: readonly GridItem<T>[]): GridItem<T>[] {
  return items.map((item) => ({ ...item }))
}

export function roundValue(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.round(value)
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

/**
 * Fill in missing sides with `0`, round each side to a whole pixel, and clamp
 * negative values to `0`.
 */
export function normalizePadding(value: Partial<GridPadding> = {}): GridPadding {
  return {
    top: Math.max(0, roundValue(value.top ?? 0)),
    right: Math.max(0, roundValue(value.right ?? 0)),
    bottom: Math.max(0, roundValue(value.bottom ?? 0)),
    left: Math.max(0, roundValue(value.left ?? 0)),
  }
}

/**
 * Fill in defaults and clamp a canvas so it is at least one pixel larger than
 * its padding on both axes.
 */
export function normalizeCanvas(
  value: Partial<GridCanvas> | undefined,
  fallback: GridCanvas = DEFAULT_CANVAS,
): GridCanvas {
  const padding = normalizePadding(value?.padding ?? fallback.padding)
  return {
    width: Math.max(padding.left + padding.right + 1, roundValue(value?.width ?? fallback.width)),
    height: Math.max(
      padding.top + padding.bottom + 1,
      roundValue(value?.height ?? fallback.height),
    ),
    padding,
    heightMode: value?.heightMode ?? fallback.heightMode,
  }
}

/** Width of the canvas inside its left and right padding, in pixels. Never less than `1`. */
export function canvasInnerWidth(canvas: GridCanvas): number {
  return Math.max(1, canvas.width - canvas.padding.left - canvas.padding.right)
}

/** Height of the canvas inside its top and bottom padding, in pixels. Never less than `1`. */
export function canvasInnerHeight(canvas: GridCanvas): number {
  return Math.max(1, canvas.height - canvas.padding.top - canvas.padding.bottom)
}

/**
 * The area inside the canvas padding as a rectangle in canvas coordinates:
 * origin at the padding offset, size from `canvasInnerWidth` and `canvasInnerHeight`.
 */
export function canvasInnerRect(canvas: GridCanvas): GridRect {
  return {
    x: canvas.padding.left,
    y: canvas.padding.top,
    w: canvasInnerWidth(canvas),
    h: canvasInnerHeight(canvas),
  }
}

/**
 * True when two canvases have the same width, height, and padding on every side.
 * `heightMode` is not compared.
 */
export function canvasesEqual(a: GridCanvas, b: GridCanvas): boolean {
  return (
    a.width === b.width &&
    a.height === b.height &&
    a.padding.top === b.padding.top &&
    a.padding.right === b.padding.right &&
    a.padding.bottom === b.padding.bottom &&
    a.padding.left === b.padding.left
  )
}

/** Translate an item from canvas coordinates to padding-relative inner coordinates. */
export function toInnerItem<T>(item: GridItem<T>, canvas: GridCanvas): GridItem<T> {
  return { ...item, x: item.x - canvas.padding.left, y: item.y - canvas.padding.top }
}

/** Translate an item from inner coordinates back to canvas coordinates. */
export function toCanvasItem<T>(item: GridItem<T>, canvas: GridCanvas): GridItem<T> {
  return { ...item, x: item.x + canvas.padding.left, y: item.y + canvas.padding.top }
}

/** Round an item's geometry and constraints to whole pixels. */
export function roundItem<T>(item: GridItem<T>): GridItem<T> {
  const roundConstraint = (value: number | undefined) =>
    typeof value === 'number' ? Math.max(MIN_ITEM_SIZE, roundValue(value)) : value
  return {
    ...item,
    x: roundValue(item.x),
    y: roundValue(item.y),
    w: Math.max(MIN_ITEM_SIZE, roundValue(item.w)),
    h: Math.max(MIN_ITEM_SIZE, roundValue(item.h)),
    minW: roundConstraint(item.minW),
    minH: roundConstraint(item.minH),
    maxW: roundConstraint(item.maxW),
    maxH: roundConstraint(item.maxH),
  }
}

/**
 * Round an item and fit it inside a canvas, honoring min/max constraints and
 * the canvas height mode.
 */
export function normalizeItem<T>(item: GridItem<T>, canvas: GridCanvas): GridItem<T> {
  const rounded = roundItem(item)
  const minW = Math.max(1, roundValue(rounded.minW ?? 1))
  const minH = Math.max(1, roundValue(rounded.minH ?? 1))
  const maxW =
    typeof rounded.maxW === 'number' && Number.isFinite(rounded.maxW)
      ? Math.max(minW, roundValue(rounded.maxW))
      : undefined
  const maxH =
    typeof rounded.maxH === 'number' && Number.isFinite(rounded.maxH)
      ? Math.max(minH, roundValue(rounded.maxH))
      : undefined
  const maxRight = canvas.width - canvas.padding.right
  const maxBottom =
    canvas.heightMode === 'scrollable'
      ? Number.POSITIVE_INFINITY
      : canvas.height - canvas.padding.bottom
  const x = Math.max(canvas.padding.left, roundValue(rounded.x))
  const y = Math.max(canvas.padding.top, roundValue(rounded.y))
  const availableW = Math.max(1, maxRight - x)
  const availableH = Math.max(1, maxBottom - y)
  const w = Math.min(
    availableW,
    maxW ?? Number.POSITIVE_INFINITY,
    Math.max(minW, roundValue(rounded.w)),
  )
  const h = Math.min(
    availableH,
    maxH ?? Number.POSITIVE_INFINITY,
    Math.max(minH, roundValue(rounded.h)),
  )

  return {
    ...rounded,
    x: Math.min(x, Math.max(canvas.padding.left, maxRight - w)),
    y:
      canvas.heightMode === 'scrollable'
        ? y
        : Math.min(y, Math.max(canvas.padding.top, maxBottom - h)),
    w,
    h,
    minW,
    minH,
    maxW,
    maxH,
  }
}

/** Apply `normalizeItem` to every item: round its geometry and clamp it into the canvas. */
export function normalizeItems<T>(
  items: readonly GridItem<T>[],
  canvas: GridCanvas,
): GridItem<T>[] {
  return items.map((item) => normalizeItem(item, canvas))
}

/** Normalize a whole layout: canvas defaults plus every item clamped to it. */
export function normalizeLayout<T>(layout: GridLayout<T>): GridLayout<T> {
  const canvas = normalizeCanvas(layout.canvas)
  return { canvas, items: normalizeItems(layout.items, canvas) }
}

// ---------------------------------------------------------------------------
// Bounds and clamping
// ---------------------------------------------------------------------------

/**
 * Derive solver bounds from a canvas. `height` becomes `null` for `scrollable`
 * canvases so items may extend below the visible height.
 */
export function boundsFromCanvas(canvas: GridCanvas): GridBounds {
  return {
    width: canvas.width,
    height: canvas.heightMode === 'scrollable' ? null : canvas.height,
    padding: canvas.padding,
  }
}

export function boundsInnerRight(bounds: GridBounds): number {
  return bounds.width - bounds.padding.right
}

export function boundsInnerBottom(bounds: GridBounds): number {
  return bounds.height === null ? Number.POSITIVE_INFINITY : bounds.height - bounds.padding.bottom
}

/**
 * Fit an item inside bounds without moving it more than necessary. Sizes are
 * clamped from the current position first; the position only shifts when the
 * minimum size would not fit otherwise.
 */
export function clampItem<T>(item: GridItem<T>, bounds: GridBounds): GridItem<T> {
  const minW = Math.max(MIN_ITEM_SIZE, item.minW ?? MIN_ITEM_SIZE)
  const minH = Math.max(MIN_ITEM_SIZE, item.minH ?? MIN_ITEM_SIZE)
  const maxRight = Math.max(bounds.padding.left + minW, bounds.width - bounds.padding.right)
  const maxBottom =
    bounds.height === null
      ? Number.POSITIVE_INFINITY
      : Math.max(bounds.padding.top + minH, bounds.height - bounds.padding.bottom)
  const next = roundItem(item)

  next.x = Math.max(bounds.padding.left, next.x)
  next.y = Math.max(bounds.padding.top, next.y)

  const canGrowW = !isFixedWidth(next)
  const canGrowH = !isFixedHeight(next)
  next.w = Math.max(minW, next.w)
  next.h = Math.max(minH, next.h)
  if (typeof next.maxW === 'number' && !canGrowW) next.w = Math.min(next.w, next.maxW)
  if (typeof next.maxH === 'number' && !canGrowH) next.h = Math.min(next.h, next.maxH)
  next.w = Math.min(next.w, Math.max(minW, maxRight - next.x))
  if (bounds.height !== null) {
    next.h = Math.min(next.h, Math.max(minH, maxBottom - next.y))
  }

  next.x = Math.min(next.x, maxRight - next.w)
  next.x = Math.max(bounds.padding.left, next.x)
  if (bounds.height !== null) {
    next.y = Math.min(next.y, maxBottom - next.h)
    next.y = Math.max(bounds.padding.top, next.y)
  }

  return next
}

/**
 * Compute the rectangle produced by dragging one edge or corner of an item by
 * a pixel delta. The opposite edge stays anchored. Constraints and bounds are
 * respected; siblings are not considered.
 */
export function resizeRect<T>(
  item: GridItem<T>,
  edge: GridResizeEdge,
  delta: GridPoint,
  bounds: GridBounds,
): GridItem<T> {
  const minW = Math.max(MIN_ITEM_SIZE, item.minW ?? MIN_ITEM_SIZE)
  const minH = Math.max(MIN_ITEM_SIZE, item.minH ?? MIN_ITEM_SIZE)
  const maxRight = Math.max(bounds.padding.left + minW, bounds.width - bounds.padding.right)
  const maxBottom =
    bounds.height === null
      ? Number.POSITIVE_INFINITY
      : Math.max(bounds.padding.top + minH, bounds.height - bounds.padding.bottom)
  const originRight = itemRight(item)
  const originBottom = itemBottom(item)
  const next = { ...item }

  const canGrowW = !isFixedWidth(item)
  const canGrowH = !isFixedHeight(item)
  const authoredMaxW =
    typeof item.maxW === 'number' && !canGrowW ? item.maxW : Number.POSITIVE_INFINITY
  const authoredMaxH =
    typeof item.maxH === 'number' && !canGrowH ? item.maxH : Number.POSITIVE_INFINITY

  if (edge.includes('e')) {
    const maxW = Math.min(authoredMaxW, Math.max(minW, maxRight - item.x))
    next.x = item.x
    next.w = Math.min(maxW, Math.max(minW, item.w + delta.x))
  }
  if (edge.includes('s')) {
    const maxH = Math.min(authoredMaxH, Math.max(minH, maxBottom - item.y))
    next.y = item.y
    next.h = Math.min(maxH, Math.max(minH, item.h + delta.y))
  }
  if (edge.includes('w')) {
    const maxW = Math.min(authoredMaxW, Math.max(minW, originRight - bounds.padding.left))
    const width = Math.min(maxW, Math.max(minW, item.w - delta.x))
    next.w = width
    next.x = Math.max(bounds.padding.left, originRight - width)
  }
  if (edge.includes('n')) {
    const maxH = Math.min(authoredMaxH, Math.max(minH, originBottom - bounds.padding.top))
    const height = Math.min(maxH, Math.max(minH, item.h - delta.y))
    next.h = height
    next.y = Math.max(bounds.padding.top, originBottom - height)
  }

  return roundItem(next)
}

// ---------------------------------------------------------------------------
// Content extent
// ---------------------------------------------------------------------------

/**
 * Lowest bottom edge among the items, in canvas coordinates. Returns the top
 * padding when there are no items.
 */
export function contentBottom(items: readonly GridRect[], canvas: GridCanvas): number {
  return items.reduce((bottom, item) => Math.max(bottom, itemBottom(item)), canvas.padding.top)
}

/**
 * Rightmost right edge among the items, in canvas coordinates. Returns the left
 * padding when there are no items.
 */
export function contentRight(items: readonly GridRect[], canvas: GridCanvas): number {
  return items.reduce((right, item) => Math.max(right, itemRight(item)), canvas.padding.left)
}

/**
 * For scrollable canvases, grow `height` so every item fits. Bounded canvases
 * are returned unchanged.
 */
export function fitCanvasToContent(canvas: GridCanvas, items: readonly GridRect[]): GridCanvas {
  if (canvas.heightMode !== 'scrollable') return canvas
  return {
    ...canvas,
    height: Math.max(canvas.height, contentBottom(items, canvas) + canvas.padding.bottom),
  }
}

// ---------------------------------------------------------------------------
// Item creation and validation
// ---------------------------------------------------------------------------

/**
 * Build a `GridItem` from an id, a size (with optional constraints), and a
 * top-left position (default `0, 0`). `w` and `h` are clamped to `MIN_ITEM_SIZE`;
 * constraint fields and `data` are copied only when defined.
 * @example createItem('chart', { w: 320, h: 240, minW: 120 }, 24, 24)
 */
export function createItem<T = unknown>(
  id: string,
  size: GridItemSize,
  x = 0,
  y = 0,
  data?: T,
): GridItem<T> {
  const item: GridItem<T> = {
    id,
    x,
    y,
    w: Math.max(MIN_ITEM_SIZE, size.w),
    h: Math.max(MIN_ITEM_SIZE, size.h),
  }
  if (size.minW !== undefined) item.minW = size.minW
  if (size.minH !== undefined) item.minH = size.minH
  if (size.maxW !== undefined) item.maxW = size.maxW
  if (size.maxH !== undefined) item.maxH = size.maxH
  if (size.sizeMode !== undefined) item.sizeMode = size.sizeMode
  if (size.fixedWidth !== undefined) item.fixedWidth = size.fixedWidth
  if (size.fixedHeight !== undefined) item.fixedHeight = size.fixedHeight
  if (data !== undefined) item.data = data
  return item
}

/**
 * True when `item` fits inside bounds (within one pixel) and does not violate
 * `gap` against any solid sibling.
 */
export function canPlaceItem(
  items: readonly GridItem[],
  item: GridItem,
  bounds: GridBounds,
  gap: number,
): boolean {
  const clamped = clampItem(item, bounds)
  const TOL = 1
  if (
    Math.abs(clamped.x - item.x) > TOL ||
    Math.abs(clamped.y - item.y) > TOL ||
    Math.abs(clamped.w - item.w) > TOL ||
    Math.abs(clamped.h - item.h) > TOL
  ) {
    return false
  }
  return items.every(
    (current) => current.id === item.id || isGhost(current) || !rectsViolateGap(current, item, gap),
  )
}

/** True when every item in the layout can be placed. */
export function layoutIsValid(
  items: readonly GridItem[],
  bounds: GridBounds,
  gap: number,
): boolean {
  return items.every((item) => canPlaceItem(items, item, bounds, gap))
}

/**
 * One problem reported by `findLayoutViolations`: an item outside the canvas
 * bounds, or two solid items that overlap.
 */
export type LayoutViolation =
  | { kind: 'out-of-bounds'; itemId: string }
  | { kind: 'overlap'; itemId: string; otherId: string }

/**
 * Report bounds and overlap violations. Ghost items and pairs of locked items
 * are exempt from the overlap check.
 */
export function findLayoutViolations(layout: GridLayout): LayoutViolation[] {
  const { canvas, items } = layout
  const violations: LayoutViolation[] = []
  const innerRight = canvas.width - canvas.padding.right
  const innerBottom =
    canvas.heightMode === 'scrollable'
      ? Number.POSITIVE_INFINITY
      : canvas.height - canvas.padding.bottom
  for (const item of items) {
    if (
      item.x < canvas.padding.left - 1 ||
      item.y < canvas.padding.top - 1 ||
      item.x + item.w > innerRight + 1 ||
      item.y + item.h > innerBottom + 1
    ) {
      violations.push({ kind: 'out-of-bounds', itemId: item.id })
    }
  }
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      const a = items[i]
      const b = items[j]
      if (isGhost(a) || isGhost(b)) continue
      if (isLocked(a) && isLocked(b)) continue
      if (rectsOverlap(a, b)) {
        violations.push({ kind: 'overlap', itemId: a.id, otherId: b.id })
      }
    }
  }
  return violations
}

// ---------------------------------------------------------------------------
// Gap enforcement
// ---------------------------------------------------------------------------

function enforceHorizontalMinimumGap(
  left: GridItem,
  right: GridItem,
  bounds: GridBounds,
  gap: number,
): boolean {
  if (verticalOverlap(left, right) <= 0) return false
  const requiredX = itemRight(left) + gap
  if (right.x >= requiredX) return false
  const maxRight = bounds.width - bounds.padding.right
  const rightEdge = itemRight(right)
  const minW = Math.max(MIN_ITEM_SIZE, right.minW ?? MIN_ITEM_SIZE)
  right.x = requiredX
  right.w = Math.max(minW, Math.min(right.w, rightEdge - right.x, maxRight - right.x))
  return true
}

function enforceVerticalMinimumGap(
  top: GridItem,
  bottom: GridItem,
  bounds: GridBounds,
  gap: number,
): boolean {
  if (horizontalOverlap(top, bottom) <= 0) return false
  const requiredY = itemBottom(top) + gap
  if (bottom.y >= requiredY) return false
  const maxBottom = boundsInnerBottom(bounds)
  const bottomEdge = itemBottom(bottom)
  const minH = Math.max(MIN_ITEM_SIZE, bottom.minH ?? MIN_ITEM_SIZE)
  bottom.y = requiredY
  bottom.h = Math.max(minH, Math.min(bottom.h, bottomEdge - bottom.y, maxBottom - bottom.y))
  return true
}

/**
 * Push and trim items so that no two neighbors sit closer than `gap`. Items
 * are processed left-to-right, then top-to-bottom, and clamped to bounds.
 */
export function enforceMinimumGaps<T>(
  items: readonly GridItem<T>[],
  bounds: GridBounds,
  gap: number,
): GridItem<T>[] {
  const requiredGap = Math.max(0, gap)
  const next = items.map((item) => clampItem(item, bounds))
  if (requiredGap <= 0 || next.length < 2) return next

  for (const left of [...next].sort((a, b) => a.x - b.x)) {
    for (const right of next) {
      if (left.id === right.id || right.x < left.x) continue
      enforceHorizontalMinimumGap(left, right, bounds, requiredGap)
    }
  }
  for (const top of [...next].sort((a, b) => a.y - b.y)) {
    for (const bottom of next) {
      if (top.id === bottom.id || bottom.y < top.y) continue
      enforceVerticalMinimumGap(top, bottom, bounds, requiredGap)
    }
  }
  return next.map((item) => clampItem(item, bounds))
}

/** Smallest positive distance between any two neighboring items, or 0. */
export function inferGap(items: readonly GridRect[]): number {
  const gaps: number[] = []
  for (const item of items) {
    for (const other of items) {
      if (item === other) continue
      const vOverlap = item.y < other.y + other.h && item.y + item.h > other.y
      const hOverlap = item.x < other.x + other.w && item.x + item.w > other.x
      if (vOverlap && other.x >= item.x + item.w) gaps.push(other.x - (item.x + item.w))
      if (hOverlap && other.y >= item.y + item.h) gaps.push(other.y - (item.y + item.h))
    }
  }
  const positive = gaps.filter((gap) => gap > 0)
  return positive.length > 0 ? Math.round(Math.min(...positive)) : 0
}
