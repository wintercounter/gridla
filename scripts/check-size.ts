#!/usr/bin/env bun
/**
 * Package size budget. Bundles each entry point from the built `dist` with
 * Bun (minified, tree-shaken, React external), gzips it, and compares the
 * result against `size-budget.json`. Run with `--update` to rewrite the
 * budget from the current sizes (plus headroom).
 */
import { gzipSync } from 'node:zlib'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dir, '..')
const dist = resolve(root, 'packages/gridla/dist')
const budgetPath = resolve(root, 'size-budget.json')
const update = process.argv.includes('--update')

if (!existsSync(resolve(dist, 'index.js'))) {
  console.error('check-size: run `bun run build` first')
  process.exit(1)
}

type Entry = { name: string; file: string; external: string[] }
const entries: Entry[] = [
  { name: 'gridla', file: 'index.js', external: [] },
  { name: 'gridla/react', file: 'react.js', external: ['react', 'react/jsx-runtime', 'react-dom'] },
]

const results: Record<string, { min: number; gzip: number }> = {}
for (const entry of entries) {
  const build = await Bun.build({
    entrypoints: [resolve(dist, entry.file)],
    minify: true,
    target: 'browser',
    format: 'esm',
    external: entry.external,
  })
  if (!build.success) {
    console.error(build.logs.map((log) => log.message).join('\n'))
    process.exit(1)
  }
  const code = await build.outputs[0].text()
  results[entry.name] = { min: code.length, gzip: gzipSync(code).length }
}

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
