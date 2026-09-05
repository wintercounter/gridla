import { defineConfig, rspack } from '@rsbuild/core'
import { pluginSvelte } from '@rsbuild/plugin-svelte'
import type { PreprocessorGroup } from 'svelte/compiler'

/**
 * Strip TypeScript from `<script lang="ts">` with the SWC that ships inside
 * Rspack. The plugin's default (`svelte-preprocess`) needs the TypeScript
 * compiler API, which the repository's TypeScript 7 toolchain does not
 * provide. `verbatimModuleSyntax` keeps imports that only the template uses.
 */
const typescript: PreprocessorGroup = {
  script({ content, attributes, filename }) {
    if (attributes.lang !== 'ts') return undefined
    const { code } = rspack.experiments.swc.transformSync(content, {
      filename,
      jsc: {
        parser: { syntax: 'typescript' },
        target: 'es2022',
        transform: { verbatimModuleSyntax: true },
      },
      sourceMaps: false,
    })
    return { code }
  },
}

// Port allocation for adapter demo apps lives in tests/e2e/PORT-LEDGER.md.
export default defineConfig({
  plugins: [pluginSvelte({ svelteLoaderOptions: { preprocess: [typescript] } })],
  html: { template: './index.html', favicon: '../../../assets/favicon.svg' },
  source: { entry: { index: './src/main.ts' } },
  output: { assetPrefix: process.env.ASSET_PREFIX ?? '/' },
  server: { port: 3013 },
})
