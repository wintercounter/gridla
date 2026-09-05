import {
  computed,
  defineComponent,
  h,
  onBeforeUnmount,
  onMounted,
  shallowRef,
  watch,
  type PropType,
  type SlotsType,
  type StyleValue,
  type VNode,
} from 'vue'

import type { GridRect, GridResizeEdge } from '../core'
import { GRID_DATA } from '../interaction/attributes'
import { createPointerGesture } from '../interaction/gesture'
import { observeSize } from '../interaction/measure'
import { useGridItemView, useGridStore } from './composables'
import { useGridContext, useTransferScope } from './context'
import type { GridItemView } from './types'

type Positioning = 'transform' | 'absolute'

// ---------------------------------------------------------------------------
// GridCanvas
// ---------------------------------------------------------------------------

/**
 * Props of `GridCanvas`. Any other attribute (`class`, `style`, `tabindex`,
 * listeners) falls through to the rendered `div`.
 */
export type GridCanvasProps = {
  /** Set `false` to disable pointer-driven gestures. Default `true`. */
  enabled?: boolean
}

/**
 * Events emitted by `GridCanvas`: `itemClick` for a press that did not turn
 * into a drag, `deleteKey` when Delete or Backspace is pressed with an item
 * selected.
 */
export type GridCanvasEmits = {
  itemClick: (itemId: string) => void
  deleteKey: (itemId: string) => void
}

/**
 * The element items are positioned in. Measures itself, feeds the size to the
 * provider, and wires pointer and keyboard handling through
 * `createPointerGesture`. Renders a `div` with `position: relative`; give it a
 * height (or let it follow the layout with `:responsive="false"`).
 */
export const GridCanvas = defineComponent({
  name: 'GridCanvas',
  props: {
    enabled: { type: Boolean, default: true },
  },
  emits: {
    itemClick: (_itemId: string) => true,
    deleteKey: (_itemId: string) => true,
  },
  slots: Object as SlotsType<{ default?: () => VNode[] }>,
  setup(props, { emit, slots, attrs }) {
    const { controller, gesture, config } = useGridContext()
    const scope = useTransferScope()
    const element = shallowRef<HTMLElement | null>(null)

    const pointer = createPointerGesture(controller, { scope })
    watch(
      () => props.enabled,
      (enabled) => {
        pointer.setOptions({
          enabled,
          onItemClick: (itemId) => emit('itemClick', itemId),
          onDeleteKey: (itemId) => emit('deleteKey', itemId),
        })
      },
      { immediate: true },
    )

    let stopMeasuring: (() => void) | null = null
    const measure = () => {
      stopMeasuring?.()
      stopMeasuring = null
      const target = element.value
      if (!target || !config.value.responsive) return
      stopMeasuring = observeSize(target, (size) => controller.setSize(size))
    }
    onMounted(() => {
      gesture.setElement(element.value)
      measure()
    })
    watch(() => config.value.responsive, measure)
    onBeforeUnmount(() => {
      stopMeasuring?.()
      stopMeasuring = null
      pointer.destroy()
      gesture.setElement(null)
    })

    const canvas = useGridStore((state) => state.layout.canvas)
    const dragging = useGridStore((state) => state.interaction !== null)

    const style = computed<StyleValue>(() => {
      const { responsive } = config.value
      const box = canvas.value
      return {
        position: 'relative',
        boxSizing: 'border-box',
        touchAction: 'none',
        userSelect: dragging.value ? 'none' : undefined,
        ...(responsive
          ? box.heightMode === 'scrollable'
            ? { minHeight: `${box.height}px` }
            : {}
          : { width: `${box.width}px`, height: `${box.height}px` }),
      }
    })

    return () =>
      h(
        'div',
        {
          ref: element,
          'data-gridla-canvas': '',
          'data-gridla-active': dragging.value ? '' : undefined,
          tabindex: attrs.tabindex ?? 0,
          style: style.value,
          onPointerdown: pointer.pointerDown,
          onPointermove: pointer.pointerMove,
          onPointerup: pointer.pointerUp,
          onPointercancel: pointer.pointerCancel,
          onKeydown: pointer.keyDown,
        },
        slots.default?.(),
      )
  },
})

// ---------------------------------------------------------------------------
// GridItem
// ---------------------------------------------------------------------------

/**
 * Passed to the `GridItem` default slot: the item's `GridItemView` plus
 * attribute objects for drag and resize handles (spread them with `v-bind`).
 */
export type GridItemSlotProps = GridItemView & {
  /** Bind on the element that starts a move. */
  dragHandleProps: { [GRID_DATA.dragHandle]: string }
  /** Attributes for a resize handle on the given edge. */
  getResizeHandleProps: (edge: GridResizeEdge) => {
    [GRID_DATA.resizeHandle]: string
    [GRID_DATA.edge]: GridResizeEdge
  }
}

/**
 * Props of `GridItem`. `id` selects the item; the rest control drag surfaces,
 * built-in resize handles, and how the element is positioned. Other
 * attributes fall through to the rendered `div`.
 */
export type GridItemProps = {
  /** Id of the item in the layout. */
  id: string
  /**
   * `true` (default): the whole element is a drag surface. `false`: only
   * elements bound with `dragHandleProps` start a move.
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
  positioning?: Positioning
  /** Render the cursor-tracked rect while dragging instead of the solved preview. Default `true`. */
  followPointer?: boolean
}

const EDGE_CURSORS: Record<GridResizeEdge, string> = {
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  nw: 'nwse-resize',
  se: 'nwse-resize',
}

function resizeHandleStyle(edge: GridResizeEdge, size = 10): Record<string, string> {
  // Handles sit fully inside the item so they stay hit-testable when the
  // item clips its overflow.
  const px = `${size}px`
  const base: Record<string, string> = {
    position: 'absolute',
    cursor: EDGE_CURSORS[edge],
    touchAction: 'none',
  }
  const vertical = edge === 'n' || edge === 's'
  const horizontal = edge === 'e' || edge === 'w'
  if (vertical) {
    return { ...base, left: px, right: px, height: px, [edge === 'n' ? 'top' : 'bottom']: '0' }
  }
  if (horizontal) {
    return { ...base, top: px, bottom: px, width: px, [edge === 'w' ? 'left' : 'right']: '0' }
  }
  return {
    ...base,
    width: px,
    height: px,
    [edge.includes('n') ? 'top' : 'bottom']: '0',
    [edge.includes('w') ? 'left' : 'right']: '0',
  }
}

function rectStyle(rect: GridRect, positioning: Positioning): Record<string, string> {
  if (positioning === 'absolute') {
    return {
      position: 'absolute',
      left: `${rect.x}px`,
      top: `${rect.y}px`,
      width: `${rect.w}px`,
      height: `${rect.h}px`,
    }
  }
  return {
    position: 'absolute',
    left: '0',
    top: '0',
    width: `${rect.w}px`,
    height: `${rect.h}px`,
    transform: `translate(${rect.x}px, ${rect.y}px)`,
  }
}

/**
 * Positions one item inside `GridCanvas`. Headless: it renders a `div` with
 * geometry styles and data attributes and leaves appearance to you. The
 * default slot receives `GridItemSlotProps`.
 */
export const GridItem = defineComponent({
  name: 'GridItem',
  props: {
    id: { type: String, required: true },
    draggable: { type: Boolean, default: true },
    resizeEdges: { type: Array as PropType<readonly GridResizeEdge[]>, default: undefined },
    resizeHandleClass: { type: String, default: undefined },
    positioning: { type: String as PropType<Positioning>, default: 'transform' },
    followPointer: { type: Boolean, default: true },
  },
  slots: Object as SlotsType<{ default?: (props: GridItemSlotProps) => VNode[] }>,
  setup(props, { slots }) {
    const view = useGridItemView(() => props.id)
    const dragHandleProps = computed(
      () => ({ [GRID_DATA.dragHandle]: props.id }) as { [GRID_DATA.dragHandle]: string },
    )
    const getResizeHandleProps = (edge: GridResizeEdge) =>
      ({ [GRID_DATA.resizeHandle]: props.id, [GRID_DATA.edge]: edge }) as {
        [GRID_DATA.resizeHandle]: string
        [GRID_DATA.edge]: GridResizeEdge
      }

    return () => {
      const current = view.value
      const shownRect =
        current.isActive &&
        props.followPointer &&
        current.activeRect &&
        current.interaction?.mode === 'move'
          ? current.activeRect
          : current.rect
      const style: Record<string, string | number> = {
        boxSizing: 'border-box',
        ...rectStyle(shownRect, props.positioning),
        ...(current.isActive ? { zIndex: 2 } : {}),
        ...(current.isTransferring ? { opacity: 0.4 } : {}),
      }
      const slotProps: GridItemSlotProps = {
        ...current,
        dragHandleProps: dragHandleProps.value,
        getResizeHandleProps,
      }
      return h(
        'div',
        {
          ...(props.draggable ? dragHandleProps.value : {}),
          [GRID_DATA.item]: props.id,
          'data-gridla-active': current.isActive ? '' : undefined,
          'data-gridla-selected': current.isSelected ? '' : undefined,
          'data-gridla-shifted': current.isShifted ? '' : undefined,
          'data-gridla-transferring': current.isTransferring ? '' : undefined,
          style,
        },
        [
          ...(slots.default?.(slotProps) ?? []),
          ...(props.resizeEdges ?? []).map((edge) =>
            h('div', {
              key: edge,
              class: props.resizeHandleClass,
              ...getResizeHandleProps(edge),
              style: resizeHandleStyle(edge),
            }),
          ),
        ],
      )
    }
  },
})

// ---------------------------------------------------------------------------
// GridPreviewOutline
// ---------------------------------------------------------------------------

/**
 * Props of `GridPreviewOutline`: the positioning mode (`transform` by
 * default). Other attributes fall through to the rendered `div`.
 */
export type GridPreviewOutlineProps = {
  positioning?: Positioning
}

/**
 * Renders a box where the active item will land when released. Renders
 * nothing when no gesture is in progress.
 */
export const GridPreviewOutline = defineComponent({
  name: 'GridPreviewOutline',
  props: {
    positioning: { type: String as PropType<Positioning>, default: 'transform' },
  },
  setup(props) {
    const rect = useGridStore((state) => {
      if (!state.preview || !state.preview.accepted) return null
      const item = state.preview.item
      return { x: item.x, y: item.y, w: item.w, h: item.h }
    }, rectsEqual)
    return () => {
      const current = rect.value
      if (!current) return null
      return h('div', {
        'data-gridla-preview': '',
        style: {
          pointerEvents: 'none',
          boxSizing: 'border-box',
          ...rectStyle(current, props.positioning),
        },
      })
    }
  },
})

function rectsEqual(a: GridRect | null, b: GridRect | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h
}
