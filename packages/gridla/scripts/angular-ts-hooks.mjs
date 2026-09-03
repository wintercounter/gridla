/**
 * Module resolution hooks for the Angular build. The repository's root
 * `typescript` is the 7.x native preview, which ships `tsc` only. The Angular
 * compiler (and ng-packagr) need the 5.x JavaScript API, so every request for
 * `typescript` is redirected to a 5.x installation found in the workspace.
 * Loaded with `node --import` by `build-angular.mjs`; covers CommonJS
 * `require()` (ng-packagr) and ESM `import` (@angular/compiler-cli).
 */
import { existsSync, readFileSync } from 'node:fs'
import Module, { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const packageRoot = resolve(here, '..')
const repoRoot = resolve(packageRoot, '../..')

function findTypescript5() {
  const candidates = [
    process.env.GRIDLA_TYPESCRIPT_DIR,
    join(repoRoot, 'website/node_modules/typescript'),
    join(packageRoot, 'node_modules/typescript'),
    join(repoRoot, 'node_modules/typescript'),
  ].filter(Boolean)
  for (const dir of candidates) {
    const manifest = join(dir, 'package.json')
    if (!existsSync(manifest) || !existsSync(join(dir, 'lib/typescript.js'))) continue
    const { version } = JSON.parse(readFileSync(manifest, 'utf8'))
    if (version.startsWith('5.')) return { dir, version }
  }
  throw new Error(
    'build-angular: no TypeScript 5.x with a JavaScript API found (looked in website/node_modules and packages/gridla/node_modules)',
  )
}

const ts = findTypescript5()
const tsUrl = pathToFileURL(ts.dir).href

const redirect = (specifier) =>
  specifier === 'typescript' ? ts.dir : join(ts.dir, specifier.slice('typescript/'.length))
const matches = (specifier) => specifier === 'typescript' || specifier.startsWith('typescript/')

// CommonJS: ng-packagr and rollup-plugin-dts.
// eslint-disable-next-line no-underscore-dangle
const originalResolve = Module._resolveFilename
// eslint-disable-next-line no-underscore-dangle
Module._resolveFilename = function (request, ...rest) {
  return originalResolve.call(this, matches(request) ? redirect(request) : request, ...rest)
}

// ESM: @angular/compiler-cli. `registerHooks` is synchronous and covers both
// module systems on Node 22.15+; older versions fall back to `register`.
if (typeof Module.registerHooks === 'function') {
  Module.registerHooks({
    resolve(specifier, context, next) {
      if (!matches(specifier)) return next(specifier, context)
      // An absolute path works as a specifier for both CommonJS and ESM parents.
      const require = createRequire(join(ts.dir, 'package.json'))
      return next(require.resolve(redirect(specifier)), context)
    },
  })
} else {
  const hooks = `
    const TS = ${JSON.stringify(tsUrl)};
    export async function resolve(specifier, context, next) {
      if (specifier === 'typescript') return next(TS + '/lib/typescript.js', context);
      if (specifier.startsWith('typescript/')) return next(TS + specifier.slice('typescript'.length), context);
      return next(specifier, context);
    }`
  Module.register(`data:text/javascript,${encodeURIComponent(hooks)}`, import.meta.url)
}
