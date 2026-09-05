import { resolve } from 'node:path'

import { defineConfig } from '@rsbuild/core'
import { pluginReact } from '@rsbuild/plugin-react'

// Port allocation for adapter demo apps lives in tests/e2e/PORT-LEDGER.md.
//
// Preact has no adapter of its own: `gridla/react` runs on `preact/compat`.
// The aliases below send every `react` import (the adapter's, the demo kit's,
// and the JSX runtime the compiler emits) to Preact. Absolute paths so the
// alias also applies to modules that live outside this app's directory.
const preact = (subpath: string) => resolve(import.meta.dirname, 'node_modules/preact', subpath)

export default defineConfig({
  plugins: [pluginReact()],
  html: { template: './index.html', favicon: '../../../assets/favicon.svg' },
  source: {
    entry: { index: './src/main.tsx' },
    include: [resolve(import.meta.dirname, '../../shared')],
  },
  resolve: {
    alias: {
      'react/jsx-runtime': preact('jsx-runtime'),
      'react/jsx-dev-runtime': preact('jsx-dev-runtime'),
      'react-dom/client': preact('compat/client'),
      'react-dom$': preact('compat'),
      react$: preact('compat'),
    },
  },
  output: { assetPrefix: process.env.ASSET_PREFIX ?? '/' },
  server: { port: 3016 },
})
