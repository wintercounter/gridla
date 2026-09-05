import { useEffect, useState } from 'react'

import { readHashState } from '@gridla/demo-kit'

/**
 * Hash routing without a router: the demo id lives in `#demo=<id>` alongside
 * the demo's own shareable parameters, so the whole gallery works under a
 * static sub-path.
 */
/** Alternate ids used by the documentation site's embeds and links. */
const DEMO_ALIASES: Record<string, string> = {
  'static-projection': 'static-layout',
  'min-max-constraints': 'constraints',
  'bounded-scrollable': 'height-modes',
  'programmatic-operations': 'programmatic-ops',
  'policy-comparison': 'strategy-comparison',
  'locked-ghost': 'policies',
  'cross-container-transfer': 'cross-transfer',
  'react-controlled': 'react-persistence',
  'custom-renderer': 'react-custom-chrome',
  'input-methods': 'react-input',
  'multiple-grids': 'react-multi-grid',
  ssr: 'react-ssr',
  stress: 'react-stress',
  'import-export': 'react-presets',
}

export function currentDemoId(): string {
  // Accept both `#demo=<id>&...` and the shorter `#/<id>` form.
  const hash = typeof location === 'undefined' ? '' : location.hash
  const short = hash.match(/^#\/([^&?]+)/)
  const raw = short ? decodeURIComponent(short[1]) : readHashState({ demo: '' }).demo
  return DEMO_ALIASES[raw] ?? raw
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
