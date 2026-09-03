import type { GridItem, GridLayout, GridResizeEdge } from '../core'
import { mountGrid, type GridHandle, type MountGridOptions } from '../dom/mount'
import type { GridPositioning } from '../dom/view'
import { createTransferScope, type TransferScope } from '../interaction/transfer'
import type { GridChangeDetail } from '../interaction/types'

/**
 * `HTMLElement` when a DOM exists, an inert stand-in otherwise, so this module
 * can be imported (not used) during server rendering.
 */
const BaseElement: typeof HTMLElement =
  typeof HTMLElement === 'undefined' ? (Object as unknown as typeof HTMLElement) : HTMLElement

/** Detail of the `layout-change` event: the next layout and what changed. */
export type GridlaLayoutChangeDetail<TData = unknown> = {
  layout: GridLayout<TData>
  change: GridChangeDetail
}

/**
 * Events dispatched by `<gridla-canvas>`. `layout-change` fires after every
 * accepted change, `commit` after every interactive commit (with the solver
 * strategy), `select` when the selection changes, `item-click` when a press
 * ends without a drag, `transfer-out` and `transfer-in` when an item crosses
 * canvases inside a `<gridla-transfer-scope>`. None of them bubble.
 */
export type GridlaCanvasEventMap<TData = unknown> = {
  'layout-change': CustomEvent<GridlaLayoutChangeDetail<TData>>
  commit: CustomEvent<GridChangeDetail>
  select: CustomEvent<{ itemId: string | null }>
  'item-click': CustomEvent<{ itemId: string }>
  'transfer-out': CustomEvent<{ itemId: string; targetId: string }>
  'transfer-in': CustomEvent<{ item: GridItem<TData>; sourceId: string }>
}

const RESIZE_EDGES = new Set<string>(['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'])

function parseEdges(value: string | null): GridResizeEdge[] | undefined {
  if (value === null) return undefined
  return value
    .split(/[\s,]+/)
    .filter((edge) => RESIZE_EDGES.has(edge))
    .map((edge) => edge as GridResizeEdge)
}

function parseNumber(value: string | null): number | undefined {
  if (value === null || value.trim() === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function parseBoolean(value: string | null, fallback: boolean): boolean {
  if (value === null) return fallback
  return value !== 'false' && value !== '0'
}

/**
 * Shares one transfer scope with every `<gridla-canvas>` inside it, so items
 * can be dragged between them. Nest canvases inside items for nested layouts.
 */
export class GridlaTransferScopeElement extends BaseElement {
  /** The scope canvases below this element register with. */
  readonly scope: TransferScope = createTransferScope()
}

/**
 * One item of a `<gridla-canvas>`. Its light-DOM children are the content;
 * the canvas positions the element and sets the `data-gridla-*` attributes.
 * The only attribute is `item-id`. An element without a matching layout item
 * is hidden; a layout item without an element gets one created.
 */
export class GridlaItemElement extends BaseElement {
  /** Id of the item in the canvas layout. */
  get itemId(): string {
    return this.getAttribute('item-id') ?? ''
  }
  set itemId(value: string) {
    this.setAttribute('item-id', value)
  }

  connectedCallback() {
    // A child that arrives after the canvas mounted needs a reconcile.
    const canvas = this.parentElement
    if (canvas instanceof GridlaCanvasElement) canvas.refresh()
  }
}

/**
 * The drop outline. Place one inside a `<gridla-canvas>`; the canvas shows it
 * (`data-gridla-preview`) while a gesture has an accepted preview and hides it
 * otherwise.
 */
export class GridlaPreviewElement extends BaseElement {}

/**
 * A canvas over `mountGrid`. Set the `layout` property (or listen for
 * `layout-change` and set it back for controlled use); children are
 * `<gridla-item item-id>` elements and an optional `<gridla-preview>`.
 *
 * Attributes: `responsive` (`"false"` sizes the element to the layout),
 * `gap`, `snap-distance`, `drag-threshold`, `keyboard-step`, `resize-edges`
 * (built-in handles for every item, for example `"e s se"`),
 * `resize-handle-class`, `positioning` (`transform` | `absolute`), `selected-id`.
 */
export class GridlaCanvasElement<TData = unknown> extends BaseElement {
  static get observedAttributes(): string[] {
    return [
      'responsive',
      'gap',
      'snap-distance',
      'drag-threshold',
      'keyboard-step',
      'resize-edges',
      'resize-handle-class',
      'positioning',
      'selected-id',
    ]
  }

  #handle: GridHandle<TData> | null = null
  #layout: GridLayout<TData> | null = null
  #scope: TransferScope | null | undefined
  #pending = false
  #acceptTransfers: MountGridOptions<TData>['acceptTransfers']

  /** The layout. Setting it replaces the layout in place. */
  get layout(): GridLayout<TData> | null {
    return this.#handle ? this.#handle.getLayout() : this.#layout
  }
  set layout(value: GridLayout<TData> | null) {
    this.#layout = value
    if (this.#handle && value) this.#handle.setLayout(value)
    else if (this.#handle && !value) this.unmount()
    else this.#schedule()
  }

  /**
   * Transfer scope. Defaults to the nearest `<gridla-transfer-scope>`
   * ancestor. Set before the element connects (or set `layout` again after).
   */
  get scope(): TransferScope | null {
    return this.#scope ?? this.#findScope()
  }
  set scope(value: TransferScope | null) {
    this.#scope = value
  }

  /** Whether items from other canvases may be dropped here. Default `true`. */
  get acceptTransfers(): MountGridOptions<TData>['acceptTransfers'] {
    return this.#acceptTransfers
  }
  set acceptTransfers(value: MountGridOptions<TData>['acceptTransfers']) {
    this.#acceptTransfers = value
    this.#handle?.setOptions({ acceptTransfers: value })
  }

  /** The `GridHandle` while mounted (after connection with a layout), else `null`. */
  get handle(): GridHandle<TData> | null {
    return this.#handle
  }

  connectedCallback() {
    if (!this.style.display) this.style.display = 'block'
    this.#schedule()
  }

  disconnectedCallback() {
    this.unmount()
  }

  attributeChangedCallback() {
    if (this.#handle) this.#handle.setOptions(this.#attributeOptions())
  }

  /** Reconcile item elements with the layout (called when a child item connects). */
  refresh() {
    this.#handle?.setOptions({})
  }

  /** Tear the grid down; item elements stay in place and are hidden. */
  unmount() {
    this.#handle?.destroy()
    this.#handle = null
  }

  #schedule() {
    // Children are not parsed yet when `connectedCallback` runs during
    // parsing; mount in a microtask so `<gridla-item>` children are present.
    if (this.#pending) return
    this.#pending = true
    queueMicrotask(() => {
      this.#pending = false
      this.#mount()
    })
  }

  #mount() {
    if (this.#handle || !this.isConnected || !this.#layout) return
    const itemTag = this.localName.replace(/-canvas$/, '-item')
    this.#handle = mountGrid<TData>(this, {
      ...this.#attributeOptions(),
      defaultLayout: this.#layout,
      scope: this.scope,
      acceptTransfers: this.#acceptTransfers,
      preview: this.#findPreview() ?? false,
      renderItem: () => {},
      createItemElement: (item) => this.#adoptItem(item, itemTag),
      removeItemElement: (element) => {
        element.hidden = true
      },
      onLayoutChange: (layout, change) => {
        this.#layout = layout
        this.#emit('layout-change', { layout, change })
      },
      onCommit: (change) => this.#emit('commit', change),
      onSelectedIdChange: (itemId) => this.#emit('select', { itemId }),
      onItemClick: (itemId) => this.#emit('item-click', { itemId }),
      onTransferOut: (itemId, targetId) => this.#emit('transfer-out', { itemId, targetId }),
      onTransferIn: (item, sourceId) => this.#emit('transfer-in', { item, sourceId }),
    })
  }

  #adoptItem(item: GridItem<TData>, itemTag: string): HTMLElement {
    for (const child of Array.from(this.children)) {
      if (child instanceof GridlaItemElement && child.itemId === item.id) {
        child.hidden = false
        return child
      }
    }
    const created = document.createElement(itemTag)
    created.setAttribute('item-id', item.id)
    return created
  }

  #attributeOptions(): Partial<MountGridOptions<TData>> {
    const positioning = this.getAttribute('positioning')
    const selected = this.getAttribute('selected-id')
    return {
      responsive: parseBoolean(this.getAttribute('responsive'), true),
      gap: parseNumber(this.getAttribute('gap')),
      snapDistance: parseNumber(this.getAttribute('snap-distance')),
      dragThreshold: parseNumber(this.getAttribute('drag-threshold')),
      keyboardStep: parseNumber(this.getAttribute('keyboard-step')),
      resizeEdges: parseEdges(this.getAttribute('resize-edges')),
      resizeHandleClassName: this.getAttribute('resize-handle-class') ?? undefined,
      positioning:
        positioning === 'absolute' || positioning === 'transform'
          ? (positioning as GridPositioning)
          : undefined,
      selectedId: selected === null ? undefined : selected || null,
    }
  }

  #findScope(): TransferScope | null {
    for (let node = this.parentElement; node; node = node.parentElement) {
      if (node instanceof GridlaTransferScopeElement) return node.scope
    }
    return null
  }

  #findPreview(): HTMLElement | null {
    for (const child of Array.from(this.children)) {
      if (child instanceof GridlaPreviewElement) return child
    }
    return null
  }

  #emit(type: string, detail: unknown) {
    this.dispatchEvent(new CustomEvent(type, { detail }))
  }
}

/**
 * Register `<prefix-canvas>`, `<prefix-item>`, `<prefix-preview>`, and
 * `<prefix-transfer-scope>` (default prefix `gridla`). Safe to call more than
 * once and with several prefixes; a name that is already defined is skipped.
 * Does nothing where `customElements` is unavailable (server rendering).
 */
export function defineGridlaElements(prefix = 'gridla'): void {
  if (typeof customElements === 'undefined') return
  const define = (suffix: string, Base: CustomElementConstructor) => {
    const name = `${prefix}-${suffix}`
    if (customElements.get(name)) return
    // A constructor can be registered under one name only; subclass per name.
    customElements.define(name, class extends Base {})
  }
  define('transfer-scope', GridlaTransferScopeElement)
  define('item', GridlaItemElement)
  define('preview', GridlaPreviewElement)
  define('canvas', GridlaCanvasElement)
}
