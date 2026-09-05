import { resolve } from 'node:path'

import { defineConfig } from '@rsbuild/core'

// Port allocation for adapter demo apps lives in tests/e2e/PORT-LEDGER.md.
//
// The app compiles Angular templates at runtime (JIT: `@angular/compiler` is
// imported first in `src/main.ts`) so it builds with Rsbuild alone, without the
// Angular CLI. The Angular packages are development dependencies of
// `packages/gridla`; that package's `node_modules` is added to the resolution
// roots so the demo shares the single installed copy with the built adapter.
const packageModules = resolve(import.meta.dirname, '../../../packages/gridla/node_modules')

export default defineConfig({
  html: { template: './index.html', favicon: '../../../assets/favicon.svg' },
  source: {
    entry: { index: './src/main.ts' },
    include: [resolve(import.meta.dirname, '../../shared')],
    // Angular reads its decorators through the legacy (TypeScript) protocol.
    decorators: { version: 'legacy' },
  },
  output: { assetPrefix: process.env.ASSET_PREFIX ?? '/' },
  server: { port: 3015 },
  tools: {
    rspack: {
      resolve: { modules: [packageModules, 'node_modules'] },
    },
  },
})
