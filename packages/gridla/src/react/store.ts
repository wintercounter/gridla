import { createGridStore, type GridStore } from '../interaction/store'

/**
 * Minimal external store: a snapshot getter, a subscribe function, and a setter.
 * Shaped for `useSyncExternalStore`. Same shape as `GridStore` from
 * `gridla/interaction`.
 */
export type Store<S> = GridStore<S>

/**
 * Create a `Store` holding `initial`. Listeners fire only when `set` changes the
 * state reference (compared with `Object.is`).
 */
export function createStore<S>(initial: S): Store<S> {
  return createGridStore(initial)
}
