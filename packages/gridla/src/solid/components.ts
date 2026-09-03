import {
  createMemo,
  createRenderEffect,
  mergeProps,
  onCleanup,
  onMount,
  splitProps,
  type Accessor,
  type JSX,
} from 'solid-js'

import type { GridRect, GridResizeEdge } from '../core'
import { GRID_DATA } from '../interaction/attributes'
import { createPointerGesture, type GridPointerGestureOptions } from '../interaction/gesture'
import { observeSize } from '../interaction/measure'
import { useGridContext, useTransferScope } from './context'
import { createElement } from './element'
import { useGridItemView, useGridStore, type GridItemView } from './hooks'

/** Element positioning mode: `transform` (default) or absolute `left`/`top`. */
export type GridPositioning = 'transform' | 'absolute'

type DivAttributes = Omit<JSX.HTMLAttributes<HTMLDivElement>, 'style' | 'ref' | 'children'>

type Ref<T> = T | ((element: T) => void) | undefined

function applyRef<T>(ref: Ref<T>, element: T) {
  if (typeof ref === 'function') (ref as (element: T) => void)(element)
}

const px = (value: number) => `${value}px`

// ---------------------------------------------------------------------------
// GridCanvas
// ---------------------------------------------------------------------------

/**
 * Props for `GridCanvas`: `div` attributes (except `onKeyDown`, which the canvas
 * owns) plus the pointer gesture options `onItemClick`, `onDeleteKey`, `enabled`.
 */
export type GridCanvasProps = Omit<DivAttributes, 'onKeyDown'> &
  GridPointerGestureOptions & {
    /** Inline styles merged over the positioning styles the canvas sets. */
    style?: JSX.CSSProperties
    ref?: Ref<HTMLDivElement>
    children?: JSX.Element
  }

/**
 * The element items are positioned in. Measures itself on mount, feeds the
 * size to the provider, and binds pointer and keyboard handling. Renders a
 * `div` with `position: relative`; give it a height (or let it follow the
 * layout with `responsive={false}`). Server rendering emits the authored
 * layout; measurement and input start in `onMount`.
 */
export function GridCanvas(props: GridCanvasProps): JSX.Element {
  const [local, rest] = splitProps(props, [
    'children',
    'style',
    'ref',
    'tabIndex',
    'onItemClick',
    'onDeleteKey',
    'enabled',
  ])
  const context = useGridContext()
  const scope = useTransferScope()
  const canvas = useGridStore((state) => state.layout.canvas)
  const dragging = useGridStore((state) => state.interaction !== null)

  const style = (): JSX.CSSProperties => {
    const config = context.config()
    const rendered = canvas()
    return {
      position: 'relative',
      'box-sizing': 'border-box',
      'touch-action': 'none',
      ...(dragging() ? { 'user-select': 'none' } : {}),
      ...(config.responsive
        ? rendered.heightMode === 'scrollable'
          ? { 'min-height': px(rendered.height) }
          : {}
        : { width: px(rendered.width), height: px(rendered.height) }),
      ...local.style,
    }
  }

  const host: { element: HTMLDivElement | null } = { element: null }
  const node = createElement(
    'div',
    mergeProps(rest, {
      ref: (next: HTMLDivElement) => {
        host.element = next
        applyRef(local.ref, next)
      },
      'data-gridla-canvas': '',
      'data-gridla-active': () => (dragging() ? '' : undefined),
      tabindex: () => local.tabIndex ?? 0,
      style,
    }),
    () => local.children,
  )

  onMount(() => {
    const target = host.element
    if (!target) return
    const { controller, gesture } = context
    gesture.setElement(target)
    const pointer = createPointerGesture(controller, { scope })
    createRenderEffect(() =>
      pointer.setOptions({
        onItemClick: local.onItemClick,
        onDeleteKey: local.onDeleteKey,
        enabled: local.enabled,
      }),
    )
    const unbindPointer = pointer.bindPointer(target)
    const unbindKeyboard = pointer.bindKeyboard(target)
    let unobserve: (() => void) | null = null
    createRenderEffect(() => {
      unobserve?.()
      unobserve = null
      if (context.config().responsive) {
        unobserve = observeSize(target, (size) => controller.setSize(size))
      } else {
        controller.setSize(null)
      }
    })
    onCleanup(() => {
      unobserve?.()
      unbindPointer()
      unbindKeyboard()
      pointer.destroy()
      gesture.setElement(null)
    })
  })

  return node
}

// ---------------------------------------------------------------------------
// GridItem
// ---------------------------------------------------------------------------

/**
 * Passed to a `GridItem` render function: the item's `GridItemView` accessor
 * plus props for drag and resize handles.
 */
export type GridItemRenderProps = {
  /** The item's geometry and flags; read it inside JSX for fine-grained updates. */
  view: Accessor<GridItemView>
  /** Spread on the element that starts a move. */
  dragHandleProps: { [GRID_DATA.dragHandle]: string }
  /** Props for a resize handle on the given edge. */
  getResizeHandleProps: (edge: GridResizeEdge) => {
    [GRID_DATA.resizeHandle]: string
    [GRID_DATA.edge]: GridResizeEdge
  }
}

/**
 * Props for `GridItem`. `id` selects the item; the rest control drag surfaces,
 * built-in resize handles, and how the element is positioned.
 */
export type GridItemProps = Omit<DivAttributes, 'id'> & {
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
  positioning?: GridPositioning
  /** Render the cursor-tracked rect while dragging instead of the solved preview. Default `true`. */
  followPointer?: boolean
  /** Inline styles merged over the geometry styles the item sets. */
  style?: JSX.CSSProperties
  ref?: Ref<HTMLDivElement>
  /** Content, or a render function that receives the view accessor and handle props. */
  children?: JSX.Element | ((props: GridItemRenderProps) => JSX.Element)
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

function resizeHandleStyle(edge: GridResizeEdge, size = 10): JSX.CSSProperties {
  // Handles sit fully inside the item so they stay hit-testable when the
  // item clips its overflow.
  const base: JSX.CSSProperties = {
    position: 'absolute',
    cursor: EDGE_CURSORS[edge],
    'touch-action': 'none',
  }
  const vertical = edge === 'n' || edge === 's'
  const horizontal = edge === 'e' || edge === 'w'
  if (vertical) {
    return {
      ...base,
      left: px(size),
      right: px(size),
      height: px(size),
      [edge === 'n' ? 'top' : 'bottom']: '0px',
    }
  }
  if (horizontal) {
    return {
      ...base,
      top: px(size),
      bottom: px(size),
      width: px(size),
      [edge === 'w' ? 'left' : 'right']: '0px',
    }
  }
  return {
    ...base,
    width: px(size),
    height: px(size),
    [edge.includes('n') ? 'top' : 'bottom']: '0px',
    [edge.includes('w') ? 'left' : 'right']: '0px',
  }
}

function rectStyle(rect: GridRect, positioning: GridPositioning): JSX.CSSProperties {
  if (positioning === 'absolute') {
    return {
      position: 'absolute',
      left: px(rect.x),
      top: px(rect.y),
      width: px(rect.w),
      height: px(rect.h),
    }
  }
  return {
    position: 'absolute',
    left: '0px',
    top: '0px',
    width: px(rect.w),
    height: px(rect.h),
    transform: `translate(${rect.x}px, ${rect.y}px)`,
  }
}

/**
 * Positions one item inside `GridCanvas`. Headless: it renders a `div` with
 * geometry styles and data attributes and leaves appearance to you. Pass a
 * render function as `children` to place your own drag handle or resize chrome.
 */
export function GridItem(props: GridItemProps): JSX.Element {
  const [local, rest] = splitProps(props, [
    'id',
    'draggable',
    'resizeEdges',
    'resizeHandleClass',
    'positioning',
    'followPointer',
    'children',
    'style',
    'ref',
  ])
  const view = useGridItemView(() => local.id)
  const dragHandleProps = { [GRID_DATA.dragHandle]: local.id } as { [GRID_DATA.dragHandle]: string }
  const getResizeHandleProps = (edge: GridResizeEdge) =>
    ({ [GRID_DATA.resizeHandle]: local.id, [GRID_DATA.edge]: edge }) as {
      [GRID_DATA.resizeHandle]: string
      [GRID_DATA.edge]: GridResizeEdge
    }
  const renderProps: GridItemRenderProps = { view, dragHandleProps, getResizeHandleProps }

  const style = (): JSX.CSSProperties => {
    const current = view()
    const shown =
      current.isActive &&
      (local.followPointer ?? true) &&
      current.activeRect &&
      current.interaction?.mode === 'move'
        ? current.activeRect
        : current.rect
    return {
      'box-sizing': 'border-box',
      ...rectStyle(shown, local.positioning ?? 'transform'),
      ...(current.isActive ? { 'z-index': '2' } : {}),
      ...(current.isTransferring ? { opacity: '0.4' } : {}),
      ...local.style,
    }
  }
  const flag = (predicate: (view: GridItemView) => boolean) => () =>
    predicate(view()) ? '' : undefined

  return createElement(
    'div',
    mergeProps(rest, {
      ref: (element: HTMLDivElement) => applyRef(local.ref, element),
      [GRID_DATA.item]: () => local.id,
      [GRID_DATA.dragHandle]: () => ((local.draggable ?? true) ? local.id : undefined),
      'data-gridla-active': flag((v) => v.isActive),
      'data-gridla-selected': flag((v) => v.isSelected),
      'data-gridla-shifted': flag((v) => v.isShifted),
      'data-gridla-transferring': flag((v) => v.isTransferring),
      style,
    }),
    [
      () => {
        const children = local.children
        return typeof children === 'function' ? children(renderProps) : children
      },
      () =>
        (local.resizeEdges ?? []).map((edge) =>
          createElement('div', {
            class: local.resizeHandleClass,
            ...getResizeHandleProps(edge),
            style: resizeHandleStyle(edge),
          }),
        ),
    ],
  )
}

// ---------------------------------------------------------------------------
// GridPreviewOutline
// ---------------------------------------------------------------------------

/**
 * Props for `GridPreviewOutline`: `div` attributes plus the positioning mode
 * (`transform` by default).
 */
export type GridPreviewOutlineProps = DivAttributes & {
  positioning?: GridPositioning
  /** Inline styles merged over the geometry styles the outline sets. */
  style?: JSX.CSSProperties
}

/**
 * Renders a box where the active item will land when released. Renders
 * nothing when no gesture is in progress.
 */
export function GridPreviewOutline(props: GridPreviewOutlineProps): JSX.Element {
  const [local, rest] = splitProps(props, ['positioning', 'style'])
  const rect = useGridStore(
    (state) => {
      if (!state.preview || !state.preview.accepted) return null
      const item = state.preview.item
      return { x: item.x, y: item.y, w: item.w, h: item.h }
    },
    (a, b) =>
      a === b ? true : !!a && !!b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h,
  )
  const visible = createMemo(() => rect() !== null)
  const style = (): JSX.CSSProperties => ({
    'pointer-events': 'none',
    'box-sizing': 'border-box',
    ...rectStyle(rect() ?? { x: 0, y: 0, w: 0, h: 0 }, local.positioning ?? 'transform'),
    ...local.style,
  })
  const outline = () =>
    visible() ? createElement('div', mergeProps(rest, { 'data-gridla-preview': '', style })) : null
  return outline as unknown as JSX.Element
}
