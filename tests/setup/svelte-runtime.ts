/**
 * The Svelte runtime for tests, loaded through the package's export map (see
 * `tests/setup/svelte.ts` for why bare `svelte` imports do not resolve from
 * `tests/`). `svelte` follows the process' compile target: the client entry
 * (`mount`, `flushSync`) by default, the server entry under
 * `GRIDLA_SVELTE_GENERATE=server`.
 */
import type * as Svelte from 'svelte'
import type * as SvelteServer from 'svelte/server'

import { resolveSvelte } from './svelte'

export const svelte = (await import(resolveSvelte('svelte'))) as typeof Svelte
export const svelteServer = (await import(resolveSvelte('svelte/server'))) as typeof SvelteServer
