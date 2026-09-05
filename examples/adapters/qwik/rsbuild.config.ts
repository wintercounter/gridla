import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

import { defineConfig } from '@rsbuild/core'

// Port allocation for adapter demo apps lives in tests/e2e/PORT-LEDGER.md.
//
// Qwik components need the Qwik optimizer. `qwik-loader.cjs` runs it per
// module (this app's `.tsx` files and the adapter's `dist/qwik.qwik.js`), and
// the qwikloader script that dispatches events is inlined into the page.
const require = createRequire(import.meta.url)
const qwikloader = readFileSync(require.resolve('@builder.io/qwik/qwikloader.js'), 'utf8')
const src = resolve(import.meta.dirname, 'src')

export default defineConfig({
  html: {
    template: './index.html',
    templateParameters: { qwikloader },
    favicon: '../../../assets/favicon.svg',
  },
  source: { entry: { index: './src/main.tsx' } },
  tools: {
    rspack: {
      module: {
        rules: [
          {
            test: /\.tsx$/,
            include: [src],
            enforce: 'pre',
            use: [{ loader: resolve(import.meta.dirname, 'qwik-loader.cjs') }],
          },
          {
            test: /\.qwik\.[mc]?js$/,
            use: [{ loader: resolve(import.meta.dirname, 'qwik-loader.cjs') }],
          },
        ],
      },
    },
  },
  output: { assetPrefix: process.env.ASSET_PREFIX ?? '/' },
  server: { port: 3017 },
})
