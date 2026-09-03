import {
  Component,
  booleanAttribute,
  effect,
  inject,
  input,
  numberAttribute,
  output,
  untracked,
  type OnInit,
} from '@angular/core'

import type { GridItem, GridLayout, SolveOptions } from 'gridla'
import type { GridControllerOptions } from 'gridla/interaction'
import type { GridChangeDetail } from 'gridla/interaction'
import { GridController } from './controller'
import type {
  GridLayoutChangeEvent,
  GridTransferInEvent,
  GridTransferOutEvent,
  GridlaOptions,
} from './types'

/**
 * Owns layout state and gesture state for one canvas. Use it as an element
 * (`<gridla-provider>`) or as an attribute on any element (`[gridlaProvider]`);
 * it provides a `GridController` to everything inside. Place a
 * `<gridla-canvas>` inside it. Nested layouts are nested providers.
 *
 * Controlled: bind `[layout]` and listen to `(layoutChange)`, or use
 * `[(layout)]`. Uncontrolled: pass `[defaultLayout]`. Every `SolveOptions`
 * field is an input; `[config]` takes them as one object.
 */
@Component({
  selector: 'gridla-provider, [gridlaProvider]',
  exportAs: 'gridlaProvider',
  template: '<ng-content />',
  providers: [GridController],
  host: { style: 'display: contents' },
})
export class GridProviderComponent<TData = unknown> implements OnInit {
  /** The controller this provider owns. */
  readonly controller = inject(GridController) as GridController<TData>

  /** Controlled layout. Pair with `(layoutChange)` or bind `[(layout)]`. */
  readonly layout = input<GridLayout<TData>>()
  /** Initial layout for uncontrolled use. */
  readonly defaultLayout = input<GridLayout<TData>>()
  /** Solver options and controller settings as one object. Individual inputs win. */
  readonly config = input<GridlaOptions>()
  /** Project the layout onto the measured canvas size. Default `true`. */
  readonly responsive = input(undefined, { transform: optionalBoolean })
  /** Minimum pointer travel before a press becomes a drag. Default `4`. */
  readonly dragThreshold = input(undefined, { transform: optionalNumber })
  /** Pixels moved per arrow key press. Default `8`; Shift multiplies by 4. */
  readonly keyboardStep = input(undefined, { transform: optionalNumber })
  /** Minimum distance kept between items. Default `0`. */
  readonly gap = input(undefined, { transform: optionalNumber })
  /** Distance within which edges snap to neighbors. */
  readonly snapDistance = input(undefined, { transform: optionalNumber })
  /** Alignment snapping on or off. */
  readonly snap = input(undefined, { transform: optionalBoolean })
  /** Solver tracing callback. */
  readonly onTrace = input<SolveOptions['onTrace']>()
  /** Controlled selection. Pair with `(selectedIdChange)` or bind `[(selectedId)]`. */
  readonly selectedId = input<string | null>()
  /** Whether items from other canvases may be dropped here. Default `true`. */
  readonly acceptTransfers = input<
    boolean | ((item: GridItem<TData>, sourceId: string) => boolean) | undefined,
    unknown
  >(undefined, { transform: transferPredicate })

  /** The next layout after every accepted change. Enables `[(layout)]`. */
  readonly layoutChange = output<GridLayout<TData>>()
  /** The next layout together with the `GridChangeDetail` that produced it. */
  readonly layoutChangeDetail = output<GridLayoutChangeEvent<TData>>()
  /** The solver strategy of every accepted interactive commit. */
  readonly commit = output<GridChangeDetail>()
  /** Selection changes. Enables `[(selectedId)]`. */
  readonly selectedIdChange = output<string | null>()
  /** An item arrived from another canvas inside a transfer scope. */
  readonly transferIn = output<GridTransferInEvent<TData>>()
  /** An item left for another canvas inside a transfer scope. */
  readonly transferOut = output<GridTransferOutEvent>()

  private initialized = false

  constructor() {
    // Forward input changes after the first `ngOnInit`; the controller compares
    // and only touches the store when something changed.
    effect(() => {
      const options = this.options()
      if (this.initialized) untracked(() => this.controller.setOptions(options))
    })
  }

  /** Seeds an uncontrolled layout and applies the initial options. */
  ngOnInit(): void {
    const layout = this.layout()
    const defaultLayout = this.defaultLayout()
    if (layout === undefined && defaultLayout !== undefined)
      this.controller.setLayout(defaultLayout)
    this.controller.setOptions(this.options())
    this.initialized = true
  }

  private options(): GridControllerOptions<TData> {
    const config = this.config() ?? {}
    return {
      ...config,
      layout: this.layout(),
      responsive: this.responsive() ?? config.responsive,
      dragThreshold: this.dragThreshold() ?? config.dragThreshold,
      keyboardStep: this.keyboardStep() ?? config.keyboardStep,
      gap: this.gap() ?? config.gap,
      snapDistance: this.snapDistance() ?? config.snapDistance,
      snap: this.snap() ?? config.snap,
      onTrace: this.onTrace() ?? config.onTrace,
      selectedId: this.selectedId(),
      acceptTransfers: this.acceptTransfers(),
      onLayoutChange: (layout, change) => {
        this.layoutChange.emit(layout)
        this.layoutChangeDetail.emit({ layout, change })
      },
      onCommit: (change) => this.commit.emit(change),
      onSelectedIdChange: (itemId) => this.selectedIdChange.emit(itemId),
      onTransferIn: (item, sourceId) => this.transferIn.emit({ item, sourceId }),
      onTransferOut: (itemId, targetId) => this.transferOut.emit({ itemId, targetId }),
    }
  }
}

function optionalBoolean(value: unknown): boolean | undefined {
  return value === undefined || value === null ? undefined : booleanAttribute(value)
}

function optionalNumber(value: unknown): number | undefined {
  return value === undefined || value === null || value === '' ? undefined : numberAttribute(value)
}

function transferPredicate<TData>(
  value: unknown,
): boolean | ((item: GridItem<TData>, sourceId: string) => boolean) | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value === 'function') {
    return value as (item: GridItem<TData>, sourceId: string) => boolean
  }
  return booleanAttribute(value)
}
