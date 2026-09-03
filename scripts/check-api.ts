#!/usr/bin/env bun
/**
 * Public API surface snapshot. Lists every export of the built declaration
 * files (`dist/index.d.ts`, `dist/react.d.ts`) with its kind and compares the
 * list to `api-surface.txt`. Any difference fails, so removing or renaming an
 * export is always a deliberate change reviewed in the diff. Run with
 * `--update` to accept the current surface.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dir, '..')
const dist = resolve(root, 'packages/gridla/dist')
const snapshotPath = resolve(root, 'api-surface.txt')
const update = process.argv.includes('--update')

function surfaceOf(file: string, entry: string): string[] {
  const text = readFileSync(resolve(dist, file), 'utf8')
  const lines: string[] = []
  const patterns: Array<[RegExp, string]> = [
    [/^export declare function (\w+)/gm, 'function'],
    [/^export declare const (\w+)/gm, 'const'],
    [/^export type (\w+)/gm, 'type'],
    [/^export interface (\w+)/gm, 'type'],
    [/^export declare type (\w+)/gm, 'type'],
    [/^export declare class (\w+)/gm, 'class'],
  ]
  for (const [pattern, kind] of patterns) {
    for (const match of text.matchAll(pattern)) lines.push(`${entry} ${kind} ${match[1]}`)
  }
  // Re-exported names: `export { a, b as c, type D }`
  for (const match of text.matchAll(/^export \{([^}]+)\}/gm)) {
    for (const part of match[1].split(',')) {
      const name = part
        .trim()
        .replace(/^type /, '')
        .split(/\s+as\s+/)
        .pop()
      if (name) lines.push(`${entry} export ${name}`)
    }
  }
  return lines
}

if (!existsSync(resolve(dist, 'index.d.ts'))) {
  console.error('check-api: run `bun run build` first')
  process.exit(1)
}

const surface = [...surfaceOf('index.d.ts', 'gridla'), ...surfaceOf('react.d.ts', 'gridla/react')]
  .filter((line, index, all) => all.indexOf(line) === index)
  .sort()
const current = `${surface.join('\n')}\n`

if (update || !existsSync(snapshotPath)) {
  writeFileSync(snapshotPath, current)
  console.log(`api-surface.txt written with ${surface.length} entries`)
  process.exit(0)
}

const previous = readFileSync(snapshotPath, 'utf8')
if (previous === current) {
  console.log(`check-api: ${surface.length} exports, unchanged`)
  process.exit(0)
}
const before = new Set(previous.split('\n').filter(Boolean))
const after = new Set(surface)
for (const line of before) if (!after.has(line)) console.error(`- ${line}`)
for (const line of after) if (!before.has(line)) console.error(`+ ${line}`)
console.error('check-api: public surface changed; review and run with --update to accept')
process.exit(1)
