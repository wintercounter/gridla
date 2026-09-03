#!/usr/bin/env bun
/**
 * Package size budget. Bundles each entry point from the built `dist` with
 * Bun (minified, tree-shaken, React external), gzips it, and compares the
 * result against `size-budget.json`. Run with `--update` to rewrite the
 * budget from the current sizes (plus headroom).
 */
import type { BunPlugin } from 'bun'
import type { compile, compileModule } from 'svelte/compiler'
import { gzipSync } from 'node:zlib'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dir, '..')
const dist = resolve(root, 'packages/gridla/dist')
const budgetPath = resolve(root, 'size-budget.json')
const update = process.argv.includes('--update')

if (!existsSync(resolve(dist, 'index.js'))) {
  console.error('check-size: run `bun run build` first')
  process.exit(1)
}

type Entry = { name: string; file: string; external: string[]; plugins?: BunPlugin[] }

// `dist/svelte/` ships uncompiled `.svelte` components and `.svelte.js` rune
// modules (consumers' bundlers compile them), so the measurement compiles them
// with the Svelte compiler installed under `packages/gridla`.
type SvelteCompiler = { compile: typeof compile; compileModule: typeof compileModule }
const svelteDir = resolve(root, 'packages/gridla/node_modules/svelte')
const sveltePlugin: BunPlugin = {
  name: 'svelte',
  setup(build) {
    const exportsMap = JSON.parse(readFileSync(join(svelteDir, 'package.json'), 'utf8')).exports
    const compilerPath = join(svelteDir, exportsMap['./compiler'].default)
    const compiler = () => import(compilerPath) as Promise<SvelteCompiler>
    build.onLoad({ filter: /\.svelte$/ }, async (args) => {
      const { compile } = await compiler()
      const source = readFileSync(args.path, 'utf8')
      const { js } = compile(source, { filename: args.path, generate: 'client', css: 'external' })
      return { contents: js.code, loader: 'js' }
    })
    build.onLoad({ filter: /\.svelte\.js$/ }, async (args) => {
      const { compileModule } = await compiler()
      const source = readFileSync(args.path, 'utf8')
      return { contents: compileModule(source, { filename: args.path }).js.code, loader: 'js' }
    })
  },
}

const entries: Entry[] = [
  { name: 'gridla', file: 'index.js', external: [] },
  { name: 'gridla/react', file: 'react.js', external: ['react', 'react/jsx-runtime', 'react-dom'] },
  { name: 'gridla/interaction', file: 'interaction.js', external: [] },
  { name: 'gridla/dom', file: 'dom.js', external: [] },
  { name: 'gridla/elements', file: 'elements.js', external: [] },
  { name: 'gridla/vue', file: 'vue.js', external: ['vue'] },
  {
    name: 'gridla/qwik',
    file: 'qwik.qwik.js',
    external: ['@builder.io/qwik', '@builder.io/qwik/jsx-runtime'],
  },
  {
    // The adapter imports the package's own interaction layer, so only the
    // Svelte-specific code is measured.
    name: 'gridla/svelte',
    file: 'svelte/index.js',
    external: ['svelte', 'svelte/*', 'gridla', 'gridla/interaction'],
    plugins: [sveltePlugin],
  },
  {
    name: 'gridla/solid',
    file: 'solid.js',
    external: ['solid-js', 'solid-js/web', 'solid-js/h', 'solid-js/store'],
  },
  {
    // The FESM built by ng-packagr imports the package's own interaction layer,
    // so only the adapter code is measured.
    name: 'gridla/angular',
    file: 'angular/fesm2022/gridla-angular.mjs',
    external: ['@angular/*', 'gridla', 'gridla/interaction'],
  },
]

// Bundle through a wrapper that re-exports the entry. Bun drops the bodies of
// an entry file that consists only of `export { ... } from './chunk.js'`
// (as `dist/interaction.js` does), so measuring the file directly is wrong.
const wrappers = mkdtempSync(join(tmpdir(), 'gridla-size-'))
const results: Record<string, { min: number; gzip: number }> = {}
for (const entry of entries) {
  const wrapper = join(wrappers, `${entry.name.replace(/\W+/g, '-')}.js`)
  writeFileSync(wrapper, `export * from ${JSON.stringify(resolve(dist, entry.file))}\n`)
  const build = await Bun.build({
    entrypoints: [wrapper],
    minify: true,
    target: 'browser',
    format: 'esm',
    external: entry.external,
    plugins: entry.plugins ?? [],
  })
  if (!build.success) {
    console.error(build.logs.map((log) => log.message).join('\n'))
    process.exit(1)
  }
  const code = await build.outputs[0].text()
  results[entry.name] = { min: code.length, gzip: gzipSync(code).length }
}
rmSync(wrappers, { recursive: true, force: true })

type Budget = Record<string, { gzip: number }>
const budget: Budget = existsSync(budgetPath) ? JSON.parse(readFileSync(budgetPath, 'utf8')) : {}

let failed = false
console.log('entry            min      gzip     budget')
for (const [name, size] of Object.entries(results)) {
  const limit = budget[name]?.gzip
  const status = limit === undefined ? 'no budget' : size.gzip <= limit ? 'ok' : 'OVER'
  if (status === 'OVER') failed = true
  console.log(
    `${name.padEnd(16)} ${String(size.min).padStart(7)} ${String(size.gzip).padStart(8)} ${String(limit ?? '-').padStart(8)}  ${status}`,
  )
}

if (update) {
  const next: Budget = {}
  for (const [name, size] of Object.entries(results)) {
    next[name] = { gzip: Math.ceil((size.gzip * 1.1) / 100) * 100 }
  }
  writeFileSync(budgetPath, `${JSON.stringify(next, null, 2)}\n`)
  console.log(`size-budget.json updated`)
  process.exit(0)
}
process.exit(failed ? 1 : 0)
