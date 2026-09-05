import type { GridControllerConfig } from '../interaction/types'

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
