import type { GridItem, GridLayout, SolveOptions } from 'gridla'
import type { GridChangeDetail } from 'gridla/interaction'

export type {
  GridActions,
  GridChangeDetail,
  GridChangeReason,
  GridControllerConfig,
  GridInteraction,
  GridInteractionMode,
  GridPreview,
  GridState,
} from 'gridla/interaction'

/**
 * Payload of the provider's `layoutChangeDetail` output: the next layout plus
 * the `GridChangeDetail` that produced it (reason, item id, solver strategy).
 * The `layoutChange` output carries the layout alone so `[(layout)]` works.
 */
export type GridLayoutChangeEvent<TData = unknown> = {
  /** The next layout, expressed in the canvas size it was rendered at. */
  layout: GridLayout<TData>
  /** Why the layout changed. */
  change: GridChangeDetail
}

/** Payload of the provider's `transferIn` output: an item arrived from another canvas. */
export type GridTransferInEvent<TData = unknown> = {
  /** The item as placed in this canvas. */
  item: GridItem<TData>
  /** Id of the canvas the item came from. */
  sourceId: string
}

/** Payload of the provider's `transferOut` output: an item left for another canvas. */
export type GridTransferOutEvent = {
  /** Id of the item that left. */
  itemId: string
  /** Id of the canvas that received it. */
  targetId: string
}

/**
 * Application-wide defaults registered with `provideGridla`. Every field is
 * optional; a provider's own inputs take precedence.
 */
export type GridlaOptions = SolveOptions & {
  /** Project layouts onto the measured canvas size. Default `true`. */
  responsive?: boolean
  /** Minimum pointer travel before a press becomes a drag. Default `4`. */
  dragThreshold?: number
  /** Pixels moved per arrow key press. Default `8`. */
  keyboardStep?: number
}
