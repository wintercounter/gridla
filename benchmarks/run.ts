/**
 * Micro-benchmarks for the core solver, projection, and nesting hot paths.
 *
 *   bun run benchmarks/run.ts                  # run everything
 *   bun run benchmarks/run.ts --filter move    # only cases whose name contains "move"
 *   bun run benchmarks/run.ts --json out.json  # also write results as JSON
 *   bun run benchmarks/run.ts --check          # exit 1 if a median exceeds budget.json
 *   bun run benchmarks/run.ts --write-budget   # regenerate budget.json (median x 2.5)
 *
 * No third-party timing library: each iteration is timed with
 * `Bun.nanoseconds()` (falling back to `performance.now()`), the case is
 * warmed up for a fixed time and then sampled for a fixed time budget.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  applyGap,
  compactLayout,
  flattenLayout,
  moveItem,
  placeItem,
  projectLayout,
  resizeItem,
  transferItem,
  type GridLayout,
  type GridNode,
  type SolveStrategy,
} from 'gridla'

import {
  CHAIN_ITEM_WIDTH,
  DASHBOARD_GAP,
  ITEM_COUNTS,
  collisionChainLayout,
  countNodes,
  dashboardLayout,
  freeDropTarget,
  nestedTree,
  overflowingLayout,
  packedLayout,
  sparseLayout,
} from './fixtures'

// --- CLI -------------------------------------------------------------------

type CliOptions = {
  filter: string | null
  json: string | null
  check: boolean
  writeBudget: boolean
  warmupMs: number
  measureMs: number
}

function parseArgs(argv: readonly string[]): CliOptions {
  const options: CliOptions = {
    filter: null,
    json: null,
    check: false,
    writeBudget: false,
    warmupMs: 100,
    measureMs: 500,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = () => {
      const value = argv[index + 1]
      if (value === undefined) throw new Error(`${arg} expects a value`)
      index += 1
      return value
    }
    switch (arg) {
      case '--filter':
        options.filter = next()
        break
      case '--json':
        options.json = next()
        break
      case '--check':
        options.check = true
        break
      case '--write-budget':
        options.writeBudget = true
        break
      case '--warmup':
        options.warmupMs = Number(next())
        break
      case '--time':
        options.measureMs = Number(next())
        break
      default:
        throw new Error(`Unknown argument: ${arg}`)
    }
  }
  return options
}

// --- Timing ----------------------------------------------------------------

const nowNs: () => number =
  typeof Bun !== 'undefined' && typeof Bun.nanoseconds === 'function'
    ? () => Bun.nanoseconds()
    : () => performance.now() * 1e6

function collectGarbage(): void {
  if (typeof Bun !== 'undefined' && typeof Bun.gc === 'function') Bun.gc(true)
}

/** Keeps the optimizer from discarding results. */
let sink: unknown = null

export type BenchResult = {
  name: string
  item_count: number
  median_ms: number
  p95_ms: number
  ops_per_sec: number
  samples: number
  /** Heap growth per call in bytes over 1000 iterations, or `null` when skipped. */
  heap_bytes_per_op: number | null
}

type BenchCase = {
  name: string
  itemCount: number
  run: () => unknown
}

function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return 0
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))
  return sorted[index]
}

function runFor(fn: () => unknown, budgetNs: number, samples: number[] | null): void {
  const end = nowNs() + budgetNs
  do {
    const start = nowNs()
    sink = fn()
    const elapsed = nowNs() - start
    if (samples) samples.push(elapsed)
  } while (nowNs() < end)
}

/**
 * Rough allocation proxy: heap growth per call over 1000 iterations, best of
 * three rounds. A collection that runs mid-round hides growth, so the largest
 * round is the most informative. Skipped when the case is too slow for 1000
 * iterations to stay cheap.
 */
function measureHeap(fn: () => unknown, medianNs: number): number | null {
  const iterations = 1000
  if (medianNs * iterations > 250_000_000) return null
  let best = 0
  for (let round = 0; round < 3; round += 1) {
    collectGarbage()
    const before = process.memoryUsage().heapUsed
    for (let index = 0; index < iterations; index += 1) sink = fn()
    const after = process.memoryUsage().heapUsed
    best = Math.max(best, Math.round((after - before) / iterations))
  }
  return best
}

function benchmark(bench: BenchCase, options: CliOptions): BenchResult {
  runFor(bench.run, options.warmupMs * 1e6, null)
  const samples: number[] = []
  runFor(bench.run, options.measureMs * 1e6, samples)
  samples.sort((a, b) => a - b)
  const medianNs = percentile(samples, 0.5)
  const p95Ns = percentile(samples, 0.95)
  const totalNs = samples.reduce((sum, value) => sum + value, 0)
  return {
    name: bench.name,
    item_count: bench.itemCount,
    median_ms: medianNs / 1e6,
    p95_ms: p95Ns / 1e6,
    ops_per_sec: totalNs > 0 ? (samples.length * 1e9) / totalNs : 0,
    samples: samples.length,
    heap_bytes_per_op: measureHeap(bench.run, medianNs),
  }
}

// --- Cases -----------------------------------------------------------------

/**
 * Guard that a fixture exercises the code path its case name promises. A
 * fixture that silently drifts into a rejection or a different strategy would
 * otherwise still produce plausible numbers.
 */
function requireStrategy(
  label: string,
  result: { accepted: boolean; strategy: SolveStrategy },
  expected: readonly SolveStrategy[],
): void {
  if (!result.accepted) {
    throw new Error(
      `Fixture for "${label}" is rejected by the solver; the case would measure a rejection`,
    )
  }
  if (!expected.includes(result.strategy)) {
    throw new Error(
      `Fixture for "${label}" resolved via "${result.strategy}", expected one of: ${expected.join(', ')}`,
    )
  }
}

function cellSize(layout: GridLayout, id: string): { w: number; h: number } {
  const item = layout.items.find((entry) => entry.id === id)
  if (!item) throw new Error(`Fixture is missing item ${id}`)
  return { w: item.w, h: item.h }
}

function buildCases(): BenchCase[] {
  const cases: BenchCase[] = []

  for (const count of ITEM_COUNTS) {
    const dashboard = dashboardLayout(count)
    const sparse = sparseLayout(count)
    const chain = collisionChainLayout(count)
    const packed = packedLayout(count)
    const overflowing = overflowingLayout(count)
    const emptyCell = freeDropTarget(count)
    const slot = cellSize(packed, 'slot-0')
    // Nearest same-size item outside the first row and column, so the move
    // resolves as a swap rather than a row push.
    const first = packed.items[0]
    const diagonal =
      packed.items.find(
        (item) => item.x > first.x && item.y > first.y && item.w === first.w && item.h === first.h,
      ) ?? packed.items[1]
    const solveOptions = { gap: 0, snap: false }

    const freeDrop = () =>
      moveItem({
        layout: sparse,
        itemId: 'tile-0',
        position: { x: sparse.canvas.width - 400, y: sparse.canvas.height - 250 },
        options: solveOptions,
      })
    const chainInsert = () =>
      moveItem({ layout: dashboard, itemId: 'tile-0', position: emptyCell, options: solveOptions })
    const pushCascade = () =>
      moveItem({
        layout: chain,
        itemId: 'link-0',
        position: { x: CHAIN_ITEM_WIDTH / 2, y: 0 },
        options: solveOptions,
      })
    const swap = () =>
      moveItem({
        layout: packed,
        itemId: 'slot-0',
        position: { x: diagonal.x + 5, y: diagonal.y + 5 },
        options: solveOptions,
      })
    const resize = () =>
      resizeItem({
        layout: dashboard,
        itemId: 'tile-0',
        edge: 'e',
        delta: { x: Math.round(dashboard.items[0].w * 0.5), y: 0 },
        options: { gap: DASHBOARD_GAP, snap: false },
      })
    const placeAtPosition = () =>
      placeItem({
        layout: packed,
        item: { id: 'inserted', w: Math.round(slot.w / 2), h: Math.round(slot.h / 2) },
        position: { x: 0, y: 0 },
        options: solveOptions,
      })
    const placeAtPointer = () =>
      placeItem({
        layout: packed,
        item: { id: 'inserted', w: slot.w, h: slot.h },
        pointer: { x: packed.canvas.width / 2, y: packed.canvas.height / 2 },
        options: solveOptions,
      })

    requireStrategy(`moveItem free drop ${count}`, freeDrop(), ['free'])
    // Moving a tile into the empty cell resolves through a lane insertion for
    // small layouts and through a plain free drop once the lanes are wide
    // enough; both exercise the same sibling scan.
    requireStrategy(`moveItem chain insert ${count}`, chainInsert(), [
      'insert-row',
      'insert-column',
      'fit-open-slot',
      'free',
    ])
    requireStrategy(`moveItem push cascade ${count}`, pushCascade(), ['push-x'])
    requireStrategy(`moveItem swap ${count}`, swap(), ['swap'])
    requireStrategy(`resizeItem ${count}`, resize(), ['resize-shrink-neighbors'])
    requireStrategy(`placeItem position ${count}`, placeAtPosition(), ['trim-neighbor'])
    requireStrategy(`placeItem pointer ${count}`, placeAtPointer(), [
      'pointer-scaled',
      'pointer-push',
      'pointer-shrink-siblings',
    ])

    const viewport = { width: 1200, height: 720 }
    cases.push(
      { name: 'moveItem free drop', itemCount: count, run: freeDrop },
      { name: 'moveItem chain insert', itemCount: count, run: chainInsert },
      { name: 'moveItem push cascade', itemCount: count, run: pushCascade },
      { name: 'moveItem swap packed', itemCount: count, run: swap },
      { name: 'resizeItem east edge', itemCount: count, run: resize },
      { name: 'placeItem position packed', itemCount: count, run: placeAtPosition },
      { name: 'placeItem pointer packed', itemCount: count, run: placeAtPointer },
      {
        name: 'projectLayout chain',
        itemCount: count,
        run: () => projectLayout(dashboard, viewport, { strategy: 'chain', gap: DASHBOARD_GAP }),
      },
      {
        name: 'projectLayout segments',
        itemCount: count,
        run: () => projectLayout(dashboard, viewport, { strategy: 'segments' }),
      },
      { name: 'compactLayout', itemCount: count, run: () => compactLayout(overflowing) },
      {
        name: 'applyGap',
        itemCount: count,
        run: () => applyGap(dashboard, 16, { recognizedGaps: [DASHBOARD_GAP] }),
      },
    )
  }

  const rootRect = { x: 0, y: 0, w: 1600, h: 1000 }
  const trees: Array<[GridNode, string]> = [
    [nestedTree(3, 4), 'depth 3 breadth 4'],
    [nestedTree(4, 4), 'depth 4 breadth 4'],
  ]
  for (const [tree, label] of trees) {
    cases.push({
      name: `flattenLayout ${label}`,
      itemCount: countNodes(tree),
      run: () => flattenLayout(tree, rootRect),
    })
  }

  // Cross-container drop: take a leaf out of one container and drop it into a
  // sibling container, sized by the ratio of the two canvases.
  const tree = nestedTree(3, 4)
  const flat = flattenLayout(tree, rootRect)
  const source = flat.itemsById.get('group-0')?.layout
  const destination = flat.itemsById.get('group-1')?.layout
  if (!source || !destination) throw new Error('Nested fixture is missing containers')
  const transfer = () =>
    transferItem({
      source,
      target: destination,
      itemId: 'group-0-0',
      pointer: { x: destination.canvas.width / 2, y: destination.canvas.height / 2 },
      options: { gap: 6, snap: false },
    })
  requireStrategy('transferItem', transfer(), [
    'pointer-scaled',
    'pointer-push',
    'pointer-shrink-siblings',
    'pointer-slide',
  ])
  cases.push({
    name: 'transferItem between containers',
    itemCount: source.items.length + destination.items.length,
    run: transfer,
  })

  return cases
}

// --- Reporting -------------------------------------------------------------

function caseKey(result: Pick<BenchResult, 'name' | 'item_count'>): string {
  return `${result.name} [${result.item_count}]`
}

function formatMs(value: number): string {
  if (value < 0.01) return value.toFixed(4)
  if (value < 1) return value.toFixed(3)
  return value.toFixed(2)
}

function formatBytes(value: number | null): string {
  if (value === null) return '-'
  if (value < 1024) return `${value} B`
  return `${(value / 1024).toFixed(1)} KB`
}

function printTable(results: readonly BenchResult[], budget: Record<string, number> | null): void {
  const rows = results.map((result) => ({
    name: result.name,
    items: String(result.item_count),
    median: formatMs(result.median_ms),
    p95: formatMs(result.p95_ms),
    ops: Math.round(result.ops_per_sec).toLocaleString('en-US'),
    heap: formatBytes(result.heap_bytes_per_op),
    budget: budget ? formatMs(budget[caseKey(result)] ?? Number.NaN) : '',
  }))
  const header = {
    name: 'case',
    items: 'items',
    median: 'median ms',
    p95: 'p95 ms',
    ops: 'ops/s',
    heap: 'heap/op',
    budget: budget ? 'budget ms' : '',
  }
  const columns = (['name', 'items', 'median', 'p95', 'ops', 'heap', 'budget'] as const).filter(
    (column) => header[column] !== '',
  )
  const widths = Object.fromEntries(
    columns.map((column) => [
      column,
      Math.max(header[column].length, ...rows.map((row) => row[column].length)),
    ]),
  ) as Record<(typeof columns)[number], number>
  const line = (row: typeof header) =>
    columns
      .map((column) =>
        column === 'name'
          ? row[column].padEnd(widths[column])
          : row[column].padStart(widths[column]),
      )
      .join('  ')
  console.log(line(header))
  console.log(columns.map((column) => '-'.repeat(widths[column])).join('  '))
  for (const row of rows) console.log(line(row))
}

function checkBudget(results: readonly BenchResult[], budget: Record<string, number>): boolean {
  let ok = true
  for (const result of results) {
    const key = caseKey(result)
    const limit = budget[key]
    if (limit === undefined) {
      console.warn(`no budget entry for "${key}"`)
      continue
    }
    if (result.median_ms > limit) {
      ok = false
      console.error(
        `BUDGET EXCEEDED: "${key}" median ${formatMs(result.median_ms)} ms > ${formatMs(limit)} ms`,
      )
    }
  }
  return ok
}

// --- Main ------------------------------------------------------------------

function main(): void {
  const options = parseArgs(process.argv.slice(2))
  const here = dirname(fileURLToPath(import.meta.url))
  const budgetPath = join(here, 'budget.json')

  let budget: Record<string, number> | null = null
  if (options.check) {
    budget = JSON.parse(readFileSync(budgetPath, 'utf8')) as Record<string, number>
  }

  const cases = buildCases().filter(
    (bench) => options.filter === null || caseKey(bench as never).includes(options.filter),
  )
  if (cases.length === 0) {
    console.error(`No cases match filter "${options.filter}"`)
    process.exit(2)
  }

  console.log(
    `${cases.length} cases, warmup ${options.warmupMs} ms, measure ${options.measureMs} ms each` +
      ` (${typeof Bun !== 'undefined' ? `bun ${Bun.version}` : 'node'})`,
  )
  const results: BenchResult[] = []
  for (const bench of cases) results.push(benchmark(bench, options))
  console.log()
  printTable(results, budget)
  if (process.env.BENCH_DUMP_SINK) console.log(sink)

  if (options.json) {
    const output = results.map(({ name, median_ms, p95_ms, ops_per_sec, item_count }) => ({
      name,
      median_ms,
      p95_ms,
      ops_per_sec,
      item_count,
    }))
    writeFileSync(options.json, `${JSON.stringify(output, null, 2)}\n`)
    console.log(`\nwrote ${options.json}`)
  }

  if (options.writeBudget) {
    const next: Record<string, number> = {}
    for (const result of results) {
      const limit = result.median_ms * 2.5
      next[caseKey(result)] = limit < 0.01 ? Number(limit.toFixed(4)) : Number(limit.toFixed(3))
    }
    writeFileSync(budgetPath, `${JSON.stringify(next, null, 2)}\n`)
    console.log(`\nwrote ${budgetPath}`)
  }

  if (budget && !checkBudget(results, budget)) process.exit(1)
}

main()
