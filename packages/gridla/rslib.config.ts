import { pluginReact } from '@rsbuild/plugin-react'
import { defineConfig } from '@rslib/core'

export default defineConfig({
  plugins: [pluginReact({ swcReactOptions: { runtime: 'automatic' } })],
  source: {
    entry: {
      index: './src/index.ts',
      react: './src/react.ts',
      interaction: './src/interaction.ts',
    },
    tsconfigPath: './tsconfig.build.json',
  },
  lib: [
    {
      format: 'esm',
      syntax: 'es2022',
      bundle: true,
      dts: {
        bundle: true,
      },
      output: {
        distPath: {
          root: './dist',
        },
        sourceMap: true,
        minify: false,
      },
    },
  ],
  output: {
    target: 'web',
    externals: ['react', 'react/jsx-runtime', 'react-dom'],
  },
})
