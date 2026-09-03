/**
 * Lets the repository-wide `tsc --noEmit` see `.svelte` imports (the adapter's
 * `index.ts` and the Svelte test fixtures). Published declarations come from
 * `svelte2tsx` through `scripts/build-svelte.ts`, not from this shim.
 */
declare module '*.svelte' {
  import type { Component } from 'svelte'

  const component: Component<Record<string, unknown>>
  export default component
}
