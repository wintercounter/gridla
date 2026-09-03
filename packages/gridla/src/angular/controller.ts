import {
  Injectable,
  computed,
  inject,
  signal,
  type OnDestroy,
  type Signal,
  type ValueEqualityFn,
} from '@angular/core'

import type { GridLayout, GridSize } from 'gridla'
import {
  createGridController,
  type GridController as GridControllerHandle,
  type GridControllerOptions,
} from 'gridla/interaction'
import type {
  GridActions,
  GridControllerConfig,
  GridGestureApi,
  GridInteraction,
  GridPreview,
  GridState,
} from 'gridla/interaction'
import type { GridStore } from 'gridla/interaction'
import { GRIDLA_OPTIONS, GRID_TRANSFER_SCOPE } from './provide'
import { itemViewsEqual, selectItemView, type GridItemView } from './view'

/**
 * Injectable owner of one canvas: a `createGridController` handle from
 * `gridla/interaction` wrapped in signals. `GridProviderComponent` provides
 * one instance per provider and forwards its inputs; children inject it with
 * `inject(GridController)` (or the `injectGrid*` helpers) to read state and
 * call actions. Standalone use: add it to a component's `providers` and call
 * `setOptions` yourself.
 */
@Injectable()
export class GridController<TData = unknown> implements OnDestroy {
  /** The underlying framework-neutral controller. */
  readonly handle: GridControllerHandle<TData>
  /** Id of this controller. Used by transfer scopes. */
  readonly id: string
  /** State store. The signals below are derived from it. */
  readonly store: GridStore<GridState<TData>>
  /** Imperative layout and selection API. Stable for the controller's lifetime. */
  readonly actions: GridActions<TData>
  /** Low-level gesture API. Stable for the controller's lifetime. */
  readonly gesture: GridGestureApi<TData>
  /** The whole controller state as a signal. */
  readonly state: Signal<GridState<TData>>
  /** The rendered layout (projected onto the measured canvas size). */
  readonly layout: Signal<GridLayout<TData>>
  /** The layout the provider was given, in its own coordinates. */
  readonly sourceLayout: Signal<GridLayout<TData>>
  /** The layout to paint right now: the preview during a gesture, else the rendered layout. */
  readonly visibleLayout: Signal<GridLayout<TData>>
  /** The gesture in progress, or `null` when idle. */
  readonly interaction: Signal<GridInteraction | null>
  /** The solver's latest preview for the gesture in progress, or `null` when idle. */
  readonly preview: Signal<GridPreview<TData> | null>
  /** Id of the selected item, or `null`. */
  readonly selectedId: Signal<string | null>
  /** True while a move or resize is in progress. */
  readonly dragging: Signal<boolean>

  private readonly unsubscribe: () => void
  private readonly defaults = inject(GRIDLA_OPTIONS, { optional: true }) ?? {}
  private readonly scope = inject(GRID_TRANSFER_SCOPE, { optional: true })

  constructor() {
    this.handle = createGridController<TData>({ ...this.defaults, scope: this.scope })
    this.id = this.handle.id
    this.store = this.handle.store
    this.actions = this.handle.actions
    this.gesture = this.handle.gesture
    const state = signal(this.store.getSnapshot())
    this.unsubscribe = this.store.subscribe(() => state.set(this.store.getSnapshot()))
    this.state = state.asReadonly()
    this.layout = computed(() => this.state().layout)
    this.sourceLayout = computed(() => this.state().source)
    this.visibleLayout = computed(() => this.state().preview?.layout ?? this.state().layout)
    this.interaction = computed(() => this.state().interaction)
    this.preview = computed(() => this.state().preview)
    this.selectedId = computed(() => this.state().selectedId)
    this.dragging = computed(() => this.state().interaction !== null)
  }

  /**
   * A signal over a slice of the state. Recomputes on every store change and
   * notifies dependents only when `equal` (default `Object.is`) says the slice
   * changed.
   */
  select<TSlice>(
    selector: (state: GridState<TData>) => TSlice,
    equal?: ValueEqualityFn<TSlice>,
  ): Signal<TSlice> {
    return computed(() => selector(this.state()), equal ? { equal } : undefined)
  }

  /** Everything needed to paint one item, with structural equality. */
  itemView(itemId: string | Signal<string>): Signal<GridItemView> {
    const id = typeof itemId === 'string' ? () => itemId : itemId
    return computed(() => selectItemView(this.state(), id()), { equal: itemViewsEqual })
  }

  /** The resolved configuration currently in effect. */
  getConfig(): GridControllerConfig {
    return this.handle.getConfig()
  }

  /**
   * Apply options: callbacks, config fields, the controlled `layout` and
   * `selectedId`. Application defaults from `provideGridla` fill in fields
   * left `undefined`. `GridProviderComponent` calls this from an effect over
   * its inputs.
   */
  setOptions(options: GridControllerOptions<TData>): void {
    const merged: GridControllerOptions<TData> = { ...this.defaults }
    for (const [key, value] of Object.entries(options)) {
      if (value !== undefined) (merged as Record<string, unknown>)[key] = value
    }
    merged.scope = options.scope === undefined ? this.scope : options.scope
    this.handle.setOptions(merged)
  }

  /** Sync a layout into the store without reporting a change (used for `defaultLayout`). */
  setLayout(layout: GridLayout<TData>): void {
    this.handle.setLayout(layout)
  }

  /** Update the measured canvas size. `GridCanvasComponent` calls this. */
  setSize(size: GridSize | null): void {
    this.handle.setSize(size)
  }

  /** Stops the store subscription and destroys the underlying controller. */
  ngOnDestroy(): void {
    this.unsubscribe()
    this.handle.destroy()
  }
}
