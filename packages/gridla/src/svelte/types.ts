import type { Snippet } from 'svelte'
import type { HTMLAttributes } from 'svelte/elements'

import type { GridItem, GridLayout, GridRect, GridResizeEdge, SolveOptions } from 'gridla'
import type {
  GridChangeDetail,
  GridInteraction,
  GridPointerGestureOptions,
} from 'gridla/interaction'

/**
 * Props for `GridProvider`: every `SolveOptions` field, a controlled or
 * uncontrolled layout, change and transfer callbacks, and the controller
 * settings. `layout` is bindable (`bind:layout`).
 */
export type GridProviderProps<TData = unknown> = SolveOptions & {
  /**
   * Stable id of this provider, unique within a `GridTransferScope`. Generated
   * when omitted.
   */
  id?: string
  /**
   * Controlled layout. Bind it (`bind:layout`) to receive every accepted
   * change, or pair it with `onLayoutChange` and pass the next layout back.
   */
  layout?: GridLayout<TData>
  /** Initial layout for uncontrolled use. */
  defaultLayout?: GridLayout<TData>
  /**
   * Called with the next layout after every accepted change. The layout is
   * expressed in the canvas size it was rendered at.
   */
  onLayoutChange?: (layout: GridLayout<TData>, detail: GridChangeDetail) => void
  /** Fires with the solver strategy on every accepted interactive commit. */
  onCommit?: (detail: GridChangeDetail) => void
  /** Called when an item moves to another canvas inside a `GridTransferScope`. */
  onTransferOut?: (itemId: string, targetId: string) => void
  /** Called when an item arrives from another canvas. */
  onTransferIn?: (item: GridItem<TData>, sourceId: string) => void
  /** Whether items from other canvases may be dropped here. Default `true`. */
  acceptTransfers?: boolean | ((item: GridItem<TData>, sourceId: string) => boolean)
  /** Project the layout onto the measured canvas size. Default `true`. */
  responsive?: boolean
  /** Minimum pointer travel before a press becomes a drag. Default `4`. */
  dragThreshold?: number
  /** Pixels moved per arrow key press. Default `8`; Shift multiplies by 4. */
  keyboardStep?: number
  /** Controlled selection. */
  selectedId?: string | null
  onSelectedIdChange?: (itemId: string | null) => void
  children?: Snippet
}

/**
 * Props for `GridCanvas`: `div` attributes plus the pointer gesture options
 * (`onItemClick`, `onDeleteKey`, `enabled`).
 */
export type GridCanvasProps = HTMLAttributes<HTMLDivElement> &
  GridPointerGestureOptions & {
    children?: Snippet
  }

/**
 * Everything needed to paint one item: its current and pre-gesture rectangles
 * plus its active, selected, shifted, and transferring flags. Returned by
 * `gridItemView` and passed to the `GridItem` children snippet.
 */
export type GridItemView = {
  /** Where the item is painted right now (preview-aware). */
  rect: GridRect
  /** Where the item was before the current gesture. */
  baseRect: GridRect
  /** Cursor-tracked rect while this item is active; `null` otherwise. */
  activeRect: GridRect | null
  isActive: boolean
  isSelected: boolean
  /** True when this item moved in the preview because another item pushed it. */
  isShifted: boolean
  /** True while the active item is being previewed in another canvas. */
  isTransferring: boolean
  interaction: GridInteraction | null
}

/**
 * Passed to the `GridItem` children snippet: the item's `GridItemView` plus
 * attribute objects for drag and resize handles.
 */
export type GridItemRenderProps = GridItemView & {
  /** Spread on the element that starts a move. */
  dragHandleProps: { 'data-gridla-drag-handle': string }
  /** Attributes for a resize handle on the given edge. */
  getResizeHandleProps: (edge: GridResizeEdge) => {
    'data-gridla-resize-handle': string
    'data-gridla-edge': GridResizeEdge
  }
}

/**
 * Props for `GridItem`. `id` selects the item; the rest control drag surfaces,
 * built-in resize handles, and how the element is positioned.
 */
export type GridItemProps = Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'id'> & {
  /** Id of the item in the layout. */
  id: string
  /**
   * `true` (default): the whole element is a drag surface. `false`: only
   * elements with `dragHandleProps` start a move.
   */
  draggable?: boolean
  /** Edges to render built-in resize handles for. Default: none. */
  resizeEdges?: readonly GridResizeEdge[]
  /** Class for built-in resize handles. */
  resizeHandleClass?: string
  /**
   * Position the element with `transform` (default) or with `left`/`top`.
   * Transform keeps layout work off the main thread during gestures.
   */
  positioning?: 'transform' | 'absolute'
  /** Render the cursor-tracked rect while dragging instead of the solved preview. Default `true`. */
  followPointer?: boolean
  /** Item content. Receives the item view plus handle attribute objects. */
  children?: Snippet<[GridItemRenderProps]>
}

/**
 * Props for `GridPreviewOutline`: `div` attributes plus the positioning mode
 * (`transform` by default).
 */
export type GridPreviewOutlineProps = HTMLAttributes<HTMLDivElement> & {
  positioning?: 'transform' | 'absolute'
}

/** Props for `GridTransferScope`: the providers it spans. */
export type GridTransferScopeProps = {
  children?: Snippet
}
