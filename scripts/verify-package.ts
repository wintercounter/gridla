#!/usr/bin/env bun
/**
 * Package-contract verification for `packages/gridla`.
 *
 * Builds the package, lints its manifest (publint), checks type resolution
 * (attw), packs a tarball, inspects the tarball, installs it into the consumer
 * fixtures under `tests/package/consumers/*`, runs them under Node and Bun,
 * and checks bundle hygiene (no React in the core entry, no inlined React in
 * the adapter, relative source maps, tree-shakeable core).
 *
 * Run with `bun run test:package` (or `bun run scripts/verify-package.ts`).
 * Exits non-zero when any check fails. Warnings never fail the run.
 */
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

// ---------------------------------------------------------------------------
// Paths and constants
// ---------------------------------------------------------------------------

const ROOT = path.resolve(import.meta.dir, '..')
const PKG_DIR = path.join(ROOT, 'packages/gridla')
const PKG_REL = 'packages/gridla'
const DIST = path.join(PKG_DIR, 'dist')
const CONSUMERS = path.join(ROOT, 'tests/package/consumers')

const REQUIRED_FILES = [
  'package.json',
  'LICENSE',
  'dist/index.js',
  'dist/index.d.ts',
  'dist/react.js',
  'dist/react.d.ts',
  'dist/interaction.js',
  'dist/interaction.d.ts',
  'dist/angular/fesm2022/gridla-angular.mjs',
  'dist/angular/index.d.ts',
]
const RECOMMENDED_FILES = ['README.md']
const FORBIDDEN_ENTRY = [
  { pattern: /^src\//, why: 'source directory' },
  { pattern: /(^|\/)(tests?|__tests__)\//, why: 'test directory' },
  { pattern: /\.(test|spec)\.[cm]?[jt]sx?$/, why: 'test file' },
  { pattern: /(^|\/)node_modules\//, why: 'nested node_modules' },
  { pattern: /(^|\/)tsconfig[^/]*\.json$/, why: 'tsconfig' },
  { pattern: /(^|\/)rslib\.config\./, why: 'build config' },
  { pattern: /\.tsbuildinfo$/, why: 'tsbuildinfo' },
]

/** Tree-shaken sample must be smaller than this fraction of the full core graph. */
const TREE_SHAKE_MAX_RATIO = 0.15

// ---------------------------------------------------------------------------
// Result bookkeeping
// ---------------------------------------------------------------------------

type Status = 'pass' | 'fail' | 'warn'
type Result = { name: string; status: Status; detail?: string }

const results: Result[] = []
const ICON: Record<Status, string> = { pass: 'PASS', fail: 'FAIL', warn: 'WARN' }

function record(name: string, status: Status, detail?: string): void {
  results.push({ name, status, detail })
  const line = `[${ICON[status]}] ${name}`
  console.log(detail ? `${line} - ${detail}` : line)
}

class CheckError extends Error {}

/** Run `fn` as a named check; a thrown error becomes a failure. */
async function check(name: string, fn: () => Promise<void> | void): Promise<void> {
  console.log(`\n== ${name}`)
  try {
    await fn()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    record(name, 'fail', message)
  }
}

function fail(message: string): never {
  throw new CheckError(message)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type RunOptions = { cwd?: string; env?: Record<string, string> }
type RunResult = { code: number; stdout: string; stderr: string; output: string }

function run(cmd: string[], options: RunOptions = {}): RunResult {
  const proc = Bun.spawnSync({
    cmd,
    cwd: options.cwd ?? ROOT,
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1', ...options.env },
  })
  const stdout = proc.stdout.toString()
  const stderr = proc.stderr.toString()
  return { code: proc.exitCode, stdout, stderr, output: `${stdout}${stderr}`.trim() }
}

/** Run a command and fail the current check if it exits non-zero. */
function runOrFail(cmd: string[], options: RunOptions = {}): RunResult {
  const result = run(cmd, options)
  if (result.code !== 0) {
    fail(`\`${cmd.join(' ')}\` exited with ${result.code}\n${indent(result.output)}`)
  }
  return result
}

function indent(text: string, prefix = '    '): string {
  return text
    .split('\n')
    .map((line) => `${prefix}${line}`)
    .join('\n')
}

function tail(text: string, lines: number): string {
  const all = text.split('\n')
  return all.slice(Math.max(0, all.length - lines)).join('\n')
}

function kb(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} kB`
}

function gzipSize(bytes: Uint8Array | string): number {
  const input = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : new Uint8Array(bytes)
  return Bun.gzipSync(input).byteLength
}

function readJson<T = unknown>(file: string): T {
  return JSON.parse(readFileSync(file, 'utf8')) as T
}

function isRelativeSourcePath(source: string): boolean {
  if (source.startsWith('/') || source.startsWith('\\')) return false
  if (/^[A-Za-z]:[\\/]/.test(source)) return false
  if (/^(file|webpack|rslib):/i.test(source) && !/^webpack:\/\/\.{0,2}\//.test(source)) return false
  if (source.includes('/home/') || source.includes('/Users/') || source.includes('\\Users\\')) {
    return false
  }
  return true
}

/**
 * Collect every local ESM chunk reachable from `entry` (static `import ... from
 * "./x.js"` and `export ... from "./x.js"`), including the entry itself.
 */
function localModuleGraph(entry: string): string[] {
  const seen = new Set<string>()
  const queue = [path.resolve(entry)]
  while (queue.length > 0) {
    const file = queue.pop()!
    if (seen.has(file) || !existsSync(file)) continue
    seen.add(file)
    const code = readFileSync(file, 'utf8')
    const re = /(?:import|export)\s*(?:[^'";]*?\s*from\s*)?["'](\.{1,2}\/[^"']+)["']/g
    for (const match of code.matchAll(re)) {
      queue.push(path.resolve(path.dirname(file), match[1]!))
    }
  }
  return [...seen]
}

const REACT_REFERENCE =
  /(?:from\s*|import\s*\(?\s*|require\s*\(\s*)["'](?:react|react-dom)(?:\/[^"']*)?["']/
const JSX_RUNTIME = /react\/jsx(?:-dev)?-runtime/
const INLINED_REACT_MARKERS = [
  'Symbol.for("react.',
  "Symbol.for('react.",
  'react.transitional.element',
  '__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE',
  '__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED',
  'ReactCurrentDispatcher',
]

// ---------------------------------------------------------------------------
// Shared state between checks
// ---------------------------------------------------------------------------

const tmp = mkdtempSync(path.join(tmpdir(), 'gridla-verify-'))
let tarball = ''
let tarEntries: string[] = []
const extractDir = path.join(tmp, 'extract')
/** Root of the extracted tarball (`<extract>/package`). */
let packageRoot = ''

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

await check('build', () => {
  const result = runOrFail(['bun', 'run', '--filter', 'gridla', 'build'])
  console.log(indent(tail(result.output, 8)))
  for (const file of [
    'index.js',
    'index.d.ts',
    'react.js',
    'react.d.ts',
    'interaction.js',
    'interaction.d.ts',
  ]) {
    if (!existsSync(path.join(DIST, file))) fail(`build did not produce dist/${file}`)
  }
  record('build', 'pass', 'rslib build produced dist/{index,react,interaction}.{js,d.ts}')
})

await check('publint', () => {
  const result = run(['bunx', 'publint', PKG_REL])
  console.log(indent(result.output))
  if (result.code !== 0) fail('publint reported errors')
  record('publint', 'pass')
})

await check('attw', () => {
  // ESM-only package: node10 and node16-from-CJS resolutions are irrelevant by design.
  const result = run([
    'bunx',
    '--package',
    '@arethetypeswrong/cli',
    'attw',
    '--pack',
    PKG_REL,
    '--profile',
    'esm-only',
    // `gridla/base.css` is a stylesheet export; attw only understands JS entry points.
    '--exclude-entrypoints',
    'base.css',
    '--format',
    'ascii',
  ])
  console.log(indent(result.output))
  if (result.code !== 0) fail('attw reported problems (profile: esm-only)')
  record('attw', 'pass', 'types resolve under bundler and node16 ESM')
})

await check('pack', () => {
  const dest = path.join(tmp, 'pack')
  mkdirSync(dest, { recursive: true })
  const result = runOrFail(['bun', 'pm', 'pack', '--destination', dest], { cwd: PKG_DIR })
  const tgz = readdirSync(dest).filter((name) => name.endsWith('.tgz'))
  if (tgz.length !== 1) {
    fail(`expected one tarball in ${dest}, found ${tgz.length}\n${indent(result.output)}`)
  }
  tarball = path.join(dest, tgz[0]!)
  const list = runOrFail(['tar', 'tzf', tarball])
  tarEntries = list.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((entry) => entry.replace(/^package\//, ''))
  mkdirSync(extractDir, { recursive: true })
  runOrFail(['tar', 'xzf', tarball, '-C', extractDir])
  packageRoot = path.join(extractDir, 'package')
  if (!existsSync(path.join(packageRoot, 'package.json'))) {
    fail('tarball did not extract to package/package.json')
  }
  const size = Bun.file(tarball).size
  record('pack', 'pass', `${path.basename(tarball)} (${kb(size)}, ${tarEntries.length} files)`)
})

await check('tarball contents', () => {
  if (!tarball) fail('no tarball (pack failed)')
  const problems: string[] = []
  const warnings: string[] = []
  const entries = new Set(tarEntries)

  for (const file of REQUIRED_FILES) {
    if (!entries.has(file)) problems.push(`missing required file: ${file}`)
  }
  for (const file of RECOMMENDED_FILES) {
    if (!entries.has(file)) warnings.push(`missing ${file} (warning until it exists)`)
  }
  for (const entry of tarEntries) {
    for (const { pattern, why } of FORBIDDEN_ENTRY) {
      if (pattern.test(entry)) problems.push(`forbidden entry (${why}): ${entry}`)
    }
  }

  // Every local chunk referenced from a shipped JS file must ship too.
  for (const entry of tarEntries.filter((name) => /^dist\/.*\.js$/.test(name))) {
    const code = readFileSync(path.join(packageRoot, entry), 'utf8')
    const re = /(?:import|export)\s*(?:[^'";]*?\s*from\s*)?["'](\.{1,2}\/[^"']+)["']/g
    for (const match of code.matchAll(re)) {
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(entry), match[1]!))
      if (!entries.has(target)) problems.push(`${entry} imports ${match[1]} which is not packed`)
    }
  }

  // Zero runtime dependencies.
  const manifest = readJson<{
    name: string
    dependencies?: Record<string, string>
    peerDependencies?: Record<string, string>
    exports?: Record<string, unknown>
  }>(path.join(packageRoot, 'package.json'))
  const deps = Object.keys(manifest.dependencies ?? {})
  if (deps.length > 0) problems.push(`dependencies must be empty, found: ${deps.join(', ')}`)
  if (!manifest.peerDependencies?.react)
    problems.push('react must stay an (optional) peer dependency')

  // Every export target must exist in the tarball.
  const targets: string[] = []
  const collect = (value: unknown): void => {
    if (typeof value === 'string') targets.push(value)
    else if (value && typeof value === 'object') Object.values(value).forEach(collect)
  }
  collect(manifest.exports)
  for (const target of targets) {
    const rel = target.replace(/^\.\//, '')
    if (!entries.has(rel)) problems.push(`exports target not packed: ${target}`)
  }

  for (const warning of warnings) record('tarball contents', 'warn', warning)
  if (problems.length > 0) fail(problems.join('\n'))
  record(
    'tarball contents',
    'pass',
    `required files present, no src/tests/config, zero dependencies, ${targets.length} export targets resolve`,
  )
})

await check('source maps', () => {
  if (!packageRoot) fail('no extracted tarball')
  const problems: string[] = []
  const jsFiles = tarEntries.filter((name) => /^dist\/.*\.js$/.test(name))
  const maps = tarEntries.filter((name) => name.endsWith('.js.map'))
  if (jsFiles.length === 0) problems.push('no JS files found in dist')
  for (const js of jsFiles) {
    // `dist/svelte/` is Svelte source packaged by `@sveltejs/package` (TypeScript
    // stripped, no bundling); the consumer's bundler compiles it, and the
    // packager emits no maps.
    if (js.startsWith('dist/svelte/')) continue
    const map = `${js}.map`
    if (!tarEntries.includes(map)) {
      problems.push(`missing source map for ${js}`)
      continue
    }
    const code = readFileSync(path.join(packageRoot, js), 'utf8')
    const expected = `//# sourceMappingURL=${path.posix.basename(map)}`
    if (!code.includes(expected)) problems.push(`${js} does not end with "${expected}"`)
  }
  for (const map of maps) {
    const parsed = readJson<{ sources?: string[]; file?: string; sourceRoot?: string }>(
      path.join(packageRoot, map),
    )
    if (parsed.sourceRoot && !isRelativeSourcePath(parsed.sourceRoot)) {
      problems.push(`${map}: absolute sourceRoot "${parsed.sourceRoot}"`)
    }
    for (const source of parsed.sources ?? []) {
      if (!isRelativeSourcePath(source)) problems.push(`${map}: absolute source "${source}"`)
    }
  }
  if (problems.length > 0) fail(problems.join('\n'))
  const sourceCount = maps.reduce(
    (sum, map) =>
      sum + (readJson<{ sources?: string[] }>(path.join(packageRoot, map)).sources?.length ?? 0),
    0,
  )
  record('source maps', 'pass', `${maps.length} maps, ${sourceCount} relative sources`)
})

await check('core and interaction entries are React-free', () => {
  if (!packageRoot) fail('no extracted tarball')
  const graph = [
    ...new Set([
      ...localModuleGraph(path.join(packageRoot, 'dist/index.js')),
      ...localModuleGraph(path.join(packageRoot, 'dist/interaction.js')),
    ]),
  ]
  const problems: string[] = []
  for (const file of graph) {
    const code = readFileSync(file, 'utf8')
    const rel = path.relative(packageRoot, file)
    const reactRef = code.match(REACT_REFERENCE)
    if (reactRef) problems.push(`${rel} references React: ${reactRef[0]}`)
    if (JSX_RUNTIME.test(code)) problems.push(`${rel} references react/jsx-runtime`)
    for (const marker of INLINED_REACT_MARKERS) {
      if (code.includes(marker)) problems.push(`${rel} contains inlined React marker ${marker}`)
    }
  }
  if (problems.length > 0) fail(problems.join('\n'))
  const files = graph.map((file) => path.relative(packageRoot, file)).join(', ')
  record('core and interaction entries are React-free', 'pass', `checked ${files}`)
})

await check('react entry keeps React external', () => {
  if (!packageRoot) fail('no extracted tarball')
  const entry = path.join(packageRoot, 'dist/react.js')
  const code = readFileSync(entry, 'utf8')
  const problems: string[] = []
  if (!/(?:import|export)\s*[^'";]*?\s*from\s*["']react["']/.test(code)) {
    problems.push('dist/react.js does not import from the external "react" module')
  }
  for (const marker of INLINED_REACT_MARKERS) {
    if (code.includes(marker))
      problems.push(`dist/react.js contains inlined React marker ${marker}`)
  }
  // Chunks shared with the core entry must stay React-free too.
  for (const file of localModuleGraph(entry)) {
    if (file === entry) continue
    const chunk = readFileSync(file, 'utf8')
    if (REACT_REFERENCE.test(chunk) || JSX_RUNTIME.test(chunk)) {
      problems.push(`${path.relative(packageRoot, file)} (shared chunk) references React`)
    }
  }
  if (problems.length > 0) fail(problems.join('\n'))
  const bareImports = [...code.matchAll(/from\s*["']([^./"'][^"']*)["']/g)].map((m) => m[1])
  record(
    'react entry keeps React external',
    'pass',
    `externals: ${[...new Set(bareImports)].join(', ')}`,
  )
})

type Fixture = {
  name: string
  runs: string[][]
  needsReact: boolean
  typecheck: boolean
  /** Package name `react` must resolve to inside the fixture (e.g. a preact/compat alias). */
  reactAlias?: string
}
const FIXTURES: Fixture[] = [
  {
    name: 'vanilla-esm',
    runs: [
      ['node', 'main.mjs'],
      ['bun', 'main.mjs'],
    ],
    needsReact: false,
    typecheck: false,
  },
  { name: 'react-consumer', runs: [['bun', 'main.tsx']], needsReact: true, typecheck: true },
  {
    name: 'preact-consumer',
    runs: [['bun', 'main.tsx']],
    needsReact: false,
    typecheck: true,
    reactAlias: '@preact/compat',
  },
]

/**
 * Install the packed tarball into `<fixture>/node_modules/gridla`.
 *
 * The fixtures are members of the root bun workspace, so `bun add <tarball>`
 * or `npm install <tarball>` inside them would rewrite the root lockfile (and
 * `gridla` would otherwise resolve to the workspace source). Extracting the
 * tarball is exactly what a package manager does for a zero-dependency
 * tarball, and Node's nearest-`node_modules` resolution guarantees the fixture
 * imports the packed copy, which the check below verifies.
 */
function installTarball(fixtureDir: string): string {
  const target = path.join(fixtureDir, 'node_modules', 'gridla')
  rmSync(target, { recursive: true, force: true })
  mkdirSync(target, { recursive: true })
  runOrFail(['tar', 'xzf', tarball, '--strip-components=1', '-C', target])
  return target
}

function resolveFrom(cwd: string, specifier: string, runtime: 'node' | 'bun'): string {
  const script = `console.log(import.meta.resolve(${JSON.stringify(specifier)}))`
  const cmd =
    runtime === 'node' ? ['node', '--input-type=module', '-e', script] : ['bun', '-e', script]
  return runOrFail(cmd, { cwd }).stdout.trim()
}

async function verifyFixture(fixture: Fixture): Promise<void> {
  const label = `consumer: ${fixture.name}`
  await check(label, () => {
    if (!tarball) fail('no tarball (pack failed)')
    const dir = path.join(CONSUMERS, fixture.name)
    if (!existsSync(path.join(dir, 'package.json'))) fail(`fixture missing: ${dir}`)
    const installed = installTarball(dir)
    const expectedPrefix = Bun.pathToFileURL(installed).href

    for (const runtime of ['node', 'bun'] as const) {
      const resolved = resolveFrom(dir, 'gridla', runtime)
      if (!resolved.startsWith(expectedPrefix)) {
        fail(
          `${runtime} resolves "gridla" to ${resolved}, expected the packed copy under ${installed}`,
        )
      }
    }

    if (fixture.needsReact) {
      const manifest = readJson<{ devDependencies?: Record<string, string> }>(
        path.join(dir, 'package.json'),
      )
      const wanted = manifest.devDependencies?.react
      let resolvedReact: string
      try {
        resolvedReact = resolveFrom(dir, 'react/package.json', 'bun')
      } catch {
        fail(`react is not installed for ${fixture.name}; run \`bun install\` at the repo root`)
      }
      const actual = readJson<{ version: string }>(Bun.fileURLToPath(resolvedReact)).version
      if (wanted && actual !== wanted) {
        fail(`${fixture.name} declares react ${wanted} but resolves ${actual}`)
      }
      console.log(`    react ${actual} from ${Bun.fileURLToPath(resolvedReact)}`)
    }
    if (fixture.reactAlias) {
      // The adapter's external `react` import must land on the alias the fixture
      // declares rather than the workspace React. The path is the store realpath
      // under an isolated install, so only the manifest name is compared.
      let resolvedReact: string
      try {
        resolvedReact = resolveFrom(dir, 'react/package.json', 'bun')
      } catch {
        fail(
          `react alias is not installed for ${fixture.name}; run \`bun install\` at the repo root`,
        )
      }
      const file = Bun.fileURLToPath(resolvedReact)
      const manifest = readJson<{ name: string; version: string }>(file)
      if (manifest.name !== fixture.reactAlias) {
        fail(`${fixture.name} resolves react to ${manifest.name}, expected ${fixture.reactAlias}`)
      }
      console.log(`    react -> ${manifest.name} ${manifest.version} from ${file}`)
    }

    for (const cmd of fixture.runs) {
      const result = runOrFail(cmd, { cwd: dir })
      console.log(indent(`${cmd.join(' ')}: ${result.stdout.trim()}`))
    }
    record(label, 'pass', fixture.runs.map((cmd) => cmd.join(' ')).join(' | '))
  })

  if (fixture.typecheck) {
    // Types must resolve from the packed declarations under NodeNext resolution.
    await check(`typecheck: ${fixture.name}`, () => {
      if (!tarball) fail('no tarball (pack failed)')
      const dir = path.join(CONSUMERS, fixture.name)
      // A fixture may split its runtime tsconfig from the one used for types
      // (path mappings that tsc needs but Bun must not apply at runtime).
      const project = existsSync(path.join(dir, 'tsconfig.typecheck.json'))
        ? 'tsconfig.typecheck.json'
        : 'tsconfig.json'
      const result = run(['bunx', 'tsc', '-p', project, '--noEmit'], { cwd: dir })
      if (result.code !== 0)
        fail(`tsc (nodenext, ${project}) failed against the packed types\n${indent(result.output)}`)
      record(`typecheck: ${fixture.name}`, 'pass', `tsc --moduleResolution nodenext (${project})`)
    })
  }
}

// Fixtures run one after another: each check reports into the shared results list.
await FIXTURES.reduce(
  (previous, fixture) => previous.then(() => verifyFixture(fixture)),
  Promise.resolve(),
)

await check('import without window/document/React', () => {
  if (!tarball) fail('no tarball (pack failed)')
  const dir = path.join(CONSUMERS, 'vanilla-esm')
  const script = `
    const assert = (await import('node:assert/strict')).default
    assert.equal(typeof window, 'undefined', 'window must not exist')
    assert.equal(typeof document, 'undefined', 'document must not exist')
    assert.equal(typeof globalThis.React, 'undefined', 'React must not exist')
    const before = new Set(Object.keys(globalThis))
    const gridla = await import('gridla')
    assert.equal(typeof gridla.createItem, 'function')
    assert.equal(typeof gridla.moveItem, 'function')
    assert.equal(typeof globalThis.React, 'undefined', 'importing gridla must not define React')
    assert.equal(typeof window, 'undefined', 'importing gridla must not define window')
    const added = Object.keys(globalThis).filter((key) => !before.has(key))
    assert.deepEqual(added, [], 'importing gridla must not add globals: ' + added.join(', '))
    const loaded = (process.moduleLoadList ?? []).filter((m) => /react/i.test(m))
    assert.deepEqual(loaded, [], 'react modules must not load: ' + loaded.join(', '))
    console.log(Object.keys(gridla).length + ' exports, no globals added')
  `
  const result = runOrFail(['node', '--input-type=module', '-e', script], { cwd: dir })
  record('import without window/document/React', 'pass', result.stdout.trim())
})

await check('tree-shaking', async () => {
  const indexJs = path.join(DIST, 'index.js')
  if (!existsSync(indexJs)) fail('dist/index.js missing')
  const graph = localModuleGraph(indexJs)
  const graphBytes = graph.reduce((sum, file) => sum + Bun.file(file).size, 0)
  const graphGzip = graph.reduce((sum, file) => sum + gzipSize(readFileSync(file)), 0)
  const indexBytes = Bun.file(indexJs).size

  const workdir = path.join(tmp, 'treeshake')
  mkdirSync(workdir, { recursive: true })
  const sampleEntry = path.join(workdir, 'sample.js')
  const fullEntry = path.join(workdir, 'full.js')
  await Bun.write(sampleEntry, `export { createItem } from ${JSON.stringify(indexJs)}\n`)
  await Bun.write(fullEntry, `export * from ${JSON.stringify(indexJs)}\n`)

  const bundle = async (entry: string): Promise<string> => {
    const out = await Bun.build({
      entrypoints: [entry],
      target: 'browser',
      format: 'esm',
      minify: true,
      sourcemap: 'none',
    })
    if (!out.success) {
      fail(`Bun.build failed for ${path.basename(entry)}:\n${out.logs.map(String).join('\n')}`)
    }
    return out.outputs[0]!.text()
  }
  const sample = await bundle(sampleEntry)
  const full = await bundle(fullEntry)
  const sampleBytes = Buffer.byteLength(sample)
  const fullBytes = Buffer.byteLength(full)
  const ratio = sampleBytes / graphBytes
  const ratioMin = sampleBytes / fullBytes

  console.log(
    indent(
      [
        `dist/index.js alone:            ${kb(indexBytes)}`,
        `core graph (${graph.length} files, raw):     ${kb(graphBytes)} (gzip ${kb(graphGzip)})`,
        `core graph minified (export *): ${kb(fullBytes)} (gzip ${kb(gzipSize(full))})`,
        `createItem only (minified):     ${kb(sampleBytes)} (gzip ${kb(gzipSize(sample))})`,
        `ratio vs raw graph: ${(ratio * 100).toFixed(2)}%, vs minified graph: ${(ratioMin * 100).toFixed(2)}%`,
      ].join('\n'),
    ),
  )
  if (!sample.includes('createItem')) fail('tree-shaken sample does not export createItem')
  if (ratio >= TREE_SHAKE_MAX_RATIO) {
    fail(
      `createItem-only bundle is ${(ratio * 100).toFixed(1)}% of the core graph (limit ${TREE_SHAKE_MAX_RATIO * 100}%)`,
    )
  }
  if (ratioMin >= TREE_SHAKE_MAX_RATIO) {
    fail(
      `createItem-only bundle is ${(ratioMin * 100).toFixed(1)}% of the minified core graph (limit ${TREE_SHAKE_MAX_RATIO * 100}%)`,
    )
  }
  record(
    'tree-shaking',
    'pass',
    `createItem-only ${kb(sampleBytes)} vs core graph ${kb(graphBytes)} raw / ${kb(fullBytes)} minified (${(ratio * 100).toFixed(1)}% / ${(ratioMin * 100).toFixed(1)}%)`,
  )
})

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

const failed = results.filter((r) => r.status === 'fail')
const warned = results.filter((r) => r.status === 'warn')
const passed = results.filter((r) => r.status === 'pass')

console.log('\n== summary')
for (const result of results) {
  console.log(
    `  [${ICON[result.status]}] ${result.name}${result.detail ? ` - ${result.detail.split('\n')[0]}` : ''}`,
  )
}
console.log(`\n${passed.length} passed, ${warned.length} warnings, ${failed.length} failed`)

if (failed.length > 0) {
  console.log(`\nArtifacts kept for inspection: ${tmp}`)
  process.exit(1)
}
rmSync(tmp, { recursive: true, force: true })
