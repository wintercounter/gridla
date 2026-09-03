import { normalizeCanvas } from '../geometry'
import type { GridCanvas, GridLayout } from '../model'
import { projectItemsByChain } from './chain'
import { projectLayoutBySegments } from './segments'

export type ProjectionStrategy = 'chain' | 'segments'

export type ProjectOptions = {
  /**
   * `chain` (default): rows and columns of items are treated as flex chains.
   * Fixed-size items and configured gaps keep their pixel size, empty space
   * scales, free items fill the remainder proportionally.
   *
   * `segments`: every item edge becomes a stop; segments covered by free items
   * scale, everything else stays fixed. Simpler and useful for sparse layouts.
   */
  strategy?: ProjectionStrategy
  /** Gap between items that the chain strategy keeps at exactly this pixel size. */
  gap?: number
}

/**
 * Project a layout onto a different canvas size. The result is a new layout
 * whose items keep their relationships (rows, columns, alignment, fixed sizes)
 * while filling the target canvas.
 */
export function projectLayout<T>(
  layout: GridLayout<T>,
  targetCanvas: Partial<GridCanvas>,
  options: ProjectOptions = {},
): GridLayout<T> {
  if (options.strategy === 'segments') {
    return projectLayoutBySegments(layout, targetCanvas)
  }
  const sourceCanvas = normalizeCanvas(layout.canvas)
  const nextCanvas = normalizeCanvas(targetCanvas, sourceCanvas)
  return {
    canvas: nextCanvas,
    items: projectItemsByChain(layout.items, sourceCanvas, nextCanvas, options.gap ?? 0),
  }
}

export { applyGap, type ApplyGapOptions } from './segments'
export {
  preserveGaps,
  projectFloatingRect,
  projectItemsByChain,
  roundItemRects,
  scaleItems,
  syncFixedDimensions,
} from './chain'
export { projectItemsBySegments } from './segments'
