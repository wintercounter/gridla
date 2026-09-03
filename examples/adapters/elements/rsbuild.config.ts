import { defineConfig } from '@rsbuild/core'

// Port allocation for adapter demo apps lives in tests/e2e/PORT-LEDGER.md.
export default defineConfig({
  html: { template: './index.html', favicon: '../../../assets/favicon.svg' },
  source: { entry: { index: './src/main.ts' } },
  output: { assetPrefix: process.env.ASSET_PREFIX ?? '/' },
  server: { port: 3011 },
})
