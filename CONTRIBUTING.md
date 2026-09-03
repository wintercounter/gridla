# Contributing

Thanks for helping make Gridla better. This document covers the workflow; the
architecture notes live in the docs site under "Contributing".

## Setup

```sh
bun install
bun run check
```

`check` runs formatting (`oxfmt`), linting (`oxlint`), type checks (`tsc`),
every unit, compatibility, and property test, the library build, the package
size budget (`size-budget.json`), and the public API snapshot (`api-surface.txt`;
run `bun run check:api --update` after an intentional API change). Browser tests run with
`bun run test:e2e` after `bunx playwright install`.

## Layout of the repository

| Path                  | What lives there                                                     |
| --------------------- | -------------------------------------------------------------------- |
| `packages/gridla`     | the published package: `src/core` (engine) and `src/react` (adapter) |
| `tests/compatibility` | golden fixtures that pin solver and projection behavior              |
| `tests/invariants`    | property-based tests (bounds, overlap, conservation, determinism)    |
| `tests/react`         | adapter tests with a DOM                                             |
| `tests/e2e`           | Playwright suites against the built gallery and studio               |
| `tests/package`       | packed-tarball consumers (vanilla ESM and React)                     |
| `examples/`           | shared demo kit, basic examples, gallery, studio                     |
| `website/`            | Rspress documentation site                                           |
| `benchmarks/`         | solver and projection benchmarks with a regression budget            |

## Changing solver behavior

Solver behavior is pinned by the compatibility suite. If a change alters a
fixture's output on purpose:

1. Add a fixture that demonstrates the new behavior first.
2. Update the affected expectations in the same change, with a comment
   explaining the user-facing reason.
3. Note the change in the changeset (see below) under "Behavior".

Every strategy in `moveItem` has a gate and a name. New strategies must be
added to `SolveStrategy`, documented in the solver header comment, and covered
by at least one fixture and one property test run.

## Commits and releases

- Use [Changesets](https://github.com/changesets/changesets): run
  `bun run changeset` and describe the change for the changelog.
- Conventional commit subjects are appreciated but not enforced.
- Releases are cut from `main` by CI. Tags produce a GitHub Release, npm
  packages with provenance, and a post-publish smoke test.

## Style

Formatting and lint rules are enforced by the tools; do not hand-format.
Prefer small pure functions, explicit option objects, and names that describe
intent (`moveItem`, not `solveDrag`). Public exports need a doc comment.

## Code of conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md).
