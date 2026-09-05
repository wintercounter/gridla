/**
 * Minimal external store used by `createGridController`. The store object is
 * stable for the controller's lifetime, so it can be shared freely; consumers
 * subscribe to slices (React does so through `useSyncExternalStore`).
 */

/** Callback invoked after the store state changes. */
export type GridStoreListener = () => void

/**
 * Minimal external store: a snapshot getter, a subscribe function, and a setter.
 * Shaped for `useSyncExternalStore`.
 */
export type GridStore<S> = {
  getSnapshot: () => S
  subscribe: (listener: GridStoreListener) => () => void
  /** Replace the state. Listeners fire only when the reference changes. */
  set: (next: S | ((prev: S) => S)) => void
}

/**
 * Create a `GridStore` holding `initial`. Listeners fire only when `set` changes
 * the state reference (compared with `Object.is`).
 */
export function createGridStore<S>(initial: S): GridStore<S> {
  let state = initial
  const listeners = new Set<GridStoreListener>()
  return {
    getSnapshot: () => state,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    set: (next) => {
      const resolved = typeof next === 'function' ? (next as (prev: S) => S)(state) : next
      if (Object.is(resolved, state)) return
      state = resolved
      for (const listener of listeners) listener()
    },
  }
}
