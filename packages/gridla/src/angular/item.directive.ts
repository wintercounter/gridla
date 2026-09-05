import {
  Directive,
  ElementRef,
  Renderer2,
  booleanAttribute,
  computed,
  effect,
  inject,
  input,
  type Signal,
} from '@angular/core'

import type { GridRect, GridResizeEdge } from 'gridla'
import { GRID_DATA, resizeHandleStyle } from 'gridla/interaction'
import { GridController } from './controller'
import type { GridItemView } from './view'

/**
 * Positions one item inside `<gridla-canvas>`. Headless: it sets geometry
 * styles and data attributes on its host and leaves appearance to you.
 * `[gridlaItem]` is the item id. With `resizeEdges`, built-in handles are
 * appended to the host; `gridlaResizeHandle` and `gridlaDragHandle` mark your
 * own instead.
 */
@Directive({
  selector: '[gridlaItem]',
  exportAs: 'gridlaItem',
  host: {
    '[attr.data-gridla-item]': 'id()',
    '[attr.data-gridla-drag-handle]': 'draggable() ? id() : null',
    '[attr.data-gridla-active]': 'view().isActive ? "" : null',
    '[attr.data-gridla-selected]': 'view().isSelected ? "" : null',
    '[attr.data-gridla-shifted]': 'view().isShifted ? "" : null',
    '[attr.data-gridla-transferring]': 'view().isTransferring ? "" : null',
    '[style.box-sizing]': '"border-box"',
    '[style.position]': '"absolute"',
    '[style.left.px]': 'positioning() === "absolute" ? shownRect().x : 0',
    '[style.top.px]': 'positioning() === "absolute" ? shownRect().y : 0',
    '[style.width.px]': 'shownRect().w',
    '[style.height.px]': 'shownRect().h',
    '[style.transform]': 'transform()',
    '[style.z-index]': 'view().isActive ? 2 : null',
    '[style.opacity]': 'view().isTransferring ? 0.4 : null',
  },
})
export class GridItemDirective {
  /** Id of the item in the layout. */
  readonly id = input.required<string>({ alias: 'gridlaItem' })
  /**
   * `true` (default): the whole element is a drag surface. `false`: only
   * elements marked with `gridlaDragHandle` start a move.
   */
  readonly draggable = input(true, { transform: booleanAttribute })
  /** Edges to render built-in resize handles for. Default: none. */
  readonly resizeEdges = input<readonly GridResizeEdge[]>([])
  /** Class for built-in resize handles. */
  readonly resizeHandleClass = input<string>()
  /**
   * Position the element with `transform` (default) or with `left`/`top`.
   * Transform keeps layout work off the main thread during gestures.
   */
  readonly positioning = input<'transform' | 'absolute'>('transform')
  /** Render the cursor-tracked rect while dragging instead of the solved preview. Default `true`. */
  readonly followPointer = input(true, { transform: booleanAttribute })

  /** The controller of the enclosing provider. */
  readonly controller = inject(GridController)
  /** Everything needed to paint this item. */
  readonly view: Signal<GridItemView> = this.controller.itemView(this.id)

  /** The rectangle currently painted: the pointer-tracked rect during a move, else the solved one. */
  readonly shownRect: Signal<GridRect> = computed(() => {
    const view = this.view()
    return view.isActive &&
      this.followPointer() &&
      view.activeRect &&
      view.interaction?.mode === 'move'
      ? view.activeRect
      : view.rect
  })

  protected readonly transform = computed(() => {
    if (this.positioning() === 'absolute') return null
    const rect = this.shownRect()
    return `translate(${rect.x}px, ${rect.y}px)`
  })

  constructor() {
    const element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement
    const renderer = inject(Renderer2)
    const handles: HTMLElement[] = []
    effect(() => {
      for (const handle of handles) renderer.removeChild(element, handle)
      handles.length = 0
      const id = this.id()
      const className = this.resizeHandleClass()
      for (const edge of this.resizeEdges()) {
        const handle = renderer.createElement('div') as HTMLElement
        renderer.setAttribute(handle, GRID_DATA.resizeHandle, id)
        renderer.setAttribute(handle, GRID_DATA.edge, edge)
        if (className) renderer.setAttribute(handle, 'class', className)
        for (const [key, value] of Object.entries(resizeHandleStyle(edge))) {
          renderer.setStyle(handle, key, value)
        }
        renderer.appendChild(element, handle)
        handles.push(handle)
      }
    })
  }
}

/**
 * Marks an element inside a `[gridlaItem]` as the surface that starts a move.
 * Pair it with `draggable="false"` on the item so the rest of the item is
 * inert. The bound value is optional and ignored.
 */
@Directive({
  selector: '[gridlaDragHandle]',
  host: { '[attr.data-gridla-drag-handle]': 'item.id()' },
})
export class GridDragHandleDirective {
  /** The item this handle belongs to. */
  readonly item = inject(GridItemDirective)
}

/**
 * Marks an element inside a `[gridlaItem]` as a resize handle for one edge:
 * `<div gridlaResizeHandle="se"></div>`. Position and style it yourself.
 */
@Directive({
  selector: '[gridlaResizeHandle]',
  host: {
    '[attr.data-gridla-resize-handle]': 'item.id()',
    '[attr.data-gridla-edge]': 'edge()',
    '[style.touch-action]': '"none"',
  },
})
export class GridResizeHandleDirective {
  /** The edge this handle resizes. */
  readonly edge = input.required<GridResizeEdge>({ alias: 'gridlaResizeHandle' })
  /** The item this handle belongs to. */
  readonly item = inject(GridItemDirective)
}
