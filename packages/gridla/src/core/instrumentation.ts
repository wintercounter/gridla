/**
 * Optional instrumentation. Solvers report which strategy produced a result so
 * consumers can build debug overlays or log interaction paths without the core
 * owning a logger.
 */

/** Names of the strategies a solver may report. */
export type SolveStrategy =
  | 'origin'
  | 'push-x'
  | 'push-y'
  | 'push-down'
  | 'push-shrink-x'
  | 'push-shrink-y'
  | 'swap'
  | 'group-swap'
  | 'reorder-row'
  | 'reorder-column'
  | 'insert-row'
  | 'insert-column'
  | 'shrink-neighbor'
  | 'snap'
  | 'fit-open-slot'
  | 'free'
  | 'fallback-snap'
  | 'resize'
  | 'resize-shrink-neighbors'
  | 'open'
  | 'adjacent'
  | 'stack-below'
  | 'trim-neighbor'
  | 'nearest-open-slot'
  | 'pointer'
  | 'pointer-slide'
  | 'pointer-push'
  | 'pointer-scaled'
  | 'pointer-shrink-siblings'
  | 'pointer-overlap'
  | 'rejected'

/**
 * One record per solve: the operation, the strategy that produced the result,
 * whether it was accepted, and the active item's resulting rectangle in canvas
 * coordinates.
 */
export type TraceEvent = {
  operation: 'move' | 'resize' | 'place' | 'transfer'
  strategy: SolveStrategy
  itemId: string
  accepted: boolean
  x?: number
  y?: number
  w?: number
  h?: number
}

/** Receives a `TraceEvent` for every solve. Pass it as `SolveOptions.onTrace`. */
export type TraceCallback = (event: TraceEvent) => void
