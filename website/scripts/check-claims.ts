/**
 * Run the result claims in the hand-written docs against the library source.
 *
 * `check-snippets` proves the samples type-check; this script proves the
 * `// <literal>` comments next to them are true. Every `ts`/`tsx` block that
 * imports from `gridla` (and not from `gridla/react` or `react`, which need a
 * DOM) is extracted, its top-level expression statements that end in a claim
 * comment are turned into assertions, and the block is executed with `bun`.
 *
 * A claim comment is a literal: a string, number, boolean, `null`,
 * `undefined`, an object or array literal, or bare `key: value` pairs. Prose
 * after ` — `, ` - `, or `;` is ignored, and a comment that is only prose is
 * skipped. Objects containing `...` (or `{...}` placeholders) and bare
 * `key: value` pairs are matched partially (`toMatchObject` semantics);
 * everything else is compared exactly (deep equality for objects and arrays).
 *
 * `declare const x: T` in a block is resolved from a top-level `const x`
 * declared in an earlier block on the same page, so a page can build on a
 * layout it introduced above.
 *
 * Run with `bun run check-claims` from `website/`.
 */

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { spawnSync } from 'node:child_process'

import ts from 'typescript'

const WEBSITE_DIR = path.resolve(import.meta.dir, '..')
const REPO_DIR = path.resolve(WEBSITE_DIR, '..')
const DOCS_DIR = path.join(WEBSITE_DIR, 'docs')
const GRIDLA_ENTRY = path.join(REPO_DIR, 'packages/gridla/src/index.ts')

const MARKER = '__GRIDLA_CLAIM__'

type Claim = {
  line: number
  expression: string
  expected: string
  mode: 'exact' | 'partial'
}

type Block = {
  page: string
  index: number
  startLine: number
  code: string
}

type Failure = {
  page: string
  line: number
  expression: string
  expected: string
  actual: string
}

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

function extractBlocks(page: string): Block[] {
  const text = fs.readFileSync(page, 'utf8')
  const blocks: Block[] = []
  let index = 0
  for (const match of text.matchAll(FENCE)) {
    index += 1
    const code = match[3]
    const startLine = text.slice(0, match.index).split('\n').length + 1
    blocks.push({ page: path.relative(WEBSITE_DIR, page), index, startLine, code })
  }
  return blocks
}

function importsFrom(code: string, specifier: string): boolean {
  return new RegExp(`from\\s+['"]${specifier.replace('/', '\\/')}['"]`).test(code)
}

/** Parse the text after `//` into an expected-value source, or null for prose. */
function parseClaim(comment: string): { expected: string; mode: Claim['mode'] } | null {
  let text = comment.replace(/^\/\/\s*/, '').trim()
  // Drop trailing prose: "'push-x' — chart slid right", "true; see below".
  text = text.split(/\s+[—–-]\s+|;\s+/)[0].trim()
  if (text === '') return null

  if (/^(['"]).*\1$/.test(text)) return { expected: text, mode: 'exact' }
  if (/^(true|false|null|undefined|-?\d+(\.\d+)?)$/.test(text)) {
    return { expected: text, mode: 'exact' }
  }
  if (/^\[.*\]$/.test(text)) return { expected: text, mode: 'exact' }
  if (/^\{.*\}$/.test(text)) {
    const partial = text.includes('...')
    const expected = text
      .replace(/\{\s*\.\.\.\s*\}/g, '__ANY__')
      .replace(/,\s*\.\.\.\s*(?=[},])/g, '')
      .replace(/\.\.\./g, '')
    return isExpression(expected) ? { expected, mode: partial ? 'partial' : 'exact' } : null
  }
  // Bare `x: 16, y: 16` pairs are a partial object.
  if (/^[A-Za-z_$][\w$]*\s*:\s*[^,]+(,\s*[A-Za-z_$][\w$]*\s*:\s*[^,]+)*$/.test(text)) {
    const expected = `{ ${text} }`
    return isExpression(expected) ? { expected, mode: 'partial' } : null
  }
  return null
}

function isExpression(source: string): boolean {
  try {
    new Function(`return (${source})`)
    return true
  } catch {
    return false
  }
}

/** Find top-level expression statements with a trailing claim comment. */
function findClaims(code: string): { claims: Claim[]; statements: ts.ExpressionStatement[] } {
  const source = ts.createSourceFile('block.ts', code, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS)
  const claims: Claim[] = []
  const statements: ts.ExpressionStatement[] = []
  for (const statement of source.statements) {
    if (!ts.isExpressionStatement(statement)) continue
    const ranges = ts.getTrailingCommentRanges(code, statement.end) ?? []
    const range = ranges.find((r) => r.kind === ts.SyntaxKind.SingleLineCommentTrivia)
    if (!range) continue
    const parsed = parseClaim(code.slice(range.pos, range.end))
    if (!parsed) continue
    const { line } = source.getLineAndCharacterOfPosition(statement.getStart(source))
    claims.push({
      line,
      expression: statement.expression.getText(source),
      expected: parsed.expected,
      mode: parsed.mode,
    })
    statements.push(statement)
  }
  return { claims, statements }
}

const HARNESS = `
const __ANY__ = Symbol.for('${MARKER}.any')
function __matches(actual, expected, partial) {
  if (expected === __ANY__) return true
  if (Object.is(actual, expected)) return true
  if (typeof actual !== 'object' || typeof expected !== 'object' || actual === null || expected === null) return false
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) return false
    return expected.every((value, i) => __matches(actual[i], value, partial))
  }
  if (Array.isArray(actual)) return false
  const keys = Object.keys(expected)
  if (!partial && Object.keys(actual).length !== keys.length) return false
  return keys.every((key) => key in actual && __matches(actual[key], expected[key], partial))
}
function __show(value) {
  return JSON.stringify(value, (_k, v) => (v === __ANY__ ? '{...}' : v === undefined ? '__undefined__' : v))
}
function __claim(line, expression, evaluate, expected, mode) {
  let actual
  try {
    actual = evaluate()
  } catch (error) {
    console.log('${MARKER}' + JSON.stringify({ line, expression, expected: __show(expected), actual: 'threw ' + String(error) }))
    return
  }
  const ok = __matches(actual, expected, mode === 'partial')
  console.log('${MARKER}' + JSON.stringify({ line, expression, expected: __show(expected), actual: ok ? null : __show(actual) }))
}
`

/** Splice a `const NAME` declaration from an earlier block into this one. */
function resolveDeclares(block: Block, earlier: Block[]): string {
  let code = block.code
  const DECLARE = /^declare const (\w+)\s*:[^\n]*\n/gm
  for (const match of code.matchAll(DECLARE)) {
    const name = match[1]
    for (const prev of [...earlier].reverse()) {
      const prevSource = ts.createSourceFile(
        'prev.ts',
        prev.code,
        ts.ScriptTarget.ES2022,
        true,
        ts.ScriptKind.TS,
      )
      const declaration = prevSource.statements.find(
        (statement) =>
          ts.isVariableStatement(statement) &&
          !statement.modifiers?.some((m) => m.kind === ts.SyntaxKind.DeclareKeyword) &&
          statement.declarationList.declarations.some(
            (d) => ts.isIdentifier(d.name) && d.name.text === name,
          ),
      )
      if (!declaration) continue
      const imports = prevSource.statements
        .filter(ts.isImportDeclaration)
        .map((statement) => statement.getText(prevSource))
        .join('\n')
      code = code.replace(match[0], `${declaration.getText(prevSource)}\n`)
      code = `${imports}\n${code}`
      break
    }
  }
  return code
}

function transform(block: Block, earlier: Block[]): { code: string; claims: Claim[] } | null {
  // Line numbers come from the original block; the resolved code may have
  // extra lines spliced in above the claims.
  const original = findClaims(block.code).claims
  if (original.length === 0) return null
  const resolved = resolveDeclares(block, earlier)
  const { claims, statements } = findClaims(resolved)
  if (claims.length !== original.length) {
    throw new Error(`${block.page} block ${block.index}: claims changed after resolving declares`)
  }
  for (let i = 0; i < claims.length; i += 1) claims[i].line = original[i].line

  let code = resolved
  // Replace from the end so earlier offsets stay valid.
  for (let i = statements.length - 1; i >= 0; i -= 1) {
    const statement = statements[i]
    const claim = claims[i]
    const start = statement.getStart()
    const end = statement.end
    const replacement =
      `__claim(${claim.line}, ${JSON.stringify(claim.expression)}, ` +
      `() => (${claim.expression}), ${claim.expected}, ${JSON.stringify(claim.mode)});`
    code = code.slice(0, start) + replacement + code.slice(end)
  }
  code = code.replace(/from\s+['"]gridla['"]/g, `from ${JSON.stringify(GRIDLA_ENTRY)}`)
  return { code: `${HARNESS}\n${code}`, claims }
}

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'gridla-claims-'))
const failures: Failure[] = []
const errors: { page: string; index: number; message: string }[] = []
let claimCount = 0
let blockCount = 0

for (const page of walk(DOCS_DIR)) {
  const blocks = extractBlocks(page)
  blocks.forEach((block, i) => {
    if (!importsFrom(block.code, 'gridla')) return
    if (importsFrom(block.code, 'gridla/react') || importsFrom(block.code, 'react')) return
    const transformed = transform(block, blocks.slice(0, i))
    if (!transformed) return
    blockCount += 1
    claimCount += transformed.claims.length

    const file = path.join(scratch, `${block.page.replace(/[\\/]/g, '__')}-${block.index}.ts`)
    fs.writeFileSync(file, transformed.code)
    const run = spawnSync('bun', ['run', file], { encoding: 'utf8', cwd: REPO_DIR })
    const seen = new Set<number>()
    for (const line of run.stdout.split('\n')) {
      if (!line.startsWith(MARKER)) continue
      const result = JSON.parse(line.slice(MARKER.length)) as {
        line: number
        expression: string
        expected: string
        actual: string | null
      }
      seen.add(result.line)
      if (result.actual === null) continue
      failures.push({
        page: block.page,
        line: block.startLine + result.line,
        expression: result.expression,
        expected: result.expected,
        actual: result.actual,
      })
    }
    if (run.status !== 0) {
      const stderr = run.stderr.replace(scratch, '<scratch>').trim().split('\n').slice(0, 6).join('\n')
      errors.push({ page: block.page, index: block.index, message: stderr || 'exit ' + run.status })
    } else {
      for (const claim of transformed.claims) {
        if (!seen.has(claim.line)) {
          errors.push({
            page: block.page,
            index: block.index,
            message: `claim at line ${block.startLine + claim.line} did not run`,
          })
        }
      }
    }
  })
}

fs.rmSync(scratch, { recursive: true, force: true })

if (failures.length === 0 && errors.length === 0) {
  process.stdout.write(`check-claims: ${claimCount} claims in ${blockCount} code blocks hold\n`)
  process.exit(0)
}

console.error(
  `check-claims: ${failures.length} mismatches, ${errors.length} runtime errors ` +
    `(${claimCount} claims in ${blockCount} code blocks)`,
)
for (const failure of failures) {
  console.error(`  ${failure.page}:${failure.line}: ${failure.expression}`)
  console.error(`    expected ${failure.expected}`)
  console.error(`    actual   ${failure.actual}`)
}
for (const error of errors) {
  console.error(`  ${error.page} block ${error.index}: ${error.message}`)
}
process.exit(1)
