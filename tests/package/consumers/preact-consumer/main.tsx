// Preact consumer of the published `gridla` package. `react` and `react-dom`
// are aliased to `preact/compat` (package.json `npm:@preact/compat`), which is
// the documented way to run React libraries on Preact. The adapter renders
// through `preact-render-to-string`, so this also proves `gridla/react` works
// without React itself and without a DOM.
import assert from 'node:assert/strict'
import { render } from 'preact-render-to-string'
import { createItem, type GridLayout } from 'gridla'
import { GridCanvas, GridItem, GridProvider } from 'gridla/react'

assert.equal(typeof window, 'undefined', 'fixture must run without a DOM')
assert.equal(typeof document, 'undefined', 'fixture must run without a DOM')

const reactManifest = (await import('react/package.json', { with: { type: 'json' } })) as {
  default: { name: string }
}
assert.equal(reactManifest.default.name, '@preact/compat', '"react" must resolve to preact/compat')

const layout: GridLayout = {
  canvas: {
    width: 400,
    height: 300,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    heightMode: 'bounded',
  },
  items: [createItem('a', { w: 100, h: 100 }, 0, 0), createItem('b', { w: 100, h: 100 }, 200, 0)],
}

const html = render(
  <GridProvider defaultLayout={layout} responsive={false}>
    <GridCanvas style={{ height: 300 }}>
      <GridItem id="a">Item A</GridItem>
      <GridItem id="b">Item B</GridItem>
    </GridCanvas>
  </GridProvider>,
)

assert.ok(html.includes('data-gridla-canvas'), 'GridCanvas emits data-gridla-canvas')
assert.ok(html.includes('data-gridla-item="a"'), 'GridItem a emits data-gridla-item')
assert.ok(html.includes('data-gridla-item="b"'), 'GridItem b emits data-gridla-item')
assert.ok(html.includes('Item A') && html.includes('Item B'), 'children render')

console.log(`preact-consumer ok (${html.length} chars of markup)`)
