/**
 * Minimal external store used by `GridProvider`. The store object is stable
 * for the provider's lifetime, so it can live in context without causing
 * rerenders. Components subscribe to slices through `useSyncExternalStore`.
 */

export type Listener = () => void

export type Store<S> = {
  getSnapshot: () => S
  subscribe: (listener: Listener) => () => void
  /** Replace the state. Listeners fire only when the reference changes. */
  set: (next: S | ((prev: S) => S)) => void
}

export function createStore<S>(initial: S): Store<S> {
  let state = initial
  const listeners = new Set<Listener>()
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
