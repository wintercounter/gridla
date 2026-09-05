import { defineConfig } from '@rsbuild/core'

export default defineConfig({
  html: { template: './index.html' },
  source: { entry: { index: './src/main.ts' } },
  output: { assetPrefix: process.env.ASSET_PREFIX ?? '/' },
  server: { port: 3001 },
})
