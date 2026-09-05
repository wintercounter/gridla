#!/usr/bin/env bun
/**
 * After a publish, install the exact version from the public registry into a
 * temporary directory and run the vanilla and React smoke consumers against
 * it. Fails if the registry does not serve the version or the consumers break.
 */
import { mkdtempSync, readFileSync, writeFileSync, cpSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

const root = resolve(import.meta.dir, '..')
const pkg = JSON.parse(readFileSync(resolve(root, 'packages/gridla/package.json'), 'utf8')) as {
  version: string
}
const published = process.env.PUBLISHED_PACKAGES
  ? (JSON.parse(process.env.PUBLISHED_PACKAGES) as Array<{ name: string; version: string }>)
  : [{ name: 'gridla', version: pkg.version }]
const version = published.find((entry) => entry.name === 'gridla')?.version ?? pkg.version

const run = (cmd: string[], cwd: string) => {
  const proc = Bun.spawnSync(cmd, { cwd, stdio: ['inherit', 'inherit', 'inherit'] })
  if (proc.exitCode !== 0) {
    console.error(`command failed: ${cmd.join(' ')}`)
    process.exit(proc.exitCode ?? 1)
  }
}

// Wait for the registry to serve the version (propagation can lag a little).
let served = false
for (let attempt = 0; attempt < 20 && !served; attempt += 1) {
  const view = Bun.spawnSync(['npm', 'view', `gridla@${version}`, 'version'], { cwd: root })
  served = view.exitCode === 0 && view.stdout.toString().trim() === version
  if (!served) await Bun.sleep(15_000)
}
if (!served) {
  console.error(`gridla@${version} is not served by the registry`)
  process.exit(1)
}

const dir = mkdtempSync(resolve(tmpdir(), 'gridla-published-'))
for (const consumer of ['vanilla-esm', 'react-consumer']) {
  const target = resolve(dir, consumer)
  cpSync(resolve(root, 'tests/package/consumers', consumer), target, { recursive: true })
  const manifestPath = resolve(target, 'package.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>
  manifest.dependencies = { ...(manifest.dependencies as object), gridla: version }
  delete manifest.workspaces
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
  run(['npm', 'install', '--no-audit', '--no-fund'], target)
  const entry = consumer === 'vanilla-esm' ? 'main.mjs' : 'main.tsx'
  run(consumer === 'vanilla-esm' ? ['node', entry] : ['bun', entry], target)
}
console.log(`gridla@${version} verified from the public registry`)
