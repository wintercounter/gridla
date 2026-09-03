# Benchmarks

Micro-benchmarks for the core hot paths: solving moves, resizes and
placements, projecting layouts between canvas sizes, flattening nested trees,
compacting, and re-spacing. Everything runs on deterministic synthetic
fixtures, so numbers are comparable across commits on the same machine.

There is no third-party benchmark library. Each iteration is timed with
`Bun.nanoseconds()`; a case is warmed up for 100 ms, then sampled for 500 ms,
and the median, p95, and throughput of the samples are reported.

## Running

```sh
bun run bench                                   # everything (about 30 s)
bun run benchmarks/run.ts --filter moveItem     # cases whose name contains the substring
bun run benchmarks/run.ts --json results.json   # also write results as JSON
bun run benchmarks/run.ts --check               # compare medians against budget.json
bun run benchmarks/run.ts --write-budget        # regenerate budget.json from this run
bun run benchmarks/run.ts --warmup 50 --time 200  # shorter time budgets
```

`--json` writes `{ name, median_ms, p95_ms, ops_per_sec, item_count }[]`.
The `--filter` substring is matched against `"<name> [<item count>]"`, so
`--filter "[512]"` selects one size and `--filter "swap"` one operation.

## Regression budget

`budget.json` maps each case to a median limit in milliseconds: the median
measured when the file was generated, times 2.5, rounded. CI runs
`bun run benchmarks/run.ts --check`, which exits with status 1 when any
case's median exceeds its limit and prints the offending cases. Cases without
an entry produce a warning, not a failure. Regenerate the file with
`--write-budget` after an intentional change in solver cost, on the same
class of machine the numbers were taken on.

The 2.5x factor absorbs run-to-run noise and moderate hardware differences.
It is not tight enough to catch a 20 % regression; it is meant to catch
algorithmic blow-ups.

## Fixtures

All builders live in `fixtures.ts` and are seeded (mulberry32), so the
geometry is identical on every run.

| Builder                      | Shape                                                                                                                                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dashboardLayout(n)`         | `n` tiles on a 1600x1000 bounded canvas in a column grid with an 8 px gap. About 20 % of tiles span two columns, 10 % carry `minW`/`minH`, 5 % are `fixed-h`. One grid cell is always left empty. |
| `sparseLayout(n)`            | `dashboardLayout(n)` scaled into the top-left quadrant, leaving the rest of the canvas empty.                                                                                                     |
| `collisionChainLayout(n)`    | One row of `n` touching 40x200 links with 25 % slack on the right. Moving the first link right pushes every other link.                                                                           |
| `packedLayout(n)`            | Equal cells filling 1600x1000 with no gaps and no free space. The row count is the divisor of `n` closest to the canvas aspect ratio.                                                             |
| `overflowingLayout(n)`       | `dashboardLayout(n)` items on a canvas 60 % as tall, so compaction has to shrink rows.                                                                                                            |
| `nestedTree(depth, breadth)` | Balanced `GridNode` tree; every non-leaf node has `breadth` children tiled in a 1200x800 canvas with a 6 px gap. Depth 3, breadth 4 is 85 nodes; depth 4, breadth 4 is 341.                       |

Per-size cases run at 8, 32, 128, and 512 items.

## Cases

Every solver case asserts at startup that the fixture resolves through the
strategy named below. If a future change routes the fixture elsewhere the run
fails instead of silently measuring a different code path.

| Case                              | What it measures                                                                                                                                                        | Strategy                       |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `moveItem free drop`              | Drop `tile-0` of the sparse layout into open space far from every chain. Collision scan against all siblings with no displacement.                                      | `free`                         |
| `moveItem chain insert`           | Drop `tile-0` of the dashboard into the reserved empty cell, which the solver treats as joining the neighboring row or column chain.                                    | `insert-row` / `insert-column` |
| `moveItem push cascade`           | Move the first link of the collision chain half a link to the right; every other link is pushed. Worst case for the push solver.                                        | `push-x`                       |
| `moveItem swap packed`            | Move `slot-0` of the packed layout onto a same-size item in a later row and column.                                                                                     | `swap`                         |
| `resizeItem east edge`            | Drag the east edge of `tile-0` half a tile to the right with an 8 px gap; the right neighbor shrinks.                                                                   | `resize-shrink-neighbors`      |
| `placeItem position packed`       | Insert a half-cell item at the origin of the packed layout.                                                                                                             | `trim-neighbor`                |
| `placeItem pointer packed`        | Insert a full-cell item centered on the pointer in the middle of the packed layout.                                                                                     | `pointer-*`                    |
| `projectLayout chain`             | Project the dashboard from 1600x1000 to 1200x720 with the chain strategy and an 8 px preserved gap.                                                                     |                                |
| `projectLayout segments`          | Same projection with the segments strategy.                                                                                                                             |                                |
| `compactLayout`                   | Shrink the overflowing layout to fit its 600 px canvas. At 128 and 512 items minimum heights exceed the canvas, so `fits` is `false`; the cost is still representative. |                                |
| `applyGap`                        | Re-space the dashboard from an 8 px to a 16 px gap.                                                                                                                     |                                |
| `flattenLayout depth D breadth B` | Flatten the nested tree into root-relative rectangles inside a 1600x1000 root, projecting every container's children.                                                   |                                |
| `transferItem between containers` | Move a leaf from one depth-1 container of the 85-node tree into a sibling container, centered on the pointer.                                                           | `pointer-*`                    |

The `heap/op` column is a rough allocation proxy: the growth of
`process.memoryUsage().heapUsed` over 1000 calls, best of three rounds, each
preceded by a full collection. It is only attempted when 1000 calls stay
under 250 ms and reads `0 B` whenever the runtime collected inside the loop,
so treat it as a hint, not a measurement.

## Indicative results

Taken on an Intel Core i9-12900KF under WSL2 with Bun 1.3.14. These numbers
are indicative only; expect different absolute values on other machines and
some run-to-run noise on the sub-microsecond cases.

| case                            | items | median ms |  p95 ms |     ops/s |
| ------------------------------- | ----: | --------: | ------: | --------: |
| moveItem free drop              |     8 |    0.0031 |  0.0047 |   262,623 |
| moveItem chain insert           |     8 |    0.0024 |  0.0038 |   337,374 |
| moveItem push cascade           |     8 |    0.0029 |  0.0049 |   288,112 |
| moveItem swap packed            |     8 |    0.0038 |  0.0058 |   215,504 |
| resizeItem east edge            |     8 |    0.0009 |  0.0016 |   790,288 |
| placeItem position packed       |     8 |    0.0085 |   0.013 |    92,865 |
| placeItem pointer packed        |     8 |     0.040 |   0.058 |    20,948 |
| projectLayout chain             |     8 |     0.025 |   0.043 |    31,870 |
| projectLayout segments          |     8 |     0.015 |   0.023 |    54,033 |
| compactLayout                   |     8 |    0.0006 |  0.0011 | 1,252,829 |
| applyGap                        |     8 |     0.022 |   0.033 |    38,237 |
| moveItem free drop              |    32 |     0.045 |   0.064 |    19,481 |
| moveItem chain insert           |    32 |     0.018 |   0.025 |    49,126 |
| moveItem push cascade           |    32 |     0.036 |   0.047 |    25,604 |
| moveItem swap packed            |    32 |     0.017 |   0.026 |    50,917 |
| resizeItem east edge            |    32 |    0.0024 |  0.0037 |   323,772 |
| placeItem position packed       |    32 |     0.034 |   0.053 |    24,395 |
| placeItem pointer packed        |    32 |     0.579 |   0.918 |     1,577 |
| projectLayout chain             |    32 |     0.126 |   0.212 |     6,709 |
| projectLayout segments          |    32 |     0.066 |   0.102 |    12,675 |
| compactLayout                   |    32 |    0.0025 |  0.0039 |   312,099 |
| applyGap                        |    32 |     0.115 |   0.194 |     7,262 |
| moveItem free drop              |   128 |      1.35 |    1.76 |       706 |
| moveItem chain insert           |   128 |     0.099 |   0.191 |     8,213 |
| moveItem push cascade           |   128 |     0.571 |   0.959 |     1,615 |
| moveItem swap packed            |   128 |     0.172 |   0.250 |     5,306 |
| resizeItem east edge            |   128 |    0.0084 |   0.012 |    96,001 |
| placeItem position packed       |   128 |     0.284 |   0.483 |     3,192 |
| placeItem pointer packed        |   128 |     21.23 |   22.74 |        47 |
| projectLayout chain             |   128 |      1.61 |    2.41 |       583 |
| projectLayout segments          |   128 |     0.998 |    1.74 |       901 |
| compactLayout                   |   128 |    0.0076 |   0.011 |   104,785 |
| applyGap                        |   128 |     0.997 |    2.04 |       895 |
| moveItem free drop              |   512 |     37.24 |   39.74 |        27 |
| moveItem chain insert           |   512 |      1.38 |    2.02 |       685 |
| moveItem push cascade           |   512 |     11.00 |   12.08 |        91 |
| moveItem swap packed            |   512 |      1.48 |    2.45 |       603 |
| resizeItem east edge            |   512 |     0.035 |   0.057 |    22,159 |
| placeItem position packed       |   512 |      3.49 |    4.74 |       273 |
| placeItem pointer packed        |   512 |   1355.35 | 1355.35 |         1 |
| projectLayout chain             |   512 |     15.21 |   16.90 |        65 |
| projectLayout segments          |   512 |      5.61 |    7.69 |       167 |
| compactLayout                   |   512 |     0.031 |   0.046 |    26,360 |
| applyGap                        |   512 |     12.48 |   13.75 |        80 |
| flattenLayout depth 3 breadth 4 |    85 |     0.397 |   0.717 |     2,376 |
| flattenLayout depth 4 breadth 4 |   341 |      1.10 |    2.60 |       749 |
| transferItem between containers |     8 |     0.027 |   0.043 |    30,443 |

### Scaling notes

Growth factors below are median time at 512 items divided by median at 128
items; linear scaling would be 4x, quadratic 16x, cubic 64x.

- `placeItem pointer packed`: 64x (0.58 ms at 32, 21 ms at 128, 1.36 s at 512).
  Cubic growth; the pointer form's fallbacks re-solve against every sibling
  for every candidate. Interactive drops into dense layouts above roughly
  100 items will be noticeable.
- `moveItem free drop`: 28x (1.35 ms at 128, 37 ms at 512). Worse than
  quadratic even though the drop lands in open space: the chain-reorder,
  swap, and insert attempts run before the free-placement check and each
  scans all siblings.
- `moveItem push cascade`: 19x. About quadratic in the chain length, which is
  expected for a cascade where each pushed link is re-checked against the
  rest.
- `applyGap`: 12.5x; `projectLayout chain`: 9.4x; `projectLayout segments`:
  5.6x. Between linear and quadratic. Chain projection is consistently 2-3x
  the cost of segments on the same input.
- `moveItem chain insert`, `moveItem swap packed`, `placeItem position packed`:
  9-14x, roughly quadratic.
- `resizeItem east edge` and `compactLayout`: about 4x, linear.
- `flattenLayout`: 341 nodes cost 2.8x the 85-node tree, close to linear in
  node count.
