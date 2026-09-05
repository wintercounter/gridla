/**
 * Bun preload that serves the TypeScript 5 compiler API wherever `typescript`
 * is imported. The repository's root `typescript` is the native 7.x release,
 * which ships no JavaScript compiler API; the Svelte toolchain (`svelte2tsx`,
 * used by `@sveltejs/package` for declaration emit, and `svelte-check`) needs
 * that API and refuses 7.x. The website pins TypeScript 5 for its own
 * generators, so that copy is loaded in place of the root module. Used by
 * `scripts/build-svelte.ts` and `scripts/check-svelte.ts`.
 */
import { plugin } from 'bun'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const root = resolve(import.meta.dir, '..')
const typescript5 = Bun.resolveSync('typescript', resolve(root, 'website'))
const typescript7 = Bun.resolveSync('typescript', root)
const require = createRequire(import.meta.url)

const escape = (file: string) => new RegExp(`^${file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)

if (typescript5 !== typescript7) {
  const manifest5 = Bun.resolveSync('typescript/package.json', resolve(root, 'website'))
  const manifest7 = Bun.resolveSync('typescript/package.json', root)
  plugin({
    name: 'gridla-svelte-typescript-5',
    setup(build) {
      build.onLoad({ filter: escape(typescript7) }, () => {
        // Both `import ts from 'typescript'` and `require('typescript')` are in use.
        const typescript = require(typescript5) as Record<string, unknown>
        return { exports: { ...typescript, default: typescript }, loader: 'object' }
      })
      // `svelte-check` probes the version through `typescript/package.json`.
      build.onLoad({ filter: escape(manifest7) }, () => {
        const manifest = require(manifest5) as Record<string, unknown>
        return { exports: { ...manifest, default: manifest }, loader: 'object' }
      })
    },
  })
}
