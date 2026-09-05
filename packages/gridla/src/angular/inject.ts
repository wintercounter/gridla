import { inject, type Signal, type ValueEqualityFn } from '@angular/core'

import type { GridActions, GridState } from 'gridla/interaction'
import { GridController } from './controller'
import type { GridItemView } from './view'

/**
 * The `GridController` of the nearest enclosing provider. Call it in an
 * injection context (a constructor or field initializer).
 */
export function injectGridController<TData = unknown>(): GridController<TData> {
  return inject(GridController) as GridController<TData>
}

/**
 * A signal over a slice of the nearest provider's state. Recomputes on every
 * store change and notifies dependents only when `equal` (default `Object.is`)
 * says the slice changed. Call it in an injection context.
 */
export function injectGridStore<TSlice, TData = unknown>(
  selector: (state: GridState<TData>) => TSlice,
  equal?: ValueEqualityFn<TSlice>,
): Signal<TSlice> {
  return injectGridController<TData>().select(selector, equal)
}

/**
 * Everything a rendered item needs, as a signal with structural equality.
 * Pass a static id or a signal (for example an `input`). Call it in an
 * injection context.
 */
export function injectGridItemView(itemId: string | Signal<string>): Signal<GridItemView> {
  return inject(GridController).itemView(itemId)
}

/** Imperative layout and selection actions of the nearest provider. Call it in an injection context. */
export function injectGridActions<TData = unknown>(): GridActions<TData> {
  return injectGridController<TData>().actions
}
