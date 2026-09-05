import { getContext, setContext } from 'svelte'

import type { GridLayout } from 'gridla'
import {
  createGridController,
  type GridActions,
  type GridController,
  type GridControllerConfig,
  type GridControllerOptions,
  type GridGestureApi,
  type GridState,
  type TransferScope,
} from 'gridla/interaction'

import type { GridItemView } from './types.js'
import { itemViewsEqual, selectItemView } from './view.js'

const GRID_KEY = Symbol.for('gridla.svelte.grid')
const TRANSFER_KEY = Symbol.for('gridla.svelte.transfer')

/**
 * A `GridController` whose state is exposed as a rune. `state` is a
 * `$state.raw` snapshot that follows the controller store, so reading it in a
 * component, `$derived`, or `$effect` tracks every change. Created by
 * `createGridRunes` and provided to descendants by `GridProvider`.
 */
export type GridRunes<TData = unknown> = {
  /** Id of the controller. Used by transfer scopes. */
  id: string
  /** The controller the runes wrap. */
  controller: GridController<TData>
  /** Current controller state (reactive). */
  readonly state: GridState<TData>
  /** Resolved configuration in effect (reactive). */
  readonly config: GridControllerConfig
  /** Imperative layout and selection API. Stable for the controller's lifetime. */
  actions: GridActions<TData>
  /** Low-level gesture API. Stable for the controller's lifetime. */
  gesture: GridGestureApi<TData>
  /** Forward changed options to the controller and refresh `config`. */
  setOptions: (options: GridControllerOptions<TData>) => void
  /** Stop following the store and destroy the controller. */
  destroy: () => void
}

/**
 * Create a `GridController` and wrap its store in `$state.raw`. Use it to
 * build a custom provider; `GridProvider` calls it for you. Call `destroy`
 * when the owning component unmounts.
 */
export function createGridRunes<TData = unknown>(
  options: GridControllerOptions<TData> = {},
): GridRunes<TData> {
  const controller = createGridController<TData>(options)
  let state = $state.raw(controller.store.getSnapshot())
  let config = $state.raw(controller.getConfig())
  const unsubscribe = controller.store.subscribe(() => {
    state = controller.store.getSnapshot()
  })
  return {
    id: controller.id,
    controller,
    get state() {
      return state
    },
    get config() {
      return config
    },
    actions: controller.actions,
    gesture: controller.gesture,
    setOptions: (next) => {
      controller.setOptions(next)
      const resolved = controller.getConfig()
      if (resolved !== config) config = resolved
    },
    destroy: () => {
      unsubscribe()
      controller.destroy()
    },
  }
}

/** Provide `runes` to descendant components. Call during component initialization. */
export function setGridContext<TData>(runes: GridRunes<TData>): GridRunes<TData> {
  return setContext(GRID_KEY, runes)
}

/**
 * Read the nearest `GridProvider`'s runes. Call during component
 * initialization; throws when no provider is above the component.
 */
export function getGridContext<TData = unknown>(): GridRunes<TData> {
  const runes = getContext<GridRunes<TData> | undefined>(GRID_KEY)
  if (!runes) {
    throw new Error('gridla/svelte: this component must be rendered inside <GridProvider>')
  }
  return runes
}

/** Provide a `TransferScope` to descendant providers. `GridTransferScope` calls this. */
export function setTransferScopeContext(scope: TransferScope): TransferScope {
  return setContext(TRANSFER_KEY, scope)
}

/** The nearest `GridTransferScope`'s scope, or `null` when there is none. */
export function getTransferScopeContext(): TransferScope | null {
  return getContext<TransferScope | undefined>(TRANSFER_KEY) ?? null
}

/** A reactive read-only value. Read `current` inside a template, `$derived`, or `$effect`. */
export type GridRead<T> = {
  readonly current: T
}

/**
 * Select a slice of the nearest provider's state. `current` recomputes when
 * the state changes and keeps its previous value while `isEqual` (default
 * `Object.is`) reports the new slice equal, so dependents stay quiet.
 */
export function gridStore<TData = unknown, TSlice = GridState<TData>>(
  selector: (state: GridState<TData>) => TSlice = (state) => state as unknown as TSlice,
  isEqual: (a: TSlice, b: TSlice) => boolean = Object.is,
): GridRead<TSlice> {
  const runes = getGridContext<TData>()
  let previous: { slice: TSlice } | null = null
  const slice = $derived.by(() => {
    const next = selector(runes.state)
    if (previous && isEqual(previous.slice, next)) return previous.slice
    previous = { slice: next }
    return next
  })
  return {
    get current() {
      return slice
    },
  }
}

/**
 * Everything a rendered item needs, updated only when its view changes. Pass
 * a getter to follow a reactive id.
 */
export function gridItemView<TData = unknown>(
  itemId: string | (() => string),
): GridRead<GridItemView> {
  const read = typeof itemId === 'function' ? itemId : () => itemId
  return gridStore<TData, GridItemView>((state) => selectItemView(state, read()), itemViewsEqual)
}

/** Imperative layout and selection actions of the nearest provider. Stable for its lifetime. */
export function gridActions<TData = unknown>(): GridActions<TData> {
  return getGridContext<TData>().actions
}

/** The rendered layout (projected onto the measured canvas size) of the nearest provider. */
export function gridLayout<TData = unknown>(): GridRead<GridLayout<TData>> {
  return gridStore<TData, GridLayout<TData>>((state) => state.layout)
}

/** Id of the selected item in the nearest provider, or `null` when nothing is selected. */
export function gridSelection(): GridRead<string | null> {
  return gridStore((state) => state.selectedId)
}
