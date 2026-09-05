import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  booleanAttribute,
  computed,
  effect,
  inject,
  input,
  output,
  untracked,
} from '@angular/core'

import { createPointerGesture, type GridPointerGesture } from 'gridla/interaction'
import { observeSize } from 'gridla/interaction'
import { GridController } from './controller'
import { GRID_TRANSFER_SCOPE } from './provide'

/**
 * The element items are positioned in. Measures itself, feeds the size to the
 * controller, and wires pointer and keyboard handling. Renders with
 * `position: relative`; give it a height (or let it follow the layout with
 * `responsive="false"` on the provider). Server rendering: the element renders
 * empty of gesture wiring and measures itself after the first client render.
 */
@Component({
  selector: 'gridla-canvas',
  exportAs: 'gridlaCanvas',
  template: '<ng-content />',
  host: {
    'data-gridla-canvas': '',
    '[attr.data-gridla-active]': 'controller.dragging() ? "" : null',
    '[attr.tabindex]': 'tabIndex()',
    '[style.position]': '"relative"',
    '[style.box-sizing]': '"border-box"',
    '[style.display]': '"block"',
    '[style.touch-action]': '"none"',
    '[style.user-select]': 'controller.dragging() ? "none" : null',
    '[style.width.px]': 'fixedSize()?.width ?? null',
    '[style.height.px]': 'fixedSize()?.height ?? null',
    '[style.min-height.px]': 'minHeight()',
    '(pointerdown)': 'pointer.pointerDown($event)',
    '(pointermove)': 'pointer.pointerMove($event)',
    '(pointerup)': 'pointer.pointerUp($event)',
    '(pointercancel)': 'pointer.pointerCancel($event)',
    '(keydown)': 'pointer.keyDown($event)',
  },
})
export class GridCanvasComponent {
  /** The controller of the enclosing provider. */
  readonly controller = inject(GridController)
  /** Set `false` to disable pointer-driven gestures. Default `true`. */
  readonly enabled = input(true, { transform: booleanAttribute })
  /** Keyboard focus order; the canvas is focusable so arrow keys can nudge. Default `0`. */
  readonly tabIndex = input(0, { alias: 'tabindex' })
  /** A press on an item that did not turn into a drag. Selection already happened on press. */
  readonly itemClick = output<string>()
  /** Delete or Backspace pressed with an item selected. */
  readonly deleteKey = output<string>()

  /** The pointer and keyboard state machine driving the controller. */
  protected readonly pointer: GridPointerGesture

  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement

  // Config changes always re-render the layout, so reading `layout()` is enough
  // to track `responsive` even though the config itself is not a signal.
  protected readonly fixedSize = computed(() => {
    const canvas = this.controller.layout().canvas
    return this.controller.getConfig().responsive ? null : canvas
  })

  protected readonly minHeight = computed(() => {
    const canvas = this.controller.layout().canvas
    return this.controller.getConfig().responsive && canvas.heightMode === 'scrollable'
      ? canvas.height
      : null
  })

  constructor() {
    const scope = inject(GRID_TRANSFER_SCOPE, { optional: true })
    this.controller.gesture.setElement(this.element)
    this.pointer = createPointerGesture(this.controller.handle, { scope })
    effect(() => {
      const enabled = this.enabled()
      untracked(() =>
        this.pointer.setOptions({
          enabled,
          onItemClick: (itemId) => this.itemClick.emit(itemId),
          onDeleteKey: (itemId) => this.deleteKey.emit(itemId),
        }),
      )
    })

    const destroyRef = inject(DestroyRef)
    afterNextRender(() => {
      const stop = observeSize(this.element, (size) => this.controller.setSize(size))
      destroyRef.onDestroy(stop)
    })
    destroyRef.onDestroy(() => {
      this.pointer.destroy()
      this.controller.gesture.setElement(null)
    })
  }
}
