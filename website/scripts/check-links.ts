/**
 * Crawl the built site and fail on internal links to missing files.
 *
 * Scans every `.html` file under `doc_build` for `href` and `src` attributes,
 * resolves each internal target against the output directory (respecting the
 * `/gridla/` base), and reports anything that does not exist. Links to the
 * companion apps (`/gridla/gallery/`, `/gridla/studio/`) are deployed by CI
 * next to the site, so they are counted but not required to exist locally.
 *
 * Run with `bun run check-links` from `website/` after `bun run build`.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'

const WEBSITE_DIR = path.resolve(import.meta.dir, '..')
const OUT_DIR = path.join(WEBSITE_DIR, 'doc_build')
const BASE = '/gridla/'
const APP_PREFIXES = [`${BASE}gallery/`, `${BASE}studio/`]

type Problem = { file: string; target: string; reason: string }

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (entry.name.endsWith('.html')) out.push(full)
  }
  return out
}

function isExternal(target: string): boolean {
  return /^(https?:|mailto:|tel:|data:|javascript:|\/\/)/i.test(target)
}

/** Candidate files a URL path may map to in a static output directory. */
function candidates(urlPath: string): string[] {
  const rel = urlPath.slice(BASE.length)
  const base = path.join(OUT_DIR, rel)
  const list = [base]
  if (urlPath.endsWith('/')) list.push(path.join(base, 'index.html'))
  else if (!path.extname(rel)) list.push(`${base}.html`, path.join(base, 'index.html'))
  return list
}

const ATTR = /\b(?:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi

if (!fs.existsSync(OUT_DIR)) {
  console.error(`check-links: ${OUT_DIR} does not exist; run \`bun run build\` first`)
  process.exit(1)
}

const files = walk(OUT_DIR)
const problems: Problem[] = []
let checked = 0
let appLinks = 0
let external = 0

for (const file of files) {
  const html = fs.readFileSync(file, 'utf8')
  const fromDir = path.dirname(file)
  for (const match of html.matchAll(ATTR)) {
    const raw = (match[1] ?? match[2] ?? '').trim()
    if (!raw || raw.startsWith('#')) continue
    if (isExternal(raw)) {
      external += 1
      continue
    }
    const target = raw.replace(/[?#].*$/, '')
    if (!target) continue

    let urlPath: string
    if (target.startsWith('/')) {
      if (!target.startsWith(BASE)) {
        problems.push({ file, target: raw, reason: `absolute link outside base ${BASE}` })
        continue
      }
      urlPath = target
    } else {
      const abs = path.resolve(fromDir, target)
      urlPath = `${BASE}${path.relative(OUT_DIR, abs).replace(/\\/g, '/')}`
      if (target.endsWith('/')) urlPath += '/'
    }

    if (APP_PREFIXES.some((prefix) => urlPath.startsWith(prefix) || `${urlPath}/` === prefix)) {
      appLinks += 1
      continue
    }

    checked += 1
    const exists = candidates(urlPath).some((candidate) => fs.existsSync(candidate))
    if (!exists) problems.push({ file, target: raw, reason: 'missing file' })
  }
}

for (const required of [
  'sitemap.xml',
  'llms.txt',
  'llms-full.txt',
  '404.html',
  'favicon.svg',
  'social-card.svg',
]) {
  if (!fs.existsSync(path.join(OUT_DIR, required))) {
    problems.push({ file: OUT_DIR, target: required, reason: 'expected output file missing' })
  }
}

process.stdout.write(
  `check-links: ${files.length} pages, ${checked} internal targets checked, ${appLinks} companion-app links, ${external} external links skipped\n`,
)

if (problems.length > 0) {
  const unique = new Map<string, Problem>()
  for (const problem of problems) unique.set(`${problem.file}|${problem.target}`, problem)
  console.error(`check-links: ${unique.size} problems`)
  for (const problem of unique.values()) {
    console.error(
      `  ${path.relative(OUT_DIR, problem.file)} → ${problem.target} (${problem.reason})`,
    )
  }
  process.exit(1)
}
