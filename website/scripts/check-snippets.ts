/**
 * Type-check every `ts` and `tsx` code block in the hand-written docs against
 * the library source, so samples cannot drift from the real API.
 *
 * Each fenced block becomes a module in a scratch directory (blocks with a
 * `title="name.ts"` fence attribute keep that file name so they can import
 * each other within a page). `gridla` and `gridla/react` resolve to
 * `packages/gridla/src`. Generated API pages are skipped: their code blocks
 * are declaration excerpts, not programs.
 *
 * Run with `bun run check-snippets` from `website/`.
 */

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import ts from 'typescript'

const WEBSITE_DIR = path.resolve(import.meta.dir, '..')
const REPO_DIR = path.resolve(WEBSITE_DIR, '..')
const DOCS_DIR = path.join(WEBSITE_DIR, 'docs')
const SRC_DIR = path.join(REPO_DIR, 'packages/gridla/src')

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name !== 'api' && entry.name !== 'public') walk(full, out)
    } else if (entry.name.endsWith('.mdx') || entry.name.endsWith('.md')) out.push(full)
  }
  return out
}

const FENCE = /^```(tsx|ts)([^\n]*)\n([\s\S]*?)^```/gm

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'gridla-snippets-'))
const files: string[] = []
const origin = new Map<string, { page: string; index: number }>()

for (const page of walk(DOCS_DIR)) {
  const text = fs.readFileSync(page, 'utf8')
  const pageDir = path.join(scratch, path.relative(DOCS_DIR, page).replace(/\.mdx?$/, ''))
  let index = 0
  for (const match of text.matchAll(FENCE)) {
    index += 1
    const [, lang, meta, code] = match
    const title = /title="([^"]+)"/.exec(meta ?? '')?.[1]
    const name = title ?? `snippet-${index}.${lang}`
    const file = path.join(pageDir, name)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, code)
    files.push(file)
    origin.set(file, { page: path.relative(WEBSITE_DIR, page), index })
  }
}

const program = ts.createProgram(files, {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  jsx: ts.JsxEmit.ReactJSX,
  strict: true,
  skipLibCheck: true,
  noEmit: true,
  lib: ['lib.es2023.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
  types: ['react', 'react-dom', 'bun'],
  typeRoots: [path.join(REPO_DIR, 'node_modules/@types')],
  baseUrl: REPO_DIR,
  paths: {
    gridla: [path.join(SRC_DIR, 'index.ts')],
    'gridla/react': [path.join(SRC_DIR, 'react.ts')],
    'gridla/dom': [path.join(SRC_DIR, 'dom.ts')],
    'gridla/elements': [path.join(SRC_DIR, 'elements.ts')],
    'gridla/solid': [path.join(SRC_DIR, 'solid.ts')],
    'solid-js': [path.join(REPO_DIR, 'packages/gridla/node_modules/solid-js')],
    'solid-js/*': [path.join(REPO_DIR, 'packages/gridla/node_modules/solid-js/*')],
    'gridla/vue': [path.join(SRC_DIR, 'vue.ts')],
    'gridla/svelte': [path.join(SRC_DIR, 'svelte/index.ts')],
    svelte: [path.join(REPO_DIR, 'packages/gridla/node_modules/svelte')],
    'svelte/elements': [path.join(REPO_DIR, 'packages/gridla/node_modules/svelte/elements.d.ts')],
    'gridla/interaction': [path.join(SRC_DIR, 'interaction.ts')],
    'gridla/qwik': [path.join(SRC_DIR, 'qwik.ts')],
    '@builder.io/qwik': [
      path.join(REPO_DIR, 'packages/gridla/node_modules/@builder.io/qwik/dist/core.d.ts'),
    ],
    '@builder.io/qwik/jsx-runtime': [
      path.join(REPO_DIR, 'packages/gridla/node_modules/@builder.io/qwik/dist/jsx-runtime.d.ts'),
    ],
    '@builder.io/qwik/server': [
      path.join(REPO_DIR, 'packages/gridla/node_modules/@builder.io/qwik/dist/server.d.ts'),
    ],
    'gridla/angular': [path.join(SRC_DIR, 'angular/index.ts')],
    '@angular/*': [path.join(REPO_DIR, 'packages/gridla/node_modules/@angular/*')],
    vue: [path.join(REPO_DIR, 'packages/gridla/node_modules/vue')],
    'vue/*': [path.join(REPO_DIR, 'packages/gridla/node_modules/vue/*')],
    react: [path.join(REPO_DIR, 'node_modules/@types/react/index.d.ts')],
    'react-dom/server': [path.join(REPO_DIR, 'node_modules/@types/react-dom/server.d.ts')],
    'bun:test': [
      path.join(REPO_DIR, 'node_modules/.bun/bun-types@1.4.0/node_modules/bun-types/test.d.ts'),
    ],
  },
})

const diagnostics = ts.getPreEmitDiagnostics(program).filter((diagnostic) => {
  const file = diagnostic.file?.fileName
  return file !== undefined && file.startsWith(scratch)
})

fs.rmSync(scratch, { recursive: true, force: true })

if (diagnostics.length === 0) {
  process.stdout.write(`check-snippets: ${files.length} code blocks type-check\n`)
  process.exit(0)
}

console.error(`check-snippets: ${diagnostics.length} errors in ${files.length} code blocks`)
for (const diagnostic of diagnostics) {
  const file = diagnostic.file
  if (!file) continue
  const where = origin.get(file.fileName)
  const { line } = file.getLineAndCharacterOfPosition(diagnostic.start ?? 0)
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
  console.error(
    `  ${where?.page ?? file.fileName} block ${where?.index ?? '?'} line ${line + 1}: ${message}`,
  )
}
process.exit(1)
