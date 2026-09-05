#!/usr/bin/env node
/**
 * Build the `gridla/angular` entry with ng-packagr (partial Ivy compilation)
 * into `dist/angular/`. Runs the ng-packagr CLI in a child Node process with
 * `angular-ts-hooks.mjs` preloaded so the Angular compiler sees TypeScript 5.x
 * (see that file). Invoked by the package `build:angular` script.
 */
import { spawnSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const packageRoot = resolve(here, '..')
const require = createRequire(join(packageRoot, 'package.json'))
const cli = require.resolve('ng-packagr/src/cli/main.js')
const project = join(packageRoot, 'src/angular/ng-package.json')
const tsconfig = join(packageRoot, 'src/angular/tsconfig.angular.json')
const dest = join(packageRoot, 'dist/angular')

const result = spawnSync(
  process.execPath,
  ['--import', join(here, 'angular-ts-hooks.mjs'), cli, '-p', project, '-c', tsconfig],
  { stdio: 'inherit', cwd: packageRoot, env: { ...process.env, NG_BUILD_MANGLE: '0' } },
)
if (result.status !== 0) process.exit(result.status ?? 1)

// ng-packagr writes a manifest for a standalone library next to the bundle.
// The published package is `gridla` itself: the root package.json already
// carries the export map, `type`, and `sideEffects`, and a nested manifest
// with another name would break the bundle's self-imports of
// `gridla/interaction`. Remove it together with the stray `.npmignore`.
rmSync(join(dest, 'package.json'), { force: true })
rmSync(join(dest, '.npmignore'), { force: true })
rmSync(join(dest, 'out-tsc'), { recursive: true, force: true })
process.stdout.write('gridla/angular built into dist/angular\n')
