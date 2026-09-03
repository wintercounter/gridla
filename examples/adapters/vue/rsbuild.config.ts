import { resolve } from 'node:path'

import { defineConfig } from '@rsbuild/core'
import { pluginVue } from '@rsbuild/plugin-vue'

// Port allocation for adapter demo apps lives in tests/e2e/PORT-LEDGER.md.
export default defineConfig({
  plugins: [pluginVue()],
  html: { template: './index.html', favicon: '../../../assets/favicon.svg' },
  source: {
    entry: { index: './src/main.ts' },
    include: [resolve(import.meta.dirname, '../../shared')],
  },
  output: { assetPrefix: process.env.ASSET_PREFIX ?? '/' },
  server: { port: 3012 },
})
