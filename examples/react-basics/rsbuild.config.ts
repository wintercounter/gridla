import { resolve } from 'node:path'

import { defineConfig } from '@rsbuild/core'
import { pluginReact } from '@rsbuild/plugin-react'

export default defineConfig({
  plugins: [pluginReact()],
  html: { template: './index.html' },
  source: {
    entry: { index: './src/main.tsx' },
    include: [resolve(import.meta.dirname, '../shared')],
  },
  output: { assetPrefix: process.env.ASSET_PREFIX ?? '/' },
  server: { port: 3002 },
})
