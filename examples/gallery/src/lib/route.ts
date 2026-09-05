import { useEffect, useState } from 'react'

import { readHashState } from '@gridla/demo-kit'

/**
 * Hash routing without a router: the demo id lives in `#demo=<id>` alongside
 * the demo's own shareable parameters, so the whole gallery works under a
 * static sub-path.
 */
export function currentDemoId(): string {
  return readHashState({ demo: '' }).demo
}

export function demoHref(id: string): string {
  return `#demo=${encodeURIComponent(id)}`
}

export function useHashRoute(): string {
  const [id, setId] = useState(currentDemoId)
  useEffect(() => {
    const onChange = () => setId(currentDemoId())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return id
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia(query).matches,
  )
  useEffect(() => {
    const list = window.matchMedia(query)
    const onChange = () => setMatches(list.matches)
    onChange()
    list.addEventListener('change', onChange)
    return () => list.removeEventListener('change', onChange)
  }, [query])
  return matches
}
