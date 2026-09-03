/**
 * Bun plugin that compiles Svelte 5 sources for `bun test`.
 *
 * `.svelte` files and `.svelte.ts`/`.svelte.js` rune modules are compiled with
 * `svelte/compiler` on load. `GRIDLA_SVELTE_GENERATE` picks the target: the
 * default `client` build is what `mount` needs on happy-dom; `server` builds
 * for `render` from `svelte/server`. One process compiles for one target (a
 * module has a single identity), so the SSR tests render in a child process
 * (see `tests/adapters/svelte.test.ts`).
 *
 * `svelte` is installed under `packages/gridla` (an optional peer of the
 * package) and is not visible from `tests/`. Compiled output therefore has
 * its `svelte` imports rewritten to absolute paths through the package's
 * export map, and tests import the runtime through `resolveSvelte`
 * (see `tests/setup/svelte-runtime.ts`).
 */
import { plugin } from 'bun'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { compile, compileModule } from 'svelte/compiler'

const root = resolve(import.meta.dir, '../..')
const pkg = resolve(root, 'packages/gridla')

/** Compile target for this process. */
export const generate: 'client' | 'server' =
  process.env.GRIDLA_SVELTE_GENERATE === 'server' ? 'server' : 'client'

const svelteDir = resolve(pkg, 'node_modules/svelte')
// Without the optional peer installed the plugin stays inert and only the
// Svelte suite fails, not every `bun test` run.
const svelteExports: Record<string, string | Record<string, string>> = existsSync(
  resolve(svelteDir, 'package.json'),
)
  ? (JSON.parse(readFileSync(resolve(svelteDir, 'package.json'), 'utf8')) as { exports: never })
      .exports
  : {}

/**
 * Resolve a `svelte` specifier to an absolute file through the package's
 * export map. The root entry follows the compile target (`browser` build for
 * the client, `default` for the server); other subpaths take `default`.
 */
export function resolveSvelte(specifier: string): string {
  const subpath = specifier === 'svelte' ? '.' : `.${specifier.slice('svelte'.length)}`
  const entry = svelteExports[subpath]
  const target =
    typeof entry === 'string'
      ? entry
      : generate === 'client'
        ? (entry?.browser ?? entry?.default)
        : (entry?.default ?? entry?.browser)
  if (!target) throw new Error(`svelte test plugin: cannot resolve ${specifier}`)
  return resolve(svelteDir, target)
}

type Compiler = { compile: typeof compile; compileModule: typeof compileModule }
let compilerPromise: Promise<Compiler> | null = null
function compiler(): Promise<Compiler> {
  compilerPromise ??= import(resolveSvelte('svelte/compiler')).then(
    (module) => (typeof module.compile === 'function' ? module : module.default) as Compiler,
  )
  return compilerPromise
}

const SPECIFIER = /(\bfrom\s*|\bimport\s*\(?\s*)(['"])(svelte(?:\/[^'"]*)?)\2/g

/** Point every `svelte` import in compiled code at the installed package. */
function rewriteSvelteImports(code: string): string {
  return code.replace(
    SPECIFIER,
    (_match, lead: string, quote: string, specifier: string) =>
      `${lead}${quote}${resolveSvelte(specifier)}${quote}`,
  )
}

async function compileComponent(path: string) {
  const { compile } = await compiler()
  const source = readFileSync(path, 'utf8')
  const result = compile(source, { filename: path, generate, css: 'injected', runes: true })
  return { contents: rewriteSvelteImports(result.js.code), loader: 'js' as const }
}

async function compileRunes(path: string) {
  const { compileModule } = await compiler()
  const source = readFileSync(path, 'utf8')
  // Rune modules keep their TypeScript; strip it so the Svelte compiler sees plain JavaScript.
  const transpiler = new Bun.Transpiler({ loader: path.endsWith('.ts') ? 'ts' : 'js' })
  const result = compileModule(transpiler.transformSync(source), { filename: path, generate })
  return { contents: rewriteSvelteImports(result.js.code), loader: 'js' as const }
}

plugin({
  name: 'gridla-svelte',
  setup(build) {
    build.onLoad({ filter: /\.svelte$/ }, (args) => compileComponent(args.path))
    build.onLoad({ filter: /\.svelte\.(ts|js)$/ }, (args) => compileRunes(args.path))
  },
})
