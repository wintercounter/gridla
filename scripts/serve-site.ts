#!/usr/bin/env bun
/**
 * Static server for the built site artifact, mounted under a base path so
 * tests exercise the exact URLs GitHub Pages serves. Deep links fall back to
 * the artifact's 404.html like Pages does.
 */
import { existsSync, statSync } from 'node:fs'
import { resolve, join } from 'node:path'

const args = new Map<string, string>()
for (let i = 2; i < process.argv.length; i += 2) {
  args.set(process.argv[i].replace(/^--/, ''), process.argv[i + 1] ?? '')
}
const dir = resolve(process.cwd(), args.get('dir') ?? 'site-dist')
const port = Number(args.get('port') ?? 4173)
const base = (args.get('base') ?? '/').replace(/\/?$/, '/')

if (!existsSync(dir)) {
  console.error(`serve-site: directory ${dir} does not exist; run scripts/build-site.ts first`)
  process.exit(1)
}

function resolveFile(pathname: string): string | null {
  if (!pathname.startsWith(base)) return null
  const rel = decodeURIComponent(pathname.slice(base.length))
  if (rel.includes('..')) return null
  const candidates = [join(dir, rel), join(dir, rel, 'index.html'), `${join(dir, rel)}.html`]
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  }
  return null
}

Bun.serve({
  port,
  hostname: '127.0.0.1',
  fetch(request) {
    const url = new URL(request.url)
    if (url.pathname === '/' || url.pathname === base.slice(0, -1)) {
      return Response.redirect(`${url.origin}${base}`, 302)
    }
    const file = resolveFile(url.pathname)
    if (file) return new Response(Bun.file(file))
    const notFound = join(dir, '404.html')
    if (existsSync(notFound)) return new Response(Bun.file(notFound), { status: 404 })
    return new Response('not found', { status: 404 })
  },
})
console.log(`serving ${dir} at http://127.0.0.1:${port}${base}`)
