/**
 * Renders `SvelteDashboard.svelte` on the server and prints the markup. Run by
 * `tests/adapters/svelte.test.ts` in a child process with
 * `GRIDLA_SVELTE_GENERATE=server`, because one process compiles Svelte for one
 * target only (see `tests/setup/svelte.ts`).
 */
import { svelteServer } from '../../setup/svelte-runtime'
import Dashboard from './SvelteDashboard.svelte'

const layout = JSON.parse(process.argv[2] ?? '{}')
const ids = (layout.items ?? []).map((item: { id: string }) => item.id)
const { body, head } = svelteServer.render(Dashboard, { props: { defaultLayout: layout, ids } })
process.stdout.write(JSON.stringify({ body, head }))
