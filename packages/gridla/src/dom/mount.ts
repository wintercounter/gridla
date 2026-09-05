import type { GridItem, GridLayout, GridResizeEdge } from '../core'
import { GRID_DATA } from '../interaction/attributes'
import {
  createGridController,
  type GridController,
  type GridControllerOptions,
} from '../interaction/controller'
import { createPointerGesture, type GridPointerGestureOptions } from '../interaction/gesture'
import { observeSize } from '../interaction/measure'
import type { GridState } from '../interaction/types'
import {
  applyRect,
  itemViewsEqual,
  selectItemView,
  styleResizeHandle,
  toggleAttribute,
  type GridItemView,
  type GridPositioning,
} from './view'

/**
 * Paints the content of one item. Called once when the item's element is
 * created and again whenever the item object or its `GridItemView` changes.
 * Built-in resize handles are children of `element` too; replacing
 * `element.innerHTML` is safe, they are re-attached after every call.
 */
export type GridItemRenderer<TData = unknown> = (
  item: GridItem<TData>,
  element: HTMLElement,
  view: GridItemView,
) => void

/**
 * Options for `mountGrid`: every `GridControllerOptions` field (controlled
 * `layout` or uncontrolled `defaultLayout`, callbacks, solver settings, a
 * transfer `scope`), the pointer gesture callbacks, and how items are rendered.
 */
export type MountGridOptions<TData = unknown> = GridControllerOptions<TData> &
  GridPointerGestureOptions & {
    /**
     * Paint an item's content. Without a renderer each item shows its id as
     * text (set once, when the element is created).
     */
    renderItem?: GridItemRenderer<TData>
    /**
     * Create the element for an item. Defaults to a `div`. Use it to adopt
     * elements that already exist (custom elements do this).
     */
    createItemElement?: (item: GridItem<TData>) => HTMLElement
    /** Dispose the element of an item that left the layout. Defaults to `element.remove()`. */
    removeItemElement?: (element: HTMLElement, itemId: string) => void
    /**
     * `true` (default): the whole item element is a drag surface. `false`:
     * only descendants marked `data-gridla-drag-handle` start a move.
     */
    draggable?: boolean
    /** Edges to render built-in resize handles for. Default: none. */
    resizeEdges?: readonly GridResizeEdge[]
    /** Class name for built-in resize handles. */
    resizeHandleClassName?: string
    /**
     * Render the drop outline (`data-gridla-preview`). `true` creates a `div`;
     * pass an element to use it instead. It is shown only while a gesture has
     * an accepted preview. Default `false`.
     */
    preview?: boolean | HTMLElement
    /** Position elements with `transform` (default) or with `left`/`top`. */
    positioning?: GridPositioning
    /** Render the cursor-tracked rect while dragging instead of the solved preview. Default `true`. */
    followPointer?: boolean
  }

/**
 * A mounted canvas. Keep it to sync a controlled layout, subscribe to state,
 * change options, or tear everything down.
 */
export type GridHandle<TData = unknown> = {
  /** The canvas element the grid was mounted on. */
  element: HTMLElement
  /** The underlying controller: store, actions, and gesture API. */
  controller: GridController<TData>
  /** Replace the layout. In controlled mode call this from `onLayoutChange`. */
  setLayout: (layout: GridLayout<TData>) => void
  /** The layout in effect, in the caller's coordinates (the last one set or committed). */
  getLayout: () => GridLayout<TData>
  /** Subscribe to controller state. Returns an unsubscribe function. */
  subscribe: (listener: (state: GridState<TData>) => void) => () => void
  /** Select an item, or clear the selection with `null`. */
  select: (itemId: string | null) => void
  /** Apply changed options; the canvas re-renders once. */
  setOptions: (options: Partial<MountGridOptions<TData>>) => void
  /** Remove listeners, observers, rendered elements, and unregister from the transfer scope. */
  destroy: () => void
}

type ItemRecord<TData> = {
  element: HTMLElement
  item: GridItem<TData>
  view: GridItemView
  handles: Map<GridResizeEdge, HTMLElement>
}

const CONTROLLER_KEYS = new Set<string>([
  'id',
  'layout',
  'defaultLayout',
  'onLayoutChange',
  'onCommit',
  'onTransferOut',
  'onTransferIn',
  'acceptTransfers',
  'scope',
  'responsive',
  'dragThreshold',
  'keyboardStep',
  'selectedId',
  'onSelectedIdChange',
  'gap',
  'snapDistance',
  'snap',
  'onTrace',
])

function controllerOptions<TData>(options: MountGridOptions<TData>): GridControllerOptions<TData> {
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(options)) {
    if (CONTROLLER_KEYS.has(key)) out[key] = (options as Record<string, unknown>)[key]
  }
  return out as GridControllerOptions<TData>
}

/** Shallow equality over own enumerable fields; layout items are plain objects. */
function itemsEqual(a: object, b: object): boolean {
  if (a === b) return true
  const keysA = Object.keys(a)
  if (keysA.length !== Object.keys(b).length) return false
  const recordA = a as Record<string, unknown>
  const recordB = b as Record<string, unknown>
  for (const key of keysA) if (!Object.is(recordA[key], recordB[key])) return false
  return true
}

function defaultRenderer<TData>(item: GridItem<TData>, element: HTMLElement) {
  if (element.childNodes.length === 0) element.textContent = item.id
}

/**
 * Mount a grid on `element`: the element becomes the canvas
 * (`data-gridla-canvas`), one child per item is created and positioned, and
 * pointer and keyboard input drive the solvers. Nested layouts are nested
 * mounts; give the inner and outer canvases the same `scope` from
 * `createTransferScope` to move items between them. Returns a `GridHandle`;
 * call `destroy` when the element goes away.
 */
export function mountGrid<TData = unknown>(
  element: HTMLElement,
  options: MountGridOptions<TData> = {},
): GridHandle<TData> {
  let current: MountGridOptions<TData> = options
  const controller = createGridController<TData>(controllerOptions(options))
  const { store } = controller
  controller.gesture.setElement(element)
  const gesture = createPointerGesture(controller, {
    scope: options.scope ?? null,
    onItemClick: options.onItemClick,
    onDeleteKey: options.onDeleteKey,
    enabled: options.enabled,
  })

  const records = new Map<string, ItemRecord<TData>>()
  let previewElement: HTMLElement | null = null
  let ownsPreview = false
  let lastState: GridState<TData> | null = null

  element.setAttribute('data-gridla-canvas', '')
  if (!element.hasAttribute('tabindex')) element.tabIndex = 0
  if (!element.style.position) element.style.position = 'relative'
  element.style.boxSizing = 'border-box'
  element.style.touchAction = 'none'

  const positioning = () => current.positioning ?? 'transform'
  const renderItem = (record: ItemRecord<TData>) => {
    ;(current.renderItem ?? defaultRenderer)(record.item, record.element, record.view)
    ensureHandles(record)
  }

  const ensureHandles = (record: ItemRecord<TData>) => {
    const edges = current.resizeEdges ?? []
    for (const [edge, handle] of record.handles) {
      if (!edges.includes(edge)) {
        handle.remove()
        record.handles.delete(edge)
      }
    }
    for (const edge of edges) {
      let handle = record.handles.get(edge)
      if (!handle) {
        handle = document.createElement('div')
        handle.setAttribute(GRID_DATA.resizeHandle, record.item.id)
        handle.setAttribute(GRID_DATA.edge, edge)
        styleResizeHandle(handle, edge)
        record.handles.set(edge, handle)
      }
      const className = current.resizeHandleClassName ?? ''
      if (handle.className !== className) handle.className = className
      // `append` moves an attached handle to the end, so a renderer that
      // replaced the content never loses the handles.
      record.element.append(handle)
    }
  }

  /** Strip everything the mount put on an element and hand it to `removeItemElement`. */
  const detachRecord = (id: string, record: ItemRecord<TData>) => {
    for (const handle of record.handles.values()) handle.remove()
    const node = record.element
    for (const name of [
      GRID_DATA.item,
      GRID_DATA.dragHandle,
      'data-gridla-active',
      'data-gridla-selected',
      'data-gridla-shifted',
      'data-gridla-transferring',
    ]) {
      node.removeAttribute(name)
    }
    if (current.removeItemElement) current.removeItemElement(node, id)
    else node.remove()
  }

  const paintItem = (record: ItemRecord<TData>) => {
    const { element: node, view } = record
    const shown =
      view.isActive &&
      (current.followPointer ?? true) &&
      view.activeRect &&
      view.interaction?.mode === 'move'
        ? view.activeRect
        : view.rect
    applyRect(node, shown, positioning())
    node.style.zIndex = view.isActive ? '2' : ''
    node.style.opacity = view.isTransferring ? '0.4' : ''
    toggleAttribute(node, 'data-gridla-active', view.isActive)
    toggleAttribute(node, 'data-gridla-selected', view.isSelected)
    toggleAttribute(node, 'data-gridla-shifted', view.isShifted)
    toggleAttribute(node, 'data-gridla-transferring', view.isTransferring)
  }

  const createRecord = (item: GridItem<TData>, state: GridState<TData>): ItemRecord<TData> => {
    const node = current.createItemElement
      ? current.createItemElement(item)
      : document.createElement('div')
    node.setAttribute(GRID_DATA.item, item.id)
    if (current.draggable ?? true) node.setAttribute(GRID_DATA.dragHandle, item.id)
    else node.removeAttribute(GRID_DATA.dragHandle)
    const record: ItemRecord<TData> = {
      element: node,
      item,
      view: selectItemView(state, item.id),
      handles: new Map(),
    }
    paintItem(record)
    if (!node.parentNode) element.append(node)
    renderItem(record)
    return record
  }

  const paintPreview = (state: GridState<TData>) => {
    const wanted = current.preview
    if (!wanted) {
      if (previewElement) {
        if (ownsPreview) previewElement.remove()
        else previewElement.style.display = 'none'
        previewElement = null
      }
      return
    }
    if (typeof wanted !== 'boolean' && previewElement !== wanted && previewElement && ownsPreview) {
      previewElement.remove()
      previewElement = null
    }
    if (!previewElement) {
      previewElement = typeof wanted === 'boolean' ? document.createElement('div') : wanted
      ownsPreview = typeof wanted === 'boolean'
      previewElement.setAttribute('data-gridla-preview', '')
      previewElement.style.pointerEvents = 'none'
      previewElement.style.boxSizing = 'border-box'
      if (!previewElement.parentNode) element.append(previewElement)
    }
    const preview = state.preview
    if (!preview || !preview.accepted) {
      previewElement.style.display = 'none'
      return
    }
    const { x, y, w, h } = preview.item
    applyRect(previewElement, { x, y, w, h }, positioning())
    previewElement.style.display = ''
    // Keep the outline above shifted siblings and below the active item.
    previewElement.style.zIndex = '1'
  }

  const paintCanvas = (state: GridState<TData>) => {
    const { canvas } = state.layout
    const responsive = controller.getConfig().responsive
    toggleAttribute(element, 'data-gridla-active', state.interaction !== null)
    element.style.userSelect = state.interaction ? 'none' : ''
    if (responsive) {
      element.style.width = ''
      element.style.height = ''
      element.style.minHeight = canvas.heightMode === 'scrollable' ? `${canvas.height}px` : ''
    } else {
      element.style.minHeight = ''
      element.style.width = `${canvas.width}px`
      element.style.height = `${canvas.height}px`
    }
  }

  /** Reconcile the DOM with the store: add, update, and remove item elements in place. */
  const render = (force = false) => {
    const state = store.getSnapshot()
    if (!force && state === lastState) return
    lastState = state
    paintCanvas(state)
    const seen = new Set<string>()
    const visible = state.preview?.layout ?? state.layout
    for (const base of state.layout.items) {
      seen.add(base.id)
      const item = visible.items.find((entry) => entry.id === base.id) ?? base
      const record = records.get(base.id)
      if (!record) {
        records.set(base.id, createRecord(item, state))
        continue
      }
      const view = selectItemView(state, base.id)
      if (!force && itemsEqual(record.item, item) && itemViewsEqual(record.view, view)) continue
      record.item = item
      record.view = view
      if (force) {
        if (current.draggable ?? true) record.element.setAttribute(GRID_DATA.dragHandle, base.id)
        else record.element.removeAttribute(GRID_DATA.dragHandle)
      }
      paintItem(record)
      renderItem(record)
    }
    for (const [id, record] of records) {
      if (seen.has(id)) continue
      records.delete(id)
      detachRecord(id, record)
    }
    paintPreview(state)
  }

  const unsubscribe = store.subscribe(() => render())
  render(true)
  const unbindPointer = gesture.bindPointer(element)
  const unbindKeyboard = gesture.bindKeyboard(element)
  // The first measurement is synchronous and re-renders through the store.
  const unobserve = observeSize(element, (size) => controller.setSize(size))

  return {
    element,
    controller,
    setLayout: (layout) => {
      // Keep the controlled option in step so a later `setOptions` does not
      // sync the layout the grid was mounted with.
      if (current.layout !== undefined) current = { ...current, layout }
      controller.setLayout(layout)
    },
    getLayout: () => store.getSnapshot().source,
    subscribe: (listener) => store.subscribe(() => listener(store.getSnapshot())),
    select: (itemId) => controller.actions.select(itemId),
    setOptions: (next) => {
      current = { ...current, ...next }
      controller.setOptions(controllerOptions(current))
      gesture.setOptions({
        onItemClick: current.onItemClick,
        onDeleteKey: current.onDeleteKey,
        enabled: current.enabled,
      })
      render(true)
    },
    destroy: () => {
      unsubscribe()
      unbindPointer()
      unbindKeyboard()
      unobserve()
      gesture.destroy()
      controller.destroy()
      for (const [id, record] of records) detachRecord(id, record)
      records.clear()
      if (previewElement) {
        if (ownsPreview) previewElement.remove()
        else previewElement.style.display = 'none'
        previewElement = null
      }
      element.removeAttribute('data-gridla-canvas')
      element.removeAttribute('data-gridla-active')
    },
  }
}
