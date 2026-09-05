import type { GridRect } from '../core'
import type { GridControllerConfig, GridInteraction } from '../interaction/types'

export type {
  GridActions,
  GridChangeDetail,
  GridChangeReason,
  GridInteraction,
  GridInteractionMode,
  GridPreview,
  GridState,
} from '../interaction/types'

/**
 * Resolved provider configuration: every `SolveOptions` field plus the
 * responsive, drag-threshold, and keyboard-step settings with defaults applied.
 * Same shape as `GridControllerConfig` from `gridla/interaction`.
 */
export type GridProviderConfig = GridControllerConfig

/**
 * Everything needed to paint one item: its current and pre-gesture rectangles
 * plus its active, selected, shifted, and transferring flags. Returned by
 * `useGridItemView` and passed to the `GridItem` default slot.
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
