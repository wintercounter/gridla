/**
 * Public data model. Every type here is a plain, serializable object. The core
 * never reads or writes anything else.
 */

/** Per-side inset in pixels. */
export type GridPadding = {
  top: number
  right: number
  bottom: number
  left: number
}

/**
 * How the canvas treats its vertical extent.
 *
 * - `bounded`: items must fit inside `height`.
 * - `scrollable`: items may extend below `height`; the canvas grows to fit.
 */
export type GridHeightMode = 'bounded' | 'scrollable'

/** The rectangle items are laid out in. Items use canvas-relative pixel coordinates. */
export type GridCanvas = {
  width: number
  height: number
  padding: GridPadding
  heightMode: GridHeightMode
}

/**
 * Which axes keep their pixel size when the layout is projected to another
 * canvas size.
 *
 * - `free` (default): both axes scale.
 * - `fixed-w`: width stays constant, height scales.
 * - `fixed-h`: height stays constant, width scales.
 * - `fixed`: neither axis scales.
 */
export type GridSizeMode = 'free' | 'fixed-w' | 'fixed-h' | 'fixed'

/** Solver participation policy for one item. */
export type GridItemPolicy = {
  /**
   * `solid` (default): the item occupies space and blocks other items.
   * `ignore`: the item is a ghost. Solvers move, resize and place other items
   * straight through it. Useful for reserved slots and floating items.
   */
  collision?: 'solid' | 'ignore'
  /**
   * `movable` (default): the solver may push, swap, shrink or reorder the item
   * to make room for another item.
   * `locked`: the item is a wall. It still blocks, but never moves or resizes
   * as a side effect of another item's operation.
   */
  movement?: 'movable' | 'locked'
}

/** A positioned rectangle. */
export type GridRect = {
  x: number
  y: number
  w: number
  h: number
}

/** Size constraints an item may carry. */
export type GridItemConstraints = {
  minW?: number
  minH?: number
  maxW?: number
  maxH?: number
  sizeMode?: GridSizeMode
  /** Pixel width to pin when `sizeMode` fixes the width. Falls back to `w`. */
  fixedWidth?: number
  /** Pixel height to pin when `sizeMode` fixes the height. Falls back to `h`. */
  fixedHeight?: number
}

/** A laid-out item. `data` is caller-owned and passes through untouched. */
export type GridItem<TData = unknown> = GridRect &
  GridItemConstraints & {
    id: string
    policy?: GridItemPolicy
    data?: TData
  }

/** Size information used when creating or placing an item. */
export type GridItemSize = Pick<GridItem, 'w' | 'h'> & GridItemConstraints

/** A canvas and the items positioned inside it. */
export type GridLayout<TData = unknown> = {
  canvas: GridCanvas
  items: GridItem<TData>[]
}

export type GridPoint = { x: number; y: number }

export type GridSize = { w: number; h: number }

/** Edge-based rectangle used for hit testing and viewport math. */
export type GridEdges = {
  top: number
  right: number
  bottom: number
  left: number
}

/** Compass edge or corner used to resize an item. */
export type GridResizeEdge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

export type GridAxis = 'x' | 'y'

/**
 * Bounds a solver operates against. Derived from a canvas; `height` is `null`
 * for scrollable canvases.
 */
export type GridBounds = {
  width: number
  height: number | null
  padding: GridPadding
}

export const EMPTY_PADDING: Readonly<GridPadding> = Object.freeze({
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
})

export const DEFAULT_CANVAS: Readonly<GridCanvas> = Object.freeze({
  width: 1200,
  height: 720,
  padding: EMPTY_PADDING,
  heightMode: 'bounded',
})

/** Default distance in pixels within which edges attract each other. */
export const DEFAULT_SNAP_DISTANCE = 24

/** Smallest width or height an item may have. */
export const MIN_ITEM_SIZE = 1

export function isGhost(item: Pick<GridItem, 'policy'>): boolean {
  return item.policy?.collision === 'ignore'
}

export function isLocked(item: Pick<GridItem, 'policy'>): boolean {
  return item.policy?.movement === 'locked'
}

export function isFixedWidth(item: Pick<GridItem, 'sizeMode'>): boolean {
  return item.sizeMode === 'fixed-w' || item.sizeMode === 'fixed'
}

export function isFixedHeight(item: Pick<GridItem, 'sizeMode'>): boolean {
  return item.sizeMode === 'fixed-h' || item.sizeMode === 'fixed'
}

export function isFixedOnAxis(item: Pick<GridItem, 'sizeMode'>, axis: GridAxis): boolean {
  return axis === 'x' ? isFixedWidth(item) : isFixedHeight(item)
}
