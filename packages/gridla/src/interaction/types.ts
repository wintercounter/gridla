import type {
  GridItem,
  GridLayout,
  GridPoint,
  GridRect,
  GridResizeEdge,
  GridSize,
  NewGridItem,
  SolveOptions,
  SolveStrategy,
} from '../core'

/** Kind of gesture: dragging an item or resizing it. */
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

/**
 * Controller state held in the store. `layout` is what interactions operate on;
 * `source` is what the caller owns.
 */
export type GridState<TData = unknown> = {
  /** The layout the controller was given (or owns). */
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

/** Why the layout changed, as reported in `GridChangeDetail`. */
export type GridChangeReason =
  | 'move'
  | 'resize'
  | 'place'
  | 'remove'
  | 'update'
  | 'transfer'
  | 'set'

/**
 * Describes an accepted change: the reason, the affected item when there is one,
 * and the solver strategy for solved operations.
 */
export type GridChangeDetail = {
  reason: GridChangeReason
  itemId?: string
  strategy?: SolveStrategy
}

/**
 * Resolved controller configuration: every `SolveOptions` field plus the
 * responsive, drag-threshold, and keyboard-step settings with defaults applied.
 */
export type GridControllerConfig = SolveOptions & {
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

/**
 * Imperative layout and selection API exposed by the controller. The object is
 * stable for the controller's lifetime.
 */
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
  /**
   * Preview a new item (for example one dragged from a palette) centered on a
   * pointer position in canvas pixels. Returns the preview, or `null` when it
   * cannot be placed. Follow up with `commitIncoming` or `clearIncoming`.
   */
  previewIncoming: (item: GridItem<TData>, pointer: GridPoint) => GridPreview<TData> | null
  /** Commit the incoming preview into the layout. Returns whether one was committed. */
  commitIncoming: () => boolean
  /** Drop the incoming preview without committing. */
  clearIncoming: () => void
}

/**
 * Low-level gesture control over one canvas. Pointer coordinates are in
 * rendered canvas pixels (relative to the canvas element). `createPointerGesture`
 * drives this API from DOM events; adapters with their own input handling can
 * call it directly.
 */
export type GridGestureApi<TData = unknown> = {
  /** Start dragging `itemId`. Returns `false` when the item is not in the layout. */
  beginMove: (itemId: string, pointer: GridPoint, pointerId: number | null) => boolean
  /** Start resizing `itemId` from `edge`. Returns `false` when the item is not in the layout. */
  beginResize: (
    itemId: string,
    edge: GridResizeEdge,
    pointer: GridPoint,
    pointerId: number | null,
  ) => boolean
  /** Track the pointer during a move; `snap: false` bypasses alignment snapping. */
  updateMove: (pointer: GridPoint, modifiers: { snap: boolean }) => void
  /** Track the pointer during a resize. */
  updateResize: (pointer: GridPoint, modifiers: { snap: boolean }) => void
  /** Show the active item leaving this canvas (during a transfer). */
  setTransferring: (transferring: boolean) => void
  /** Commit the preview of the gesture in progress and end it. */
  commit: () => void
  /** End the gesture in progress without committing. */
  cancel: () => void
  /** Preview a foreign item dropped at `pointer` (rendered coordinates). */
  previewIncoming: (item: GridItem<TData>, pointer: GridPoint) => GridPreview<TData> | null
  /** Drop the incoming preview without committing. */
  clearIncoming: () => void
  /** Commit the current incoming preview. Returns the accepted layout or `null`. */
  commitIncoming: () => GridLayout<TData> | null
  /** Remove an item because it was transferred to another canvas. */
  completeOutgoing: (itemId: string) => void
  /** The canvas element, when mounted. */
  getElement: () => HTMLElement | null
  /** Register the canvas element (used for pointer capture and transfer hit-testing). */
  setElement: (element: HTMLElement | null) => void
}
