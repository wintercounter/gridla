/**
 * gridla/svelte — Svelte 5 adapter. A provider that wraps the controller
 * store in runes, headless components, and rune-style readers on top of
 * `gridla/interaction`.
 */
export { default as GridProvider } from './GridProvider.svelte'
export { default as GridCanvas } from './GridCanvas.svelte'
export { default as GridItem } from './GridItem.svelte'
export { default as GridPreviewOutline } from './GridPreviewOutline.svelte'
export { default as GridTransferScope } from './GridTransferScope.svelte'
export {
  createGridRunes,
  getGridContext,
  getTransferScopeContext,
  gridActions,
  gridItemView,
  gridLayout,
  gridSelection,
  gridStore,
  setGridContext,
  setTransferScopeContext,
  type GridRead,
  type GridRunes,
} from './context.svelte.js'
export { itemViewsEqual, rectStyle, rectsEqual, resizeHandleStyle, selectItemView } from './view.js'
export {
  type GridCanvasProps,
  type GridItemProps,
  type GridItemRenderProps,
  type GridItemView,
  type GridPreviewOutlineProps,
  type GridProviderProps,
  type GridTransferScopeProps,
} from './types.js'
export {
  GRID_DATA,
  type GridActions,
  type GridChangeDetail,
  type GridChangeReason,
  type GridControllerConfig,
  type GridInteraction,
  type GridInteractionMode,
  type GridPreview,
  type GridState,
} from 'gridla/interaction'
