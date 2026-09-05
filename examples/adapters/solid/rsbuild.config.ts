import { resolve } from 'node:path'

import { defineConfig } from '@rsbuild/core'
import { pluginBabel } from '@rsbuild/plugin-babel'
import { pluginSolid } from '@rsbuild/plugin-solid'

// Port allocation for adapter demo apps lives in tests/e2e/PORT-LEDGER.md.
//
// The adapter itself needs no compiler (`gridla/solid` is written with
// `solid-js/h`); this demo app is authored in JSX, which the Solid Babel
// preset compiles.
export default defineConfig({
  plugins: [pluginBabel({ include: /\.(?:jsx|tsx)$/ }), pluginSolid()],
  html: { template: './index.html', favicon: '../../../assets/favicon.svg' },
  source: {
    entry: { index: './src/main.tsx' },
    include: [resolve(import.meta.dirname, '../../shared')],
  },
  output: { assetPrefix: process.env.ASSET_PREFIX ?? '/' },
  server: { port: 3014 },
})
