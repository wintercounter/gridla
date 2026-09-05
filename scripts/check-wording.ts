#!/usr/bin/env bun
/**
 * Fails when any tracked (or staged) text file contains a phrase from the
 * private banned-words list. The list lives outside version control; when it
 * is missing the check is skipped so CI still passes.
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dir, '..')
const listPath = resolve(root, 'docs/private/banned-words.txt')
if (!existsSync(listPath)) {
  console.log('check-wording: no private word list, skipping')
  process.exit(0)
}
const words = readFileSync(listPath, 'utf8')
  .split('\n')
  .map((line) => line.trim().toLowerCase())
  .filter((line) => line && !line.startsWith('#'))

const proc = Bun.spawnSync(['git', 'ls-files', '--cached', '--others', '--exclude-standard'], {
  cwd: root,
})
const files = proc.stdout
  .toString()
  .split('\n')
  .filter(
    (file) => file && /\.(ts|tsx|js|jsx|mjs|cjs|json|md|mdx|css|html|yml|yaml|txt|svg)$/.test(file),
  )
  .filter(
    (file) => !file.startsWith('docs/') && !file.includes('node_modules/') && file !== 'bun.lock',
  )

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const patterns = words.map((word) => new RegExp(`(?<![a-z0-9])${escape(word)}(?![a-z0-9])`, 'gi'))

let failures = 0
for (const file of files) {
  const text = readFileSync(resolve(root, file), 'utf8')
  patterns.forEach((pattern, index) => {
    for (const match of text.matchAll(pattern)) {
      const line = text.slice(0, match.index).split('\n').length
      console.error(`${file}:${line}: contains banned phrase (#${index + 1})`)
      failures += 1
    }
  })
}
if (failures > 0) {
  console.error(`check-wording: ${failures} hit(s)`)
  process.exit(1)
}
console.log(`check-wording: ${files.length} files clean`)
