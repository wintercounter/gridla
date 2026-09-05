/**
 * Data attributes the pointer gesture looks for on pointer down. Adapters emit
 * them on their elements: `item` carries the item id, `dragHandle` marks a
 * surface that starts a move, `resizeHandle` plus `edge` mark a resize handle.
 */
export const GRID_DATA = {
  item: 'data-gridla-item',
  dragHandle: 'data-gridla-drag-handle',
  resizeHandle: 'data-gridla-resize-handle',
  edge: 'data-gridla-edge',
} as const
