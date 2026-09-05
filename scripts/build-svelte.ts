#!/usr/bin/env bun
/**
 * Build `gridla/svelte`. Svelte components cannot go through rslib, so the
 * `packages/gridla/src/svelte/` sources are packaged with `@sveltejs/package`
 * into `packages/gridla/dist/svelte/`: `.svelte` files with their TypeScript
 * stripped, `.svelte.ts` and `.ts` modules transpiled to JavaScript, and a
 * `.d.ts` per file (declarations come from `svelte2tsx`, which needs the
 * TypeScript 5 compiler API; see `scripts/svelte-typescript-preload.ts`).
 *
 * Runs after `rslib build` (the package `build` script chains it) because the
 * adapter imports `gridla` and `gridla/interaction` through the package's own
 * export map, and the declaration emit resolves those to `dist/*.d.ts`.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import './svelte-typescript-preload'

const root = resolve(import.meta.dir, '..')
const pkg = resolve(root, 'packages/gridla')

if (!existsSync(resolve(pkg, 'dist/interaction.d.ts'))) {
  console.error('build-svelte: run `rslib build` first (dist/interaction.d.ts is missing)')
  process.exit(1)
}

// `@sveltejs/package` exposes only a CLI; its `build` function is imported
// from the package source next to `package.json`.
const packagerDir = resolve(Bun.resolveSync('@sveltejs/package/package.json', pkg), '..')
const packager = await import(resolve(packagerDir, 'src/index.js'))
await packager.build({
  cwd: pkg,
  input: 'src/svelte',
  output: 'dist/svelte',
  preserve_output: false,
  types: true,
  tsconfig: 'tsconfig.svelte.json',
  config: {},
})

// Declaration files re-export the components as `./X.svelte`, which only the
// `bundler` resolution maps to the sibling `X.svelte.d.ts`; `node16` (used by
// consumers on NodeNext and by attw) does not. `./X.svelte.js` resolves to the
// same declaration under both. The JavaScript keeps `./X.svelte` for bundlers.
const out = resolve(pkg, 'dist/svelte')
for (const name of readdirSync(out)) {
  if (!name.endsWith('.d.ts')) continue
  const file = resolve(out, name)
  const text = readFileSync(file, 'utf8')
  const next = text.replace(/(from\s+['"]\.\/[^'"]+\.svelte)(['"])/g, '$1.js$2')
  if (next !== text) writeFileSync(file, next)
}
