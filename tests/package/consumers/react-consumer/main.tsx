// React consumer of the published `gridla` package. Renders the adapter
// components to a string with `react-dom/server`, so this also proves the
// adapter is safe to import and render without a DOM.
import assert from 'node:assert/strict'
import { renderToString } from 'react-dom/server'
import { createItem, type GridLayout } from 'gridla'
import { GridCanvas, GridItem, GridProvider } from 'gridla/react'

assert.equal(typeof window, 'undefined', 'fixture must run without a DOM')
assert.equal(typeof document, 'undefined', 'fixture must run without a DOM')

const layout: GridLayout = {
  canvas: {
    width: 400,
    height: 300,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    heightMode: 'bounded',
  },
  items: [createItem('a', { w: 100, h: 100 }, 0, 0), createItem('b', { w: 100, h: 100 }, 200, 0)],
}

const html = renderToString(
  <GridProvider defaultLayout={layout} responsive={false}>
    <GridCanvas data-testid="canvas" style={{ height: 300 }}>
      <GridItem id="a" data-testid="item-a">
        Item A
      </GridItem>
      <GridItem id="b" data-testid="item-b">
        Item B
      </GridItem>
    </GridCanvas>
  </GridProvider>,
)

assert.ok(html.includes('data-testid="canvas"'), 'GridCanvas renders its element')
assert.ok(html.includes('data-testid="item-a"'), 'GridItem a renders')
assert.ok(html.includes('data-testid="item-b"'), 'GridItem b renders')
assert.ok(html.includes('Item A') && html.includes('Item B'), 'children render')

console.log(`react-consumer ok (${html.length} chars of markup)`)
