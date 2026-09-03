#!/usr/bin/env bun
/**
 * Assemble the GitHub Pages artifact: the Rspress site at the root, the
 * gallery under /gallery/, the studio under /studio/, and the basic examples
 * under /examples/. Every app is built with the correct asset prefix so the
 * result works beneath the repository base path.
 */
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dir, '..')
const base = process.env.SITE_BASE ?? '/gridla/'
const out = resolve(root, process.env.SITE_OUT ?? 'site-dist')

const apps: Array<{ dir: string; sub: string; dist: string }> = [
  { dir: 'website', sub: '', dist: 'doc_build' },
  { dir: 'examples/gallery', sub: 'gallery/', dist: 'dist' },
  { dir: 'examples/studio', sub: 'studio/', dist: 'dist' },
  { dir: 'examples/vanilla-basics', sub: 'examples/vanilla/', dist: 'dist' },
  { dir: 'examples/react-basics', sub: 'examples/react/', dist: 'dist' },
]

rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })

for (const app of apps) {
  const cwd = resolve(root, app.dir)
  if (!existsSync(resolve(cwd, 'package.json'))) {
    console.warn(`skipping ${app.dir}: not present`)
    continue
  }
  const prefix = `${base}${app.sub}`
  console.log(`building ${app.dir} with prefix ${prefix}`)
  const proc = Bun.spawnSync(['bun', 'run', 'build'], {
    cwd,
    env: { ...process.env, ASSET_PREFIX: prefix, SITE_BASE: base },
    stdio: ['inherit', 'inherit', 'inherit'],
  })
  if (proc.exitCode !== 0) process.exit(proc.exitCode ?? 1)
  cpSync(resolve(cwd, app.dist), resolve(out, app.sub), { recursive: true })
}

// Stamp the deployed revision so the Pages workflow can verify it.
const sha =
  process.env.GITHUB_SHA ??
  Bun.spawnSync(['git', 'rev-parse', 'HEAD'], { cwd: root }).stdout.toString().trim()
writeFileSync(resolve(out, 'revision.txt'), `${sha}\n`)
const indexPath = resolve(out, 'index.html')
if (existsSync(indexPath)) {
  const html = await Bun.file(indexPath).text()
  writeFileSync(
    indexPath,
    html.replace('</head>', `<meta name="gridla-revision" content="${sha}"></head>`),
  )
}
writeFileSync(resolve(out, '.nojekyll'), '')
console.log(`site artifact ready at ${out}`)
