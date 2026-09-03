// Rspack loader that runs the Qwik optimizer over one module. Qwik needs its
// optimizer to turn `$` boundaries (`component$`, `useVisibleTask$`, `on*$`)
// into QRLs; the official Vite plugin does this per module, and so does this
// loader. With the `inline` entry strategy every QRL stays in its module, so
// the bundler needs no other Qwik-specific configuration. It handles this
// app's `.tsx` sources (transpiling TypeScript and JSX on the way) and the
// adapter's `dist/qwik.qwik.js`, which ships with its `$` calls intact.
'use strict'

const path = require('node:path')
const { createOptimizer } = require('@builder.io/qwik/optimizer')

let optimizer

module.exports = function qwikLoader(source) {
  const callback = this.async()
  const resource = this.resourcePath
  const mode = this.mode === 'development' ? 'dev' : 'prod'
  optimizer ??= createOptimizer()
  optimizer
    .then((instance) =>
      instance.transformModules({
        input: [{ path: path.basename(resource), code: source }],
        srcDir: path.dirname(resource),
        rootDir: this.rootContext,
        entryStrategy: { type: 'inline' },
        mode,
        minify: 'none',
        sourceMaps: false,
        transpileTs: true,
        transpileJsx: true,
        explicitExtensions: false,
        isServer: false,
      }),
    )
    .then((result) => {
      const errors = result.diagnostics.filter((d) => d.category === 'error')
      if (errors.length > 0) {
        throw new Error(errors.map((d) => `${resource}: ${d.message}`).join('\n'))
      }
      const output = result.modules.find((m) => m.isEntry) ?? result.modules[0]
      callback(null, output.code)
    })
    .catch(callback)
}
