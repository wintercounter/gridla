import type {
  GridItem,
  NewGridItem,
  GridLayout,
  GridPoint,
  GridRect,
  GridResizeEdge,
  GridSize,
  SolveOptions,
  SolveStrategy,
} from '../core'

export type GridInteractionMode = 'move' | 'resize'

/** The gesture currently in progress. */
export type GridInteraction = {
  itemId: string
  mode: GridInteractionMode
  edge?: GridResizeEdge
  pointerId: number | null
  /** Where the pointer grabbed the item, relative to its top-left. */
  grabOffset: GridPoint
  /** Item rect at gesture start, in rendered canvas pixels. */
  origin: GridRect
  /** Pointer position at gesture start, in rendered canvas pixels. */
  start: GridPoint
}

/** The solver's latest answer for the gesture in progress. */
export type GridPreview<TData = unknown> = {
  layout: GridLayout<TData>
  item: GridItem<TData>
  strategy: SolveStrategy
  shiftedSiblings: boolean
  accepted: boolean
}

export type GridState<TData = unknown> = {
  /** The layout the provider was given (or owns). */
  source: GridLayout<TData>
  /** Measured canvas element size, or `null` until measured. */
  size: GridSize | null
  /** `source` projected onto `size`. Interactions operate on this layout. */
  layout: GridLayout<TData>
  interaction: GridInteraction | null
  /** Rect that tracks the pointer during a gesture, in rendered pixels. */
  activeRect: GridRect | null
  preview: GridPreview<TData> | null
  selectedId: string | null
  /** True while the active item is being previewed in another canvas. */
  transferring: boolean
}

export type GridChangeReason =
  | 'move'
  | 'resize'
  | 'place'
  | 'remove'
  | 'update'
  | 'transfer'
  | 'set'

export type GridChangeDetail = {
  reason: GridChangeReason
  itemId?: string
  strategy?: SolveStrategy
}

export type GridProviderConfig = SolveOptions & {
  /**
   * Project the layout onto the measured canvas size. When `false`, the
   * canvas element is sized to the layout instead. Default `true`.
   */
  responsive: boolean
  /** Minimum pointer travel before a press becomes a drag. Default `4`. */
  dragThreshold: number
  /** Pixels moved per arrow key press. Default `8`; Shift multiplies by 4. */
  keyboardStep: number
}

export type GridActions<TData = unknown> = {
  /** Replace the whole layout. */
  setLayout: (layout: GridLayout<TData>) => void
  /** Move an item programmatically. Returns whether the solver accepted it. */
  move: (itemId: string, position: GridPoint, options?: SolveOptions) => boolean
  /** Resize an item programmatically. */
  resize: (
    itemId: string,
    change: { edge: GridResizeEdge; delta: GridPoint } | { rect: Partial<GridRect> },
    options?: SolveOptions,
  ) => boolean
  /** Insert an item at a position or centered on a pointer. */
  place: (
    item: NewGridItem<TData>,
    at: { position: GridPoint } | { pointer: GridPoint },
    options?: SolveOptions,
  ) => boolean
  remove: (itemId: string) => void
  /** Patch an item's fields (constraints, policy, data). Geometry is re-clamped. */
  update: (itemId: string, patch: Partial<GridItem<TData>>) => void
  select: (itemId: string | null) => void
  /** Cancel the gesture in progress without committing. */
  cancel: () => void
}
