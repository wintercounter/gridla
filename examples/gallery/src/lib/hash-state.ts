import { useCallback, useEffect, useRef, useState } from 'react'

import { readHashState, writeHashState } from '@gridla/demo-kit'

import { currentDemoId } from './route'

export type HashValue = string | number | boolean

/**
 * Demo controls persisted in the URL hash next to the route, so a demo state
 * can be shared as a link. The hash is only written after the first change.
 */
export function useHashState<T extends Record<string, HashValue>>(
  defaults: T,
): [T, (patch: Partial<T>) => void, () => void] {
  const [state, setState] = useState<T>(() => readHashState(defaults))
  const dirty = useRef(false)
  const defaultsRef = useRef(defaults)

  useEffect(() => {
    if (!dirty.current) return
    writeHashState({ demo: currentDemoId(), ...state })
  }, [state])

  const update = useCallback((patch: Partial<T>) => {
    dirty.current = true
    setState((previous) => ({ ...previous, ...patch }))
  }, [])

  const reset = useCallback(() => {
    dirty.current = true
    setState({ ...defaultsRef.current })
  }, [])

  return [state, update, reset]
}
