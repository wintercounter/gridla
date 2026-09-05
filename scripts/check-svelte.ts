#!/usr/bin/env bun
/**
 * Type-check the Svelte adapter sources (`packages/gridla/src/svelte/`) with
 * `svelte-check`, which understands `.svelte` files and runes where `tsc` and
 * oxlint do not. Runs against `tsconfig.svelte.json`, so `gridla` and
 * `gridla/interaction` resolve through the package export map to the built
 * `dist/*.d.ts`; run `bun run build` first. `svelte-check` needs the
 * TypeScript 5 compiler API (see `scripts/svelte-typescript-preload.ts`).
 */
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dir, '..')
const pkg = resolve(root, 'packages/gridla')

if (!existsSync(resolve(pkg, 'dist/interaction.d.ts'))) {
  console.error('check-svelte: run `bun run build` first (dist/interaction.d.ts is missing)')
  process.exit(1)
}

const bin = resolve(pkg, 'node_modules/svelte-check/bin/svelte-check')
const proc = Bun.spawnSync({
  cmd: [
    'bun',
    '--preload',
    resolve(root, 'scripts/svelte-typescript-preload.ts'),
    bin,
    '--tsconfig',
    './tsconfig.svelte.json',
    '--fail-on-warnings',
    ...process.argv.slice(2),
  ],
  cwd: pkg,
  stdio: ['inherit', 'inherit', 'inherit'],
})
process.exit(proc.exitCode ?? 1)
